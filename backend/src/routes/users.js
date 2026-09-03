/**
 * Tenant user management.
 *
 * Ported from Supabase Auth to MySQL: users are created here with a bcrypt
 * hash and flagged `must_change_password`. The generated temporary password
 * is emailed to the invitee when SMTP is configured, and is always also
 * returned once to the admin who created the account — the fallback for a
 * bounced/missing email, and the only path at all when SMTP isn't set up.
 */
import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import db from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requirePermission } from '../auth/permissions.js';
import { recordAuditEvent } from '../lib/audit.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { z, requiredEmail, optionalText, phone } from '../validation/common.js';
import { getEffectivePlanLimits } from '../saas/planOverrides.js';
import { sendInviteEmail } from '../lib/mailer.js';

const router = express.Router();

const ASSIGNABLE_ROLES = ['institution_admin', 'principal', 'teacher', 'student', 'parent', 'staff'];

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requirePermission('users.manage'));

/** Readable, high-entropy temporary password (~62 bits). */
function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT p.id, p.user_id, p.institution_id, p.role, p.first_name, p.last_name,
              p.phone, p.avatar_url, p.is_active, p.created_at,
              u.email, u.last_login_at, u.must_change_password
         FROM user_profiles p
         JOIN users u ON u.id = p.user_id
        WHERE p.institution_id = ?
        ORDER BY p.created_at DESC`,
      [req.institutionId]
    );
    res.json({ users: rows });
  })
);

const inviteSchema = z.object({
  email: requiredEmail,
  role: z.enum(ASSIGNABLE_ROLES).default('teacher'),
  firstName: z.string().trim().min(1).max(100),
  lastName: optionalText(100),
  phone,
  temporaryPassword: z.string().min(8).max(72).optional(),
});

router.post(
  '/invite',
  validate({ body: inviteSchema }),
  asyncHandler(async (req, res) => {
    const { email, role, firstName, lastName, phone: userPhone } = req.body;
    const normalizedEmail = email.toLowerCase();
    const temporaryPassword = req.body.temporaryPassword || generateTemporaryPassword();

    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing.length > 0) {
      throw ApiError.conflict('A user with that email already exists.');
    }

    const userId = uuidv4();
    const profileId = uuidv4();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    let institutionName = '';

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Hard-block once the tenant hits its plan's seat count. Counted
      // inside the transaction so it reads the freshest number available,
      // and only active profiles consume a seat — a deactivated user frees
      // one up without needing to be deleted.
      const [[institution]] = await connection.execute(
        'SELECT name, subscription_plan FROM institutions WHERE id = ? FOR UPDATE',
        [req.institutionId]
      );
      if (!institution) throw ApiError.notFound('Institution not found');
      institutionName = institution.name;

      const limit = getEffectivePlanLimits(institution.subscription_plan || 'free').users;
      if (limit !== null) {
        const [[{ activeUsers }]] = await connection.execute(
          'SELECT COUNT(*) AS activeUsers FROM user_profiles WHERE institution_id = ? AND is_active = 1',
          [req.institutionId]
        );
        if (Number(activeUsers) >= limit) {
          throw ApiError.conflict(
            `Your ${institution.subscription_plan} plan allows up to ${limit} users, and you are at that limit. ` +
            'Deactivate an existing user or upgrade your plan to invite more.',
            { code: 'plan_user_limit' }
          );
        }
      }

      await connection.execute(
        `INSERT INTO users (id, email, password_hash, must_change_password, password_changed_at)
         VALUES (?, ?, ?, 1, NOW())`,
        [userId, normalizedEmail, passwordHash]
      );
      await connection.execute(
        `INSERT INTO user_profiles (id, user_id, institution_id, role, first_name, last_name, phone, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [profileId, userId, req.institutionId, role, firstName, lastName || null, userPhone || null]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const [profiles] = await db.execute('SELECT * FROM user_profiles WHERE id = ?', [profileId]);

    // Sent after the commit, not inside the transaction — a slow SMTP
    // round trip has no business holding a database transaction open, and
    // a bounced email must never roll back an account that was otherwise
    // created successfully.
    const { sent: emailSent } = await sendInviteEmail({
      to: normalizedEmail,
      firstName,
      institutionName,
      role,
      temporaryPassword,
    });

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'user.invited',
      description: `Invited ${normalizedEmail} as ${role}`,
      entityType: 'user_profile',
      entityId: profileId,
      metadata: { invited_email: normalizedEmail, invited_role: role, email_sent: emailSent },
    });

    // The password is still returned here even when the email sends
    // successfully — it's the admin's fallback if the invite lands in spam
    // or the address was mistyped, and it's the *only* way to hand it over
    // at all when SMTP isn't configured.
    res.status(201).json({
      profile: profiles[0],
      email: normalizedEmail,
      temporaryPassword,
      emailSent,
      mustChangePassword: true,
    });
  })
);

