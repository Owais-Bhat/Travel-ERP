/**
 * The caller's own institution.
 *
 * Security note: `PUT /settings` used to replace the entire settings JSON
 * with whatever the client sent, from any authenticated account. That let a
 * tenant turn on every paid module (`settings.modules`) and clear its own
 * `settings.suspended` flag. Writes are now permission-gated and merged into
 * an allow-list of tenant-owned keys — anything platform-owned is preserved
 * from the stored record and can only be changed from the admin console.
 */
import express from 'express';
import db from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requirePermission } from '../auth/permissions.js';
import { requireFeature } from '../middleware/feature.js';
import { recordAuditEvent } from '../lib/audit.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { buildUpdate } from '../lib/query.js';
import { upload, publicUrlFor, uploadErrorHandler } from '../lib/uploads.js';
import { encrypt } from '../lib/encryption.js';
import { z, optionalText, longText, email, phone } from '../validation/common.js';
import {
  getBillingState, getPlanFeatureMap, getEffectiveFeatureMap,
  sanitizeRoleFeatures, RESTRICTABLE_ROLES, FEATURE_CATALOG,
} from '../saas/features.js';
import { getEffectivePlanLimits } from '../saas/planOverrides.js';
import { env } from '../lib/env.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);

/** Keys a tenant may write. Everything else in `settings` is platform-owned. */
const TENANT_SETTINGS_KEYS = [
  'branding', 'locale', 'timezone', 'currency', 'academic_year',
  'grading_scale', 'notifications', 'preferences', 'contact', 'onboarding_dismissed',
];

const PROFILE_UPDATABLE = [
  'name', 'type', 'address', 'phone', 'email', 'logo_url', 'website',
  'city', 'state', 'country', 'postal_code', 'established_year', 'accreditation', 'about',
];

function readSettings(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

router.get(
  '/current',
  asyncHandler(async (req, res) => {
    const institutionId = req.auth.profile.institution_id;
    if (!institutionId) return res.json(null);

    const [rows] = await db.execute('SELECT * FROM institutions WHERE id = ?', [institutionId]);
    const institution = rows[0];
    if (!institution) return res.json(null);

    const settings = readSettings(institution.settings);
    const plan = institution.subscription_plan || 'free';

    return res.json({
      ...institution,
      settings,
      billing_state: getBillingState({ ...institution, settings }),
      plan_limits: getEffectivePlanLimits(plan),
      enabled_modules: getPlanFeatureMap(plan, settings.modules || {}),
      // What the *caller's own role* can actually see — the plan ceiling
      // narrowed by any per-role restriction the tenant admin has set.
      my_features: getEffectiveFeatureMap({ ...institution, settings }, req.auth.profile.role),
      // Lets the Video Classes UI hide the "in-app classroom" option until
      // a self-hosted Jitsi domain is actually configured server-side.
      jitsi_enabled: Boolean(env.jitsiDomain),
    });
  })
);

const profileSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  type: optionalText(50),
  address: longText,
  phone,
  email,
  logo_url: optionalText(500),
  website: optionalText(255),
  city: optionalText(120),
  state: optionalText(120),
  country: optionalText(120),
  postal_code: optionalText(20),
  established_year: z.coerce.number().int().min(1800).max(2100).nullable().optional(),
  accreditation: optionalText(255),
  about: longText,
});

router.put(
  '/profile',
  requireInstitution,
  requirePermission('institution.manage'),
  validate({ body: profileSchema }),
  asyncHandler(async (req, res) => {
    const update = buildUpdate(req.body, PROFILE_UPDATABLE);
    if (!update) throw ApiError.badRequest('No updatable fields provided');

    await db.execute(
      `UPDATE institutions SET ${update.sql} WHERE id = ?`,
      [...update.params, req.institutionId]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'institution.profile_updated',
      entityType: 'institution',
      entityId: req.institutionId,
      metadata: { changed_fields: Object.keys(req.body) },
    });

    const [rows] = await db.execute('SELECT * FROM institutions WHERE id = ?', [req.institutionId]);
    res.json({ ...rows[0], settings: readSettings(rows[0].settings) });
  })
);

router.post(
  '/logo',
  requireInstitution,
  requirePermission('institution.manage'),
  upload.single('file'),
  uploadErrorHandler,
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No file uploaded. Send it as multipart/form-data field "file".');

    const logoUrl = publicUrlFor(req.file, req.institutionId);
    await db.execute('UPDATE institutions SET logo_url = ? WHERE id = ?', [logoUrl, req.institutionId]);

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'institution.logo_updated',
      entityType: 'institution',
      entityId: req.institutionId,
    });

    res.json({ logo_url: logoUrl });
  })
);

router.put(
  '/settings',
  requireInstitution,
  requirePermission('institution.manage'),
  validate({ body: z.object({ settings: z.record(z.string(), z.unknown()) }) }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute('SELECT settings FROM institutions WHERE id = ?', [req.institutionId]);
    if (!rows[0]) throw ApiError.notFound('Institution not found');

    const current = readSettings(rows[0].settings);
    const incoming = req.body.settings || {};

    // Take only tenant-owned keys; platform keys (modules, suspended,
    // onboarding provenance) survive untouched.
    const accepted = {};
    const rejected = [];
    for (const [key, value] of Object.entries(incoming)) {
      if (TENANT_SETTINGS_KEYS.includes(key)) accepted[key] = value;
      else rejected.push(key);
    }

    const next = { ...current, ...accepted };
    await db.execute('UPDATE institutions SET settings = ? WHERE id = ?', [
      JSON.stringify(next), req.institutionId,
    ]);

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'institution.settings_updated',
      entityType: 'institution',
      entityId: req.institutionId,
      metadata: { changed_keys: Object.keys(accepted), ignored_keys: rejected },
    });

    res.json({
      success: true,
      settings: next,
      // Told, not silently dropped, so the caller can see what was refused.
      ignored: rejected,
    });
  })
);

