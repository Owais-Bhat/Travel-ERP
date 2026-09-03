/**
 * Platform (super-admin) console.
 *
 * Ported from Supabase to MySQL. Also hosts the EIMS institution
 * verification workflow: institutions submit documents, the platform reviews
 * and either verifies or rejects them.
 */
import express from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import db from '../lib/db.js';
import { requireSuperAdmin } from '../middleware/auth.js';
import { signToken } from './auth.js';
import { recordAuditEvent } from '../lib/audit.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { z, requiredEmail, optionalText, phone, email } from '../validation/common.js';
import { FEATURE_CATALOG, getBillingState, getPlanFeatureMap, PLAN_LIMITS } from '../saas/features.js';
import { getEffectivePlanLimits, getPlanOverride, refreshPlanOverrides } from '../saas/planOverrides.js';
import { sendInviteEmail } from '../lib/mailer.js';
import crypto from 'node:crypto';

const router = express.Router();

router.use(requireSuperAdmin);

const PLANS = ['free', 'starter', 'growth', 'pro', 'enterprise'];
const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'suspended', 'cancelled'];
const VERIFICATION_STATUSES = ['pending', 'under_review', 'verified', 'rejected'];
const FEATURE_KEYS = FEATURE_CATALOG.map((feature) => feature.key);