const updateSchema = z.object({
  role: z.enum(ASSIGNABLE_ROLES).optional(),
  isActive: z.boolean().optional(),
  firstName: optionalText(100),
  lastName: optionalText(100),
  phone,
});

router.patch(
  '/:profileId',
  validate({ params: z.object({ profileId: z.string().uuid() }), body: updateSchema }),
  asyncHandler(async (req, res) => {
    const { profileId } = req.params;

    const [existingRows] = await db.execute(
      'SELECT * FROM user_profiles WHERE id = ? AND institution_id = ?',
      [profileId, req.institutionId]
    );
    const previous = existingRows[0];
    if (!previous) throw ApiError.notFound('User not found in this institution');

    // Never let an admin lock themselves out of their own tenant.
    if (previous.id === req.auth.profile.id && req.body.isActive === false) {
      throw ApiError.badRequest('You cannot deactivate your own account.');
    }

    // Reactivating someone consumes a seat exactly like inviting does.
    if (req.body.isActive === true && previous.is_active !== 1) {
      const [[institution]] = await db.execute(
        'SELECT subscription_plan FROM institutions WHERE id = ?',
        [req.institutionId]
      );
      const limit = getEffectivePlanLimits(institution?.subscription_plan || 'free').users;
      if (limit !== null) {
        const [[{ activeUsers }]] = await db.execute(
          'SELECT COUNT(*) AS activeUsers FROM user_profiles WHERE institution_id = ? AND is_active = 1',
          [req.institutionId]
        );
        if (Number(activeUsers) >= limit) {
          throw ApiError.conflict(
            `Your ${institution.subscription_plan} plan allows up to ${limit} users, and you are at that limit. ` +
            'Deactivate someone else first, or upgrade your plan.',
            { code: 'plan_user_limit' }
          );
        }
      }
    }

    const assignments = [];
    const params = [];
    const changed = [];
    const map = {
      role: 'role',
      firstName: 'first_name',
      lastName: 'last_name',
      phone: 'phone',
    };

    for (const [key, column] of Object.entries(map)) {
      if (req.body[key] === undefined) continue;
      assignments.push(`${column} = ?`);
      params.push(req.body[key]);
      changed.push(column);
    }
    if (req.body.isActive !== undefined) {
      assignments.push('is_active = ?');
      params.push(req.body.isActive ? 1 : 0);
      changed.push('is_active');
    }

    if (assignments.length === 0) throw ApiError.badRequest('No updatable fields provided');

    await db.execute(
      `UPDATE user_profiles SET ${assignments.join(', ')} WHERE id = ? AND institution_id = ?`,
      [...params, profileId, req.institutionId]
    );

    const [updatedRows] = await db.execute('SELECT * FROM user_profiles WHERE id = ?', [profileId]);
    const profile = updatedRows[0];

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'user.updated',
      description: `Updated ${[profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.id}`,
      entityType: 'user_profile',
      entityId: profile.id,
      severity: req.body.isActive === false ? 'warning' : 'info',
      metadata: {
        changed_fields: changed,
        previous_role: previous.role,
        next_role: profile.role,
        previous_is_active: previous.is_active,
        next_is_active: profile.is_active,
      },
    });

    res.json({ profile });
  })
);

/** Force a password reset by issuing a fresh temporary password. */
router.post(
  '/:profileId/reset-password',
  validate({ params: z.object({ profileId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      'SELECT user_id, first_name, last_name FROM user_profiles WHERE id = ? AND institution_id = ?',
      [req.params.profileId, req.institutionId]
    );
    const profile = rows[0];
    if (!profile) throw ApiError.notFound('User not found in this institution');

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    await db.execute(
      `UPDATE users
          SET password_hash = ?, must_change_password = 1, password_changed_at = NOW(),
              failed_login_attempts = 0, locked_until = NULL
        WHERE id = ?`,
      [passwordHash, profile.user_id]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'user.password_reset',
      description: `Reset password for ${[profile.first_name, profile.last_name].filter(Boolean).join(' ')}`,
      entityType: 'user_profile',
      entityId: req.params.profileId,
      severity: 'warning',
    });

    res.json({ temporaryPassword, mustChangePassword: true });
  })
);

export default router;
