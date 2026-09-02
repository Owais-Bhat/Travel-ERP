/**
 * Authentication.
 *
 * Hardened: bcrypt cost raised to 12, brute-force lockout after repeated
 * failures, a password policy, uniform "invalid credentials" responses so
 * the endpoint cannot be used to enumerate accounts, forced rotation for
 * admin-issued temporary passwords, and database-backed password resets.
 */
import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db, { withTransaction } from '../lib/db.js';
import { env } from '../lib/env.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { recordAuditEvent } from '../lib/audit.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { z, requiredEmail, optionalText, phone } from '../validation/common.js';

const router = express.Router();

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MINUTES = 15;
const RESET_TOKEN_TTL_MINUTES = 30;

/**
 * Password policy: length does most of the work, so the bar is 8 characters
 * plus a little variety rather than a thicket of symbol rules.
 */
const password = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .refine((value) => /[a-zA-Z]/.test(value) && /\d/.test(value), {
    message: 'Password must contain at least one letter and one number',
  });

function signToken({ userId, institutionId, role }) {
  return jwt.sign({ userId, institutionId, role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ------------------------------------------------------------------ register
const registerSchema = z.object({
  email: requiredEmail,
  password,
  firstName: z.string().trim().min(1).max(100),
  lastName: optionalText(100),
  institutionName: optionalText(255),
  institutionType: optionalText(50),
  institutionAddress: optionalText(1000),
  institutionPhone: phone,
  institutionEmail: z.string().trim().email().max(255).optional().or(z.literal('')),
});

router.post(
  '/register',
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const email = body.email.toLowerCase();

    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      throw ApiError.conflict('An account with that email already exists.');
    }

    const userId = uuidv4();
    const profileId = uuidv4();
    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);

    let institutionId = null;
    let role = 'user';
    if (body.institutionName) {
      institutionId = uuidv4();
      // Whoever creates the institution becomes its admin.
      role = 'institution_admin';
    }

    await withTransaction(async (connection) => {
      await connection.execute(
        'INSERT INTO users (id, email, password_hash, password_changed_at) VALUES (?, ?, ?, NOW())',
        [userId, email, passwordHash]
      );

      if (institutionId) {
        await connection.execute(
          `INSERT INTO institutions (id, name, type, address, phone, email)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            institutionId, body.institutionName, body.institutionType || 'School',
            body.institutionAddress || null, body.institutionPhone || null,
            (body.institutionEmail || email).toLowerCase(),
          ]
        );
      }

      await connection.execute(
        `INSERT INTO user_profiles (id, user_id, institution_id, role, first_name, last_name)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [profileId, userId, institutionId, role, body.firstName, body.lastName || null]
      );
    });

    const token = signToken({ userId, institutionId, role });
    const [profiles] = await db.execute('SELECT * FROM user_profiles WHERE id = ?', [profileId]);

    res.status(201).json({
      user: { id: userId, email, profile: profiles[0] },
      token,
    });
  })
);