/** mysql2 returns JSON columns already parsed, but tolerate a string too. */
function readSettings(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function decorateInstitution(institution, { userCount = 0, studentCount = 0 } = {}) {
  const settings = readSettings(institution.settings);
  const plan = institution.subscription_plan || 'free';
  const limits = getEffectivePlanLimits(plan);

  return {
    ...institution,
    settings,
    user_count: userCount,
    student_count: studentCount,
    suspended: settings.suspended === true,
    billing_state: getBillingState({ ...institution, settings }),
    plan_limits: limits,
    over_limits: {
      users: limits.users !== null && userCount > limits.users,
      students: limits.students !== null && studentCount > limits.students,
    },
    enabled_modules: getPlanFeatureMap(plan, settings.modules || {}),
  };
}

async function loadInstitutionOrFail(institutionId, connection = db) {
  const [rows] = await connection.execute('SELECT * FROM institutions WHERE id = ?', [institutionId]);
  if (!rows[0]) throw ApiError.notFound('Institution not found');
  return rows[0];
}

async function saveSettings(institutionId, settings) {
  await db.execute('UPDATE institutions SET settings = ? WHERE id = ?', [
    JSON.stringify(settings),
    institutionId,
  ]);
}

// ------------------------------------------------------------------
// Catalog
// ------------------------------------------------------------------
router.get('/features', (req, res) => {
  res.json({ features: FEATURE_CATALOG });
});

// ------------------------------------------------------------------
// Tenants
// ------------------------------------------------------------------
router.get(
  '/institutions',
  asyncHandler(async (req, res) => {
    const [institutions] = await db.query('SELECT * FROM institutions ORDER BY created_at DESC');
    const [userCounts] = await db.query(
      'SELECT institution_id, COUNT(*) AS total FROM user_profiles WHERE institution_id IS NOT NULL GROUP BY institution_id'
    );
    const [studentCounts] = await db.query(
      'SELECT institution_id, COUNT(*) AS total FROM students GROUP BY institution_id'
    );

    const users = new Map(userCounts.map((row) => [row.institution_id, Number(row.total)]));
    const students = new Map(studentCounts.map((row) => [row.institution_id, Number(row.total)]));

    res.json({
      institutions: institutions.map((institution) =>
        decorateInstitution(institution, {
          userCount: users.get(institution.id) || 0,
          studentCount: students.get(institution.id) || 0,
        })
      ),
    });
  })
);

const createInstitutionSchema = z.object({
  name: z.string().trim().min(1).max(255),
  type: z.string().trim().max(50).default('School'),
  address: optionalText(1000),
  phone,
  email: requiredEmail,
  city: optionalText(120),
  state: optionalText(120),
  country: optionalText(120),
  website: optionalText(255),
  subscription_plan: z.enum(PLANS).default('free'),
  billingEmail: email,
  trialDays: z.coerce.number().int().min(0).max(365).default(14),
  modules: z.record(z.string(), z.boolean()).optional(),
  adminEmail: requiredEmail,
  adminPassword: z.string().min(8, 'Admin password must be at least 8 characters').max(72),
  adminFirstName: z.string().trim().min(1).max(100),
  adminLastName: optionalText(100),
});

router.post(
  '/institutions',
  validate({ body: createInstitutionSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const plan = body.subscription_plan;
    const adminEmail = body.adminEmail.toLowerCase();

    const [existingUser] = await db.execute('SELECT id FROM users WHERE email = ?', [adminEmail]);
    if (existingUser.length > 0) {
      throw ApiError.conflict('A user with that admin email already exists.');
    }

    const institutionId = uuidv4();
    const userId = uuidv4();
    const profileId = uuidv4();
    // `settings.modules` stores only the tenant's *deltas* from the plan
    // default (sparse) — never the fully resolved map. Storing the dense
    // map here used to mean every later plan change re-merged the old
    // plan's booleans back in, silently reverting the upgrade (see the fix
    // in /change-plan below for the full story).
    const moduleOverrides = body.modules || {};
    const moduleMap = getPlanFeatureMap(plan, moduleOverrides);
    const trialEndsAt = body.trialDays > 0
      ? new Date(Date.now() + body.trialDays * 24 * 60 * 60 * 1000)
      : null;

    const settings = {
      modules: moduleOverrides,
      suspended: false,
      onboarding: {
        provisioned_at: new Date().toISOString(),
        provisioned_by: req.auth?.profile?.id || null,
        checklist_dismissed_at: null,
      },
    };

    const passwordHash = await bcrypt.hash(body.adminPassword, 12);
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute(
        `INSERT INTO institutions
           (id, name, type, address, phone, email, city, state, country, website,
            billing_email, subscription_plan, subscription_status, trial_ends_at, settings)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          institutionId,
          body.name,
          body.type,
          body.address || null,
          body.phone || null,
          body.email.toLowerCase(),
          body.city || null,
          body.state || null,
          body.country || null,
          body.website || null,
          (body.billingEmail || body.email).toLowerCase(),
          plan,
          body.trialDays > 0 ? 'trialing' : 'active',
          trialEndsAt,
          JSON.stringify(settings),
        ]
      );

      await connection.execute(
        `INSERT INTO users (id, email, password_hash, email_verified_at, password_changed_at)
         VALUES (?, ?, ?, NOW(), NOW())`,
        [userId, adminEmail, passwordHash]
      );

      await connection.execute(
        `INSERT INTO user_profiles (id, user_id, institution_id, role, first_name, last_name, is_active)
         VALUES (?, ?, ?, 'institution_admin', ?, ?, 1)`,
        [profileId, userId, institutionId, body.adminFirstName, body.adminLastName || null]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const institution = await loadInstitutionOrFail(institutionId);

    await recordAuditEvent(req, {
      institutionId,
      action: 'institution.created',
      description: `Created institution ${body.name}`,
      entityType: 'institution',
      entityId: institutionId,
      severity: 'success',
      metadata: {
        plan,
        trial_days: body.trialDays,
        enabled_feature_count: Object.values(moduleMap).filter(Boolean).length,
        admin_email: adminEmail,
        admin_profile_id: profileId,
      },
    });

    res.status(201).json({
      institution: decorateInstitution(institution, { userCount: 1 }),
      admin: { id: userId, email: adminEmail, profile_id: profileId },
    });
  })
);

// ------------------------------------------------------------------
// Institution verification (EIMS)
// ------------------------------------------------------------------
router.get(
  '/verifications',
  validate({ query: z.object({ status: z.enum(VERIFICATION_STATUSES).optional() }).passthrough() }),
  asyncHandler(async (req, res) => {
    const status = req.query.status;
    const [rows] = status
      ? await db.execute(
        `SELECT i.*, (SELECT COUNT(*) FROM institution_documents d WHERE d.institution_id = i.id) AS document_count
             FROM institutions i WHERE i.verification_status = ? ORDER BY i.created_at DESC`,
        [status]
      )
      : await db.query(
        `SELECT i.*, (SELECT COUNT(*) FROM institution_documents d WHERE d.institution_id = i.id) AS document_count
             FROM institutions i ORDER BY FIELD(i.verification_status, 'under_review', 'pending', 'rejected', 'verified'), i.created_at DESC`
      );

    res.json({ institutions: rows.map((row) => ({ ...row, settings: readSettings(row.settings) })) });
  })
);

router.get(
  '/verifications/:institutionId/documents',
  validate({ params: z.object({ institutionId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const [documents] = await db.execute(
      'SELECT * FROM institution_documents WHERE institution_id = ? ORDER BY created_at DESC',
      [req.params.institutionId]
    );
    res.json({ documents });
  })
);

const verificationSchema = z.object({
  status: z.enum(VERIFICATION_STATUSES),
  notes: optionalText(2000),
  publish: z.boolean().optional(),
});

router.post(
  '/verifications/:institutionId',
  validate({ params: z.object({ institutionId: z.string().uuid() }), body: verificationSchema }),
  asyncHandler(async (req, res) => {
    const { institutionId } = req.params;
    const { status, notes, publish } = req.body;
    const previous = await loadInstitutionOrFail(institutionId);

    const verified = status === 'verified';
    await db.execute(
      `UPDATE institutions
          SET verification_status = ?,
              verification_notes  = ?,
              verified_at         = ${verified ? 'NOW()' : 'NULL'},
              verified_by         = ?,
              is_published        = ?
        WHERE id = ?`,
      [
        status,
        notes || null,
        verified ? req.auth.profile.id : null,
        publish === undefined ? (verified ? 1 : 0) : Number(Boolean(publish)),
        institutionId,
      ]
    );

    await recordAuditEvent(req, {
      institutionId,
      action: `institution.${status}`,
      description: `Verification status set to ${status}`,
      entityType: 'institution',
      entityId: institutionId,
      severity: status === 'rejected' ? 'warning' : 'success',
      metadata: { previous_status: previous.verification_status, next_status: status, notes: notes || null },
    });

    const institution = await loadInstitutionOrFail(institutionId);
    res.json({ institution: decorateInstitution(institution) });
  })
);

const reviewDocumentSchema = z.object({
  status: z.enum(['pending', 'verified', 'rejected']),
  notes: optionalText(1000),
});

router.post(
  '/documents/:documentId/review',
  validate({ params: z.object({ documentId: z.string().uuid() }), body: reviewDocumentSchema }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM institution_documents WHERE id = ?', [req.params.documentId]);
    const document = rows[0];
    if (!document) throw ApiError.notFound('Document not found');

    await db.execute(
      `UPDATE institution_documents
          SET status = ?, notes = ?, reviewed_by = ?, reviewed_at = NOW()
        WHERE id = ?`,
      [req.body.status, req.body.notes || null, req.auth.profile.id, req.params.documentId]
    );

    await recordAuditEvent(req, {
      institutionId: document.institution_id,
      action: 'institution_document.reviewed',
      description: `Marked "${document.name}" as ${req.body.status}`,
      entityType: 'institution_document',
      entityId: document.id,
      severity: req.body.status === 'rejected' ? 'warning' : 'info',
    });

    const [updated] = await db.execute('SELECT * FROM institution_documents WHERE id = ?', [req.params.documentId]);
    res.json({ document: updated[0] });
  })
);

// ------------------------------------------------------------------
// Billing + plans
// ------------------------------------------------------------------
const subscriptionSchema = z.object({
  institutionId: z.string().uuid(),
  status: z.enum(SUBSCRIPTION_STATUSES),
  billingEmail: email,
  trialEndsAt: z.string().nullable().optional(),
  currentPeriodEndsAt: z.string().nullable().optional(),
});

router.post(
  '/subscription',
  validate({ body: subscriptionSchema }),
  asyncHandler(async (req, res) => {
    const { institutionId, status, billingEmail, trialEndsAt, currentPeriodEndsAt } = req.body;
    await loadInstitutionOrFail(institutionId);

    const assignments = ['subscription_status = ?'];
    const params = [status];
    if (billingEmail != null) {
      assignments.push('billing_email = ?');
      params.push(billingEmail.toLowerCase());
    }
    if (trialEndsAt !== undefined) {
      assignments.push('trial_ends_at = ?');
      params.push(trialEndsAt || null);
    }
    if (currentPeriodEndsAt !== undefined) {
      assignments.push('current_period_ends_at = ?');
      params.push(currentPeriodEndsAt || null);
    }

    await db.execute(
      `UPDATE institutions SET ${assignments.join(', ')} WHERE id = ?`,
      [...params, institutionId]
    );

    const institution = await loadInstitutionOrFail(institutionId);

    await recordAuditEvent(req, {
      institutionId,
      action: 'subscription.updated',
      description: `Updated subscription status to ${status}`,
      entityType: 'institution',
      entityId: institutionId,
      severity: ['past_due', 'suspended', 'cancelled'].includes(status) ? 'warning' : 'info',
      metadata: { status },
    });

    res.json({ institution: decorateInstitution(institution) });
  })
);

router.post(
  '/change-plan',
  validate({ body: z.object({ institutionId: z.string().uuid(), plan: z.enum(PLANS) }) }),
  asyncHandler(async (req, res) => {
    const { institutionId, plan } = req.body;
    const current = await loadInstitutionOrFail(institutionId);

    // `settings.modules` holds only this tenant's deltas from whatever plan
    // it's on — it is never touched by a plan change. The bug this replaced:
    // writing `getPlanFeatureMap(plan, settings.modules)` baked the *fully
    // resolved* map (every key, true or false) into settings.modules. The
    // next plan change would then re-merge that dense old snapshot as the
    // "overrides" on top of the new plan — silently reverting an upgrade
    // back to the previous plan's feature set, because the old plan's
    // `false`s were now indistinguishable from a deliberate admin override.
    await db.execute('UPDATE institutions SET subscription_plan = ? WHERE id = ?', [
      plan,
      institutionId,
    ]);

    await recordAuditEvent(req, {
      institutionId,
      action: 'plan.changed',
      description: `Changed plan to ${plan}`,
      entityType: 'institution',
      entityId: institutionId,
      metadata: { previous_plan: current.subscription_plan, next_plan: plan },
    });

    const institution = await loadInstitutionOrFail(institutionId);
    res.json({ institution: decorateInstitution(institution) });
  })
);

router.post(
  '/set-feature',
  validate({
    body: z.object({
      institutionId: z.string().uuid(),
      featureKey: z.string().min(1).max(60),
      enabled: z.boolean(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { institutionId, featureKey, enabled } = req.body;
    if (!FEATURE_KEYS.includes(featureKey)) throw ApiError.badRequest('Unknown feature key');

    const current = await loadInstitutionOrFail(institutionId);
    const settings = readSettings(current.settings);
    // Merge just the one toggled key into the existing sparse overrides —
    // not the fully resolved plan map (same bug class as /change-plan
    // above: writing every key would freeze the current plan's booleans
    // in place and undo the next plan change).
    const nextSettings = {
      ...settings,
      modules: { ...(settings.modules || {}), [featureKey]: enabled },
    };

    await saveSettings(institutionId, nextSettings);

    await recordAuditEvent(req, {
      institutionId,
      action: 'feature.updated',
      description: `${enabled ? 'Enabled' : 'Disabled'} feature ${featureKey}`,
      entityType: 'feature',
      entityId: institutionId,
      metadata: { feature_key: featureKey, enabled },
    });

    const institution = await loadInstitutionOrFail(institutionId);
    res.json({ institution: decorateInstitution(institution) });
  })
);

router.post(
  '/suspend-institution',
  validate({
    body: z.object({
      institutionId: z.string().uuid(),
      suspended: z.boolean().default(true),
      reason: optionalText(500),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { institutionId, suspended, reason } = req.body;
    const current = await loadInstitutionOrFail(institutionId);
    const settings = readSettings(current.settings);

    const nextSettings = {
      ...settings,
      suspended,
      suspension_reason: reason || null,
      suspended_at: suspended ? new Date().toISOString() : null,
    };

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute('UPDATE institutions SET settings = ? WHERE id = ?', [
        JSON.stringify(nextSettings),
        institutionId,
      ]);
      // Suspending locks every tenant user out; reactivating re-enables them.
      await connection.execute(
        'UPDATE user_profiles SET is_active = ? WHERE institution_id = ?',
        [suspended ? 0 : 1, institutionId]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    await recordAuditEvent(req, {
      institutionId,
      action: suspended ? 'institution.suspended' : 'institution.reactivated',
      description: suspended ? 'Suspended institution access' : 'Reactivated institution access',
      entityType: 'institution',
      entityId: institutionId,
      severity: suspended ? 'warning' : 'success',
      metadata: { suspended, reason: reason || null },
    });

    const institution = await loadInstitutionOrFail(institutionId);
    res.json({ institution: decorateInstitution(institution) });
  })
);

// ------------------------------------------------------------------
// Telemetry
// ------------------------------------------------------------------
router.get(
  '/usage',
  asyncHandler(async (req, res) => {
    const [byInstitution] = await db.query(
      `SELECT institution_id, feature_key, COUNT(*) AS events, MAX(created_at) AS last_seen_at
         FROM feature_usage_events
        WHERE created_at >= (NOW() - INTERVAL 30 DAY)
        GROUP BY institution_id, feature_key`
    );

    const institutions = {};
    const features = {};

    for (const row of byInstitution) {
      const events = Number(row.events);
      const bucket = (institutions[row.institution_id] ||= { total_events: 0, last_seen_at: null, features: {} });
      bucket.total_events += events;
      if (!bucket.last_seen_at || row.last_seen_at > bucket.last_seen_at) bucket.last_seen_at = row.last_seen_at;
      bucket.features[row.feature_key] = { count: events, last_seen_at: row.last_seen_at };

      const feature = (features[row.feature_key] ||= { count: 0, institution_count: 0, last_seen_at: null });
      feature.count += events;
      feature.institution_count += 1;
      if (!feature.last_seen_at || row.last_seen_at > feature.last_seen_at) feature.last_seen_at = row.last_seen_at;
    }

    res.json({
      windowDays: 30,
      institutions,
      features,
      unused_features: FEATURE_KEYS.filter((key) => !features[key]),
    });
  })
);

router.get(
  '/audit',
  validate({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
      institutionId: z.string().uuid().optional(),
    }).passthrough(),
  }),
  asyncHandler(async (req, res) => {
    const { limit, institutionId } = req.query;
    const where = institutionId ? 'WHERE a.institution_id = ?' : '';
    const params = institutionId ? [institutionId] : [];

    const [events] = await db.query(
      `SELECT a.*, CASE WHEN a.institution_id IS NULL THEN 'Platform' ELSE i.name END AS institution_name
         FROM activity_log a
         LEFT JOIN institutions i ON i.id = a.institution_id
         ${where}
        ORDER BY a.created_at DESC
        LIMIT ${Number(limit)}`,
      params
    );

    res.json({ events });
  })
);

// ------------------------------------------------------------------
// Global search — institutions, users, students across every tenant.
// Scoped to super_admin only (router.use(requireSuperAdmin) above), so
// this deliberately crosses tenant boundaries that every other route in
// the app enforces.
// ------------------------------------------------------------------
router.get(
  '/search',
  validate({ query: z.object({ q: z.string().trim().min(2).max(100) }) }),
  asyncHandler(async (req, res) => {
    const term = `%${req.query.q}%`;

    const [institutionRows] = await db.query(
      `SELECT id, name, email, type FROM institutions
        WHERE name LIKE ? OR email LIKE ?
        LIMIT 10`,
      [term, term]
    );

    const [userRows] = await db.query(
      `SELECT p.id AS profile_id, p.first_name, p.last_name, p.role,
              u.email, p.institution_id, i.name AS institution_name
         FROM user_profiles p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN institutions i ON i.id = p.institution_id
        WHERE u.email LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ?
        LIMIT 10`,
      [term, term, term]
    );

    const [studentRows] = await db.query(
      `SELECT s.id, s.first_name, s.last_name, s.admission_no, s.institution_id,
              i.name AS institution_name
         FROM students s
         LEFT JOIN institutions i ON i.id = s.institution_id
        WHERE s.first_name LIKE ? OR s.last_name LIKE ? OR s.admission_no LIKE ?
        LIMIT 10`,
      [term, term, term]
    );

    res.json({
      institutions: institutionRows,
      users: userRows,
      students: studentRows,
    });
  })
);

// ------------------------------------------------------------------
// System health — lightweight operational metrics. Resilient to a down
// database (reports `database.connected: false` rather than 500ing) so
// this endpoint stays useful precisely when things are going wrong.
// ------------------------------------------------------------------
router.get(
  '/system-health',
  asyncHandler(async (req, res) => {
    const api = {
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      nodeVersion: process.version,
    };

    let database = { connected: false, activeConnections: null };
    let activity24h = { totalEvents: 0, errorEvents: 0, errorRatePercent: 0 };

    try {
      const [[threadsRows], [errorCountRows], [totalCountRows]] = await Promise.all([
        db.query("SHOW STATUS LIKE 'Threads_connected'"),
        db.query(
          `SELECT COUNT(*) AS count FROM activity_log
            WHERE severity = 'error' AND created_at >= (NOW() - INTERVAL 24 HOUR)`
        ),
        db.query(
          `SELECT COUNT(*) AS count FROM activity_log
            WHERE created_at >= (NOW() - INTERVAL 24 HOUR)`
        ),
      ]);
      database = { connected: true, activeConnections: Number(threadsRows[0]?.Value || 0) };
      const errorCount = Number(errorCountRows[0]?.count || 0);
      const totalCount = Number(totalCountRows[0]?.count || 0);
      activity24h = {
        totalEvents: totalCount,
        errorEvents: errorCount,
        errorRatePercent: totalCount > 0 ? Number(((errorCount / totalCount) * 100).toFixed(2)) : 0,
      };
    } catch {
      // Database unreachable — still report the API-level metrics above.
    }

    res.json({ api, database, activity24h });
  })
);

// ------------------------------------------------------------------
// Impersonate — mint a token for a tenant's admin so a super admin can
// see exactly what the tenant sees, for support. Every use is audited
// against the impersonated institution with severity 'warning'.
// ------------------------------------------------------------------
router.post(
  '/institutions/:id/impersonate',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const institution = await loadInstitutionOrFail(req.params.id);

    const [profiles] = await db.execute(
      `SELECT p.id AS profile_id, p.user_id, p.role, p.first_name, p.last_name, u.email
         FROM user_profiles p
         JOIN users u ON u.id = p.user_id
        WHERE p.institution_id = ? AND p.is_active = 1
          AND p.role IN ('institution_admin', 'principal')
        ORDER BY (p.role = 'institution_admin') DESC, p.created_at ASC
        LIMIT 1`,
      [institution.id]
    );

    const target = profiles[0];
    if (!target) {
      throw ApiError.notFound('No active admin found for this institution to impersonate.');
    }

    const token = signToken({ userId: target.user_id, institutionId: institution.id, role: target.role });

    await recordAuditEvent(req, {
      institutionId: institution.id,
      action: 'admin.impersonated_tenant',
      description: `Super admin started an impersonation session as ${target.email}`,
      entityType: 'user_profile',
      entityId: target.profile_id,
      severity: 'warning',
      metadata: { impersonated_email: target.email, impersonated_role: target.role },
    });

    res.json({
      token,
      profile: {
        id: target.profile_id,
        email: target.email,
        role: target.role,
        first_name: target.first_name,
        last_name: target.last_name,
      },
      institution: { id: institution.id, name: institution.name },
    });
  })
);

// ------------------------------------------------------------------
// Platform announcements — broadcast a message to tenant users. Delivered
// through the existing per-user notifications table/bell (which already
// renders a 'announcement' type), with a separate history row here since
// one broadcast fans out into many notification rows.
// ------------------------------------------------------------------
const announcementSchema = z.object({
  title: z.string().trim().min(1).max(255),
  body: z.string().trim().min(1).max(2000),
  severity: z.enum(['info', 'warning', 'success']).default('info'),
  targetType: z.enum(['all', 'selected']).default('all'),
  institutionIds: z.array(z.string().uuid()).optional(),
});

router.get(
  '/announcements',
  asyncHandler(async (req, res) => {
    const [rows] = await db.query(
      `SELECT a.id, a.title, a.body, a.severity, a.target_type, a.target_institution_ids,
              a.recipient_count, a.created_at,
              CONCAT(p.first_name, ' ', COALESCE(p.last_name, '')) AS created_by_name
         FROM platform_announcements a
         LEFT JOIN user_profiles p ON p.id = a.created_by
        ORDER BY a.created_at DESC
        LIMIT 50`
    );
    res.json({ announcements: rows });
  })
);

router.post(
  '/announcements',
  validate({ body: announcementSchema }),
  asyncHandler(async (req, res) => {
    const { title, body, severity, targetType, institutionIds } = req.body;
    if (targetType === 'selected' && (!institutionIds || institutionIds.length === 0)) {
      throw ApiError.badRequest('Select at least one institution, or choose "all".');
    }

    const [recipients] = targetType === 'selected'
      ? await db.query(
          `SELECT id, institution_id FROM user_profiles
            WHERE is_active = 1 AND institution_id IN (?)`,
          [institutionIds]
        )
      : await db.query(
          `SELECT id, institution_id FROM user_profiles
            WHERE is_active = 1 AND institution_id IS NOT NULL`
        );

    const announcementId = uuidv4();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute(
        `INSERT INTO platform_announcements
           (id, title, body, severity, target_type, target_institution_ids, recipient_count, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          announcementId, title, body, severity, targetType,
          targetType === 'selected' ? JSON.stringify(institutionIds) : null,
          recipients.length,
          req.auth?.profile?.id || null,
        ]
      );

      if (recipients.length > 0) {
        const rows = recipients.map((recipient) => [
          uuidv4(), recipient.institution_id, recipient.id, title, body, 'announcement', req.auth?.profile?.id || null,
        ]);
        await connection.query(
          `INSERT INTO notifications (id, institution_id, user_id, title, body, type, created_by) VALUES ?`,
          [rows]
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    await recordAuditEvent(req, {
      institutionId: null,
      action: 'platform.announcement_sent',
      description: `Sent announcement "${title}" to ${recipients.length} user(s)`,
      entityType: 'platform_announcement',
      entityId: announcementId,
      severity: severity === 'warning' ? 'warning' : 'success',
      metadata: { target_type: targetType, recipient_count: recipients.length },
    });

    res.status(201).json({ id: announcementId, recipientCount: recipients.length });
  })
);

// ------------------------------------------------------------------
// Plan & pricing management — per-plan seat/student/AI-credit ceilings,
// editable from the console. Overrides live in `plan_overrides` and are
// merged over the shipped PLAN_LIMITS defaults by planOverrides.js, which
// every enforcement point (invites, this decorator) now reads through.
// ------------------------------------------------------------------
router.get(
  '/plan-config',
  (req, res) => {
    const plans = PLANS.map((planKey) => ({
      key: planKey,
      defaults: PLAN_LIMITS[planKey] || PLAN_LIMITS.free,
      overrides: getPlanOverride(planKey),
      effective: getEffectivePlanLimits(planKey),
    }));
    res.json({ plans });
  }
);

const planOverrideSchema = z.object({
  users: z.number().int().min(0).nullable(),
  students: z.number().int().min(0).nullable(),
  aiCredits: z.number().int().min(0).nullable(),
});

router.put(
  '/plan-config/:plan',
  validate({ params: z.object({ plan: z.enum(PLANS) }), body: planOverrideSchema }),
  asyncHandler(async (req, res) => {
    const { plan } = req.params;
    const { users, students, aiCredits } = req.body;

    await db.execute(
      `INSERT INTO plan_overrides (plan_key, max_users, max_students, ai_credits, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         max_users = VALUES(max_users), max_students = VALUES(max_students),
         ai_credits = VALUES(ai_credits), updated_by = VALUES(updated_by)`,
      [plan, users, students, aiCredits, req.auth?.profile?.id || null]
    );
    await refreshPlanOverrides();

    await recordAuditEvent(req, {
      institutionId: null,
      action: 'platform.plan_limits_updated',
      description: `Updated ${plan} plan limits`,
      entityType: 'plan',
      entityId: plan,
      severity: 'info',
      metadata: { plan, users, students, aiCredits },
    });

    res.json({
      key: plan,
      defaults: PLAN_LIMITS[plan] || PLAN_LIMITS.free,
      overrides: getPlanOverride(plan),
      effective: getEffectivePlanLimits(plan),
    });
  })
);

// ------------------------------------------------------------------
// Super admin team — platform-level users (institution_id IS NULL,
// role = 'super_admin'). Same invite/temp-password pattern as tenant user
// invites in users.js, minus the tenant scoping.
// ------------------------------------------------------------------
router.get(
  '/team',
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT p.id, p.first_name, p.last_name, p.phone, p.is_active, p.created_at, u.email
         FROM user_profiles p
         JOIN users u ON u.id = p.user_id
        WHERE p.role = 'super_admin'
        ORDER BY p.created_at ASC`
    );
    res.json({ team: rows });
  })
);

function generatePlatformTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

const teamInviteSchema = z.object({
  email: requiredEmail,
  firstName: z.string().trim().min(1).max(100),
  lastName: optionalText(100),
  phone,
});

router.post(
  '/team/invite',
  validate({ body: teamInviteSchema }),
  asyncHandler(async (req, res) => {
    const normalizedEmail = req.body.email.toLowerCase();
    const temporaryPassword = generatePlatformTemporaryPassword();

    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing.length > 0) {
      throw ApiError.conflict('A user with that email already exists.');
    }

    const userId = uuidv4();
    const profileId = uuidv4();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO users (id, email, password_hash, must_change_password, password_changed_at)
         VALUES (?, ?, ?, 1, NOW())`,
        [userId, normalizedEmail, passwordHash]
      );
      await connection.execute(
        `INSERT INTO user_profiles (id, user_id, institution_id, role, first_name, last_name, phone, is_active)
         VALUES (?, ?, NULL, 'super_admin', ?, ?, ?, 1)`,
        [profileId, userId, req.body.firstName, req.body.lastName || null, req.body.phone || null]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const { sent: emailSent } = await sendInviteEmail({
      to: normalizedEmail,
      firstName: req.body.firstName,
      institutionName: 'CyberMilo Platform',
      role: 'super_admin',
      temporaryPassword,
    });

    await recordAuditEvent(req, {
      institutionId: null,
      action: 'platform.team_member_invited',
      description: `Invited ${normalizedEmail} as a super admin`,
      entityType: 'user_profile',
      entityId: profileId,
      severity: 'warning',
      metadata: { invited_email: normalizedEmail, email_sent: emailSent },
    });

    res.status(201).json({
      profileId,
      email: normalizedEmail,
      temporaryPassword,
      emailSent,
    });
  })
);

const teamUpdateSchema = z.object({ isActive: z.boolean() });

router.patch(
  '/team/:profileId',
  validate({ params: z.object({ profileId: z.string().uuid() }), body: teamUpdateSchema }),
  asyncHandler(async (req, res) => {
    if (req.params.profileId === req.auth?.profile?.id) {
      throw ApiError.badRequest('You cannot deactivate your own account.');
    }

    const [rows] = await db.execute(
      `SELECT id FROM user_profiles WHERE id = ? AND role = 'super_admin'`,
      [req.params.profileId]
    );
    if (!rows[0]) throw ApiError.notFound('Super admin not found');

    await db.execute('UPDATE user_profiles SET is_active = ? WHERE id = ?', [
      req.body.isActive ? 1 : 0, req.params.profileId,
    ]);

    await recordAuditEvent(req, {
      institutionId: null,
      action: req.body.isActive ? 'platform.team_member_reactivated' : 'platform.team_member_deactivated',
      description: `${req.body.isActive ? 'Reactivated' : 'Deactivated'} super admin account`,
      entityType: 'user_profile',
      entityId: req.params.profileId,
      severity: req.body.isActive ? 'success' : 'warning',
    });

    res.json({ success: true });
  })
);

export default router;
