/**
 * In-app notifications.
 *
 * Replaces the Supabase Realtime channel the frontend used to subscribe to.
 * Without Postgres LISTEN/NOTIFY the client polls, so the list endpoint
 * accepts `?since=` and returns only what is new — a cheap long-poll that
 * costs one indexed lookup.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requirePermission } from '../auth/permissions.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { z, optionalText, longText } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);

const TYPES = ['info', 'success', 'warning', 'error'];

router.get(
  '/',
  validate({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(30),
      unreadOnly: z.coerce.boolean().optional(),
      since: z.string().optional(),
    }).passthrough(),
  }),
  asyncHandler(async (req, res) => {
    const conditions = ['user_id = ?', 'institution_id = ?'];
    const params = [req.auth.profile.id, req.institutionId];

    if (req.query.unreadOnly) conditions.push('read_at IS NULL');
    if (req.query.since) {
      conditions.push('created_at > ?');
      params.push(req.query.since);
    }

    const [rows] = await db.query(
      `SELECT * FROM notifications
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT ${Number(req.query.limit)}`,
      params
    );

    const [[counts]] = await db.execute(
      `SELECT COUNT(*) AS total, SUM(read_at IS NULL) AS unread
         FROM notifications WHERE user_id = ? AND institution_id = ?`,
      [req.auth.profile.id, req.institutionId]
    );

    res.json({
      notifications: rows,
      unread: Number(counts.unread) || 0,
      total: Number(counts.total) || 0,
      // Clients pass this back as ?since= on the next poll.
      cursor: rows[0]?.created_at || req.query.since || null,
    });
  })
);

router.post(
  '/:id/read',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const [result] = await db.execute(
      `UPDATE notifications SET read_at = NOW()
        WHERE id = ? AND user_id = ? AND read_at IS NULL`,
      [req.params.id, req.auth.profile.id]
    );
    if (result.affectedRows === 0) {
      // Either it does not exist, is not theirs, or was already read.
      const [rows] = await db.execute(
        'SELECT id FROM notifications WHERE id = ? AND user_id = ?',
        [req.params.id, req.auth.profile.id]
      );
      if (rows.length === 0) throw ApiError.notFound('Notification not found');
    }
    res.json({ success: true });
  })
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const [result] = await db.execute(
      `UPDATE notifications SET read_at = NOW()
        WHERE user_id = ? AND institution_id = ? AND read_at IS NULL`,
      [req.auth.profile.id, req.institutionId]
    );
    res.json({ success: true, marked: result.affectedRows });
  })
);

router.delete(
  '/:id',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    await db.execute('DELETE FROM notifications WHERE id = ? AND user_id = ?', [
      req.params.id, req.auth.profile.id,
    ]);
    res.json({ success: true });
  })
);

/** Broadcast to a role, or to specific people. */
const broadcastSchema = z.object({
  title: z.string().trim().min(1).max(255),
  body: longText,
  type: z.enum(TYPES).default('info'),
  link: optionalText(500),
  role: z.enum(['all', 'institution_admin', 'principal', 'teacher', 'student', 'parent', 'staff']).default('all'),
  profileIds: z.array(z.string().uuid()).optional(),
});

router.post(
  '/broadcast',
  requirePermission('communication.write'),
  validate({ body: broadcastSchema }),
  asyncHandler(async (req, res) => {
    const { title, body, type, link, role, profileIds } = req.body;

    let recipients;
    if (profileIds?.length) {
      const [rows] = await db.query(
        'SELECT id FROM user_profiles WHERE institution_id = ? AND is_active = 1 AND id IN (?)',
        [req.institutionId, profileIds]
      );
      recipients = rows;
    } else {
      const [rows] = role === 'all'
        ? await db.execute(
          'SELECT id FROM user_profiles WHERE institution_id = ? AND is_active = 1',
          [req.institutionId]
        )
        : await db.execute(
          'SELECT id FROM user_profiles WHERE institution_id = ? AND is_active = 1 AND role = ?',
          [req.institutionId, role]
        );
      recipients = rows;
    }

    if (recipients.length === 0) {
      throw ApiError.badRequest('No active recipients matched that audience.');
    }

    const values = recipients.map((recipient) => [
      uuidv4(), req.institutionId, recipient.id, title, body || null,
      type, link || null, req.auth.profile.id,
    ]);

    await db.query(
      `INSERT INTO notifications
         (id, institution_id, user_id, title, body, type, link, created_by)
       VALUES ?`,
      [values]
    );

    res.status(201).json({ success: true, delivered: recipients.length });
  })
);

export default router;