// --------------------------------------------------------------------- login
router.post(
  '/login',
  validate({ body: z.object({ email: requiredEmail, password: z.string().min(1).max(200) }) }),
  asyncHandler(async (req, res) => {
    const email = req.body.email.toLowerCase();
    const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    const user = users[0];

    // Same message and roughly the same work whether or not the account
    // exists, so this cannot be used to discover valid emails.
    const invalid = () => ApiError.unauthorized('Invalid email or password.');

    if (!user) {
      await bcrypt.compare(req.body.password, '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
      throw invalid();
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw ApiError.forbidden(
        `Too many failed attempts. Try again after ${new Date(user.locked_until).toLocaleTimeString()}.`,
        { code: 'account_locked' }
      );
    }

    const matches = await bcrypt.compare(req.body.password, user.password_hash);
    if (!matches) {
      const attempts = Number(user.failed_login_attempts || 0) + 1;
      const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
      await db.execute(
        `UPDATE users
            SET failed_login_attempts = ?,
                locked_until = ${shouldLock ? `DATE_ADD(NOW(), INTERVAL ${LOCKOUT_MINUTES} MINUTE)` : 'NULL'}
          WHERE id = ?`,
        [shouldLock ? 0 : attempts, user.id]
      );
      throw invalid();
    }

    const [profiles] = await db.execute('SELECT * FROM user_profiles WHERE user_id = ?', [user.id]);
    const profile = profiles[0];

    if (!profile) throw ApiError.forbidden('This account has no profile. Contact your administrator.');
    if (profile.is_active === 0 || profile.is_active === false) {
      throw ApiError.forbidden('This account has been deactivated.');
    }

    await db.execute(
      'UPDATE users SET last_login_at = NOW(), failed_login_attempts = 0, locked_until = NULL WHERE id = ?',
      [user.id]
    );

    const token = signToken({
      userId: user.id,
      institutionId: profile.institution_id,
      role: profile.role,
    });

    res.json({
      user: { id: user.id, email: user.email, profile },
      token,
      mustChangePassword: Boolean(user.must_change_password),
    });
  })
);

// ------------------------------------------------------------------------ me
router.get('/me', requireAuthenticatedProfile, asyncHandler(async (req, res) => {
  const [users] = await db.execute(
    'SELECT id, email, last_login_at, must_change_password FROM users WHERE id = ?',
    [req.auth.user.id]
  );
  res.json({ user: users[0] || req.auth.user, profile: req.auth.profile });
}));

router.put(
  '/me',
  requireAuthenticatedProfile,
  validate({
    body: z.object({
      first_name: optionalText(100),
      last_name: optionalText(100),
      phone,
      avatar_url: optionalText(500),
    }),
  }),
  asyncHandler(async (req, res) => {
    const allowed = ['first_name', 'last_name', 'phone', 'avatar_url'];
    const assignments = [];
    const params = [];

    for (const field of allowed) {
      if (req.body[field] === undefined) continue;
      assignments.push(`${field} = ?`);
      params.push(req.body[field]);
    }
    if (assignments.length === 0) throw ApiError.badRequest('No updatable fields provided');

    await db.execute(
      `UPDATE user_profiles SET ${assignments.join(', ')} WHERE id = ?`,
      [...params, req.auth.profile.id]
    );

    const [updated] = await db.execute('SELECT * FROM user_profiles WHERE id = ?', [req.auth.profile.id]);
    res.json({ profile: updated[0] });
  })
);

// ---------------------------------------------------------------- password
router.put(
  '/password',
  requireAuthenticatedProfile,
  validate({ body: z.object({ currentPassword: z.string().min(1), newPassword: password }) }),
  asyncHandler(async (req, res) => {
    const [users] = await db.execute('SELECT * FROM users WHERE id = ?', [req.auth.user.id]);
    const user = users[0];
    if (!user) throw ApiError.unauthorized();

    const matches = await bcrypt.compare(req.body.currentPassword, user.password_hash);
    if (!matches) throw ApiError.unauthorized('Current password is incorrect.');

    if (await bcrypt.compare(req.body.newPassword, user.password_hash)) {
      throw ApiError.badRequest('The new password must be different from the current one.');
    }

    const newHash = await bcrypt.hash(req.body.newPassword, BCRYPT_ROUNDS);
    await db.execute(
      `UPDATE users
          SET password_hash = ?, must_change_password = 0, password_changed_at = NOW()
        WHERE id = ?`,
      [newHash, user.id]
    );

    await recordAuditEvent(req, {
      institutionId: req.auth.profile.institution_id,
      action: 'user.password_changed',
      entityType: 'user',
      entityId: user.id,
      severity: 'warning',
    });

    res.json({ success: true });
  })
);

// ----------------------------------------------------------- password reset
router.post(
  '/forgot-password',
  validate({ body: z.object({ email: requiredEmail }) }),
  asyncHandler(async (req, res) => {
    const email = req.body.email.toLowerCase();
    const [users] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);

    // Always the same answer — this endpoint must not confirm who has an account.
    const response = {
      success: true,
      message: 'If an account exists for that email, a reset link has been generated.',
    };

    if (users.length === 0) return res.json(response);

    const token = crypto.randomBytes(32).toString('hex');
    await db.execute(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [uuidv4(), users[0].id, hashResetToken(token), RESET_TOKEN_TTL_MINUTES]
    );

    // No mail transport is configured. In development the token is returned
    // so the flow is testable; in production it is only logged, and an
    // administrator issues the reset from the users screen instead.
    if (!env.isProduction) {
      return res.json({ ...response, resetToken: token, expiresInMinutes: RESET_TOKEN_TTL_MINUTES });
    }

    console.warn(`[auth] password reset requested for ${email} — no mail transport configured`);
    return res.json(response);
  })
);

router.post(
  '/reset-password',
  validate({ body: z.object({ token: z.string().min(32).max(128), newPassword: password }) }),
  asyncHandler(async (req, res) => {
    const tokenHash = hashResetToken(req.body.token);
    const [rows] = await db.execute(
      `SELECT * FROM password_reset_tokens
        WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()`,
      [tokenHash]
    );
    const resetToken = rows[0];
    if (!resetToken) throw ApiError.badRequest('That reset link is invalid or has expired.');

    const newHash = await bcrypt.hash(req.body.newPassword, BCRYPT_ROUNDS);

    await withTransaction(async (connection) => {
      await connection.execute(
        `UPDATE users
            SET password_hash = ?, must_change_password = 0, password_changed_at = NOW(),
                failed_login_attempts = 0, locked_until = NULL
          WHERE id = ?`,
        [newHash, resetToken.user_id]
      );
      await connection.execute(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?',
        [resetToken.id]
      );
      // Invalidate any other outstanding tokens for this account.
      await connection.execute(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
        [resetToken.user_id]
      );
    });

    res.json({ success: true });
  })
);

export default router;