// ------------------------------------------------------------------
// Razorpay config — storage + a feature flag only, no live payment
// processing. `key_secret` never round-trips in plaintext: it's encrypted
// server-side before it's written, and never sent back to the client.
// Kept as its own endpoint rather than folding into PUT /settings above,
// since that generic path has no encryption step.
// ------------------------------------------------------------------
const razorpaySchema = z.object({
  enabled: z.boolean().default(false),
  key_id: optionalText(100),
  key_secret: optionalText(255),
});

router.get(
  '/integrations/razorpay',
  requireInstitution,
  requirePermission('institution.manage'),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute('SELECT settings FROM institutions WHERE id = ?', [req.institutionId]);
    if (!rows[0]) throw ApiError.notFound('Institution not found');

    const razorpay = readSettings(rows[0].settings).integrations?.razorpay || {};
    res.json({
      enabled: Boolean(razorpay.enabled),
      key_id: razorpay.key_id || '',
      key_secret_set: Boolean(razorpay.key_secret_enc),
    });
  })
);

router.put(
  '/integrations/razorpay',
  requireInstitution,
  requirePermission('institution.manage'),
  requireFeature('payments'),
  validate({ body: razorpaySchema }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute('SELECT settings FROM institutions WHERE id = ?', [req.institutionId]);
    if (!rows[0]) throw ApiError.notFound('Institution not found');

    const current = readSettings(rows[0].settings);
    const existingRazorpay = current.integrations?.razorpay || {};

    const nextRazorpay = {
      enabled: req.body.enabled,
      key_id: req.body.key_id || '',
      // Omit key_secret to edit enabled/key_id without re-entering it.
      key_secret_enc: req.body.key_secret ? encrypt(req.body.key_secret) : existingRazorpay.key_secret_enc,
    };

    const next = { ...current, integrations: { ...(current.integrations || {}), razorpay: nextRazorpay } };
    await db.execute('UPDATE institutions SET settings = ? WHERE id = ?', [JSON.stringify(next), req.institutionId]);

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'institution.integrations_updated',
      entityType: 'institution',
      entityId: req.institutionId,
      metadata: { integration: 'razorpay', enabled: nextRazorpay.enabled, key_secret_changed: Boolean(req.body.key_secret) },
    });

    res.json({ enabled: nextRazorpay.enabled, key_id: nextRazorpay.key_id, key_secret_set: Boolean(nextRazorpay.key_secret_enc) });
  })
);

// ------------------------------------------------------------------
// Per-role feature access (tenant admin narrows a role within the plan)
// ------------------------------------------------------------------
router.get(
  '/role-features',
  requireInstitution,
  requirePermission('institution.manage'),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      'SELECT subscription_plan, settings FROM institutions WHERE id = ?',
      [req.institutionId]
    );
    const institution = rows[0];
    if (!institution) throw ApiError.notFound('Institution not found');

    const settings = readSettings(institution.settings);
    const plan = institution.subscription_plan || 'free';
    const planFeatures = getPlanFeatureMap(plan, settings.modules || {});

    res.json({
      roles: RESTRICTABLE_ROLES,
      // Only features the plan actually includes are worth showing in the
      // matrix — restricting a role below a feature the plan never had
      // would be a no-op that just confuses the admin.
      catalog: FEATURE_CATALOG.filter((f) => f.status === 'live' && planFeatures[f.key]),
      roleFeatures: sanitizeRoleFeatures(settings.role_features),
    });
  })
);

// A plain z.record keyed by an enum requires every enum member to be
// present (zod v4 treats an enum-keyed record as exhaustive), which would
// force the client to send all four roles on every save. What we actually
// want is a partial map — each role optional — so build it as an object.
const roleFeaturesSchema = z.object({
  roleFeatures: z.object(
    Object.fromEntries(
      RESTRICTABLE_ROLES.map((role) => [
        role,
        z.array(z.string().max(60)).max(FEATURE_CATALOG.length).optional(),
      ])
    )
  ),
});

router.put(
  '/role-features',
  requireInstitution,
  requirePermission('institution.manage'),
  validate({ body: roleFeaturesSchema }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute('SELECT settings FROM institutions WHERE id = ?', [req.institutionId]);
    if (!rows[0]) throw ApiError.notFound('Institution not found');

    const current = readSettings(rows[0].settings);
    // Sanitised, not trusted verbatim: unknown/planned feature keys are
    // dropped so a stale client can't smuggle in something meaningless.
    const clean = sanitizeRoleFeatures(req.body.roleFeatures);
    const next = { ...current, role_features: clean };

    await db.execute('UPDATE institutions SET settings = ? WHERE id = ?', [
      JSON.stringify(next), req.institutionId,
    ]);

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'institution.role_features_updated',
      entityType: 'institution',
      entityId: req.institutionId,
      metadata: { roles_changed: Object.keys(clean) },
    });

    res.json({ success: true, roleFeatures: clean });
  })
);

export default router;
