/**
 * Announcements and direct messages.
 *
 * The communication module was never ported off Supabase, so announcements
 * and messaging were inert against the MySQL backend. This is that port.
 * Realtime is replaced by polling — see the `since` parameter on the inbox.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db, { withTransaction } from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requireFeature } from '../middleware/feature.js';
import { requirePermission } from '../auth/permissions.js';
import { recordAuditEvent } from '../lib/audit.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { z, optionalText, longText, listQuery, idParam } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('communication'));

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const AUDIENCES = ['all', 'teachers', 'students', 'parents', 'staff'];

/** Which audiences a given role should see in their feed. */
const AUDIENCE_FOR_ROLE = {
  teacher: ['all', 'teachers'],
  student: ['all', 'students'],
  parent: ['all', 'parents'],
  staff: ['all', 'staff'],
};

// ==================================================================
// Announcements
// ==================================================================
router.get(
  '/announcements',
  requirePermission('communication.read'),
  validate({ query: listQuery.extend({ priority: z.enum(PRIORITIES).optional() }) }),
  asyncHandler(async (req, res) => {
    const role = req.auth.profile.role;
    const conditions = ['a.institution_id = ?'];
    const params = [req.institutionId];

    // Admins see the whole board; everyone else sees what is addressed to them.
    const visibleTo = AUDIENCE_FOR_ROLE[role];
    if (visibleTo) {
      conditions.push(`a.target_audience IN (${visibleTo.map(() => '?').join(', ')})`);
      params.push(...visibleTo);
    }
    if (req.query.priority) {
      conditions.push('a.priority = ?');
      params.push(req.query.priority);
    }
    if (req.query.search) {
      conditions.push('(a.title LIKE ? OR a.content LIKE ?)');
      params.push(`%${req.query.search}%`, `%${req.query.search}%`);
    }

    const limit = Math.min(200, Number(req.query.limit || req.query.pageSize || 50));
    const [rows] = await db.query(
      `SELECT a.*, u.first_name, u.last_name,
              CONCAT_WS(' ', u.first_name, u.last_name) AS author_name
         FROM announcements a
         LEFT JOIN user_profiles u ON u.id = a.created_by
        WHERE ${conditions.join(' AND ')}
        ORDER BY FIELD(a.priority, 'urgent', 'high', 'normal', 'low'), a.created_at DESC
        LIMIT ${limit}`,
      params
    );

    res.json(rows);
  })
);

const announcementSchema = z.object({
  title: z.string().trim().min(1).max(255),
  content: z.string().trim().min(1).max(20000),
  priority: z.enum(PRIORITIES).default('normal'),
  target_audience: z.enum(AUDIENCES).default('all'),
  notify: z.boolean().default(true),
});

router.post(
  '/announcements',
  requirePermission('communication.write'),
  validate({ body: announcementSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const id = uuidv4();

    await withTransaction(async (connection) => {
      await connection.execute(
        `INSERT INTO announcements
           (id, institution_id, title, content, priority, target_audience, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id, req.institutionId, body.title, body.content,
          body.priority, body.target_audience, req.auth.profile.id,
        ]
      );

      // Fan out to the notification bell in the same transaction, so an
      // announcement never exists without its notifications.
      if (body.notify) {
        const roleFilter = {
          teachers: 'teacher', students: 'student', parents: 'parent', staff: 'staff',
        }[body.target_audience];

        const [recipients] = roleFilter
          ? await connection.execute(
            'SELECT id FROM user_profiles WHERE institution_id = ? AND is_active = 1 AND role = ? AND id <> ?',
            [req.institutionId, roleFilter, req.auth.profile.id]
          )
          : await connection.execute(
            'SELECT id FROM user_profiles WHERE institution_id = ? AND is_active = 1 AND id <> ?',
            [req.institutionId, req.auth.profile.id]
          );

        if (recipients.length > 0) {
          await connection.query(
            `INSERT INTO notifications
               (id, institution_id, user_id, title, body, type, link, created_by)
             VALUES ?`,
            [recipients.map((recipient) => [
              uuidv4(), req.institutionId, recipient.id, body.title,
              body.content.slice(0, 500), 'info', '/communication', req.auth.profile.id,
            ])]
          );
        }
      }
    });

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'announcement.posted',
      description: body.title,
      entityType: 'announcement',
      entityId: id,
    });

    const [rows] = await db.execute(
      `SELECT a.*, CONCAT_WS(' ', u.first_name, u.last_name) AS author_name
         FROM announcements a LEFT JOIN user_profiles u ON u.id = a.created_by
        WHERE a.id = ?`,
      [id]
    );
    res.status(201).json(rows[0]);
  })
);

router.delete(
  '/announcements/:id',
  requirePermission('communication.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      'SELECT * FROM announcements WHERE id = ? AND institution_id = ?',
      [req.params.id, req.institutionId]
    );
    const announcement = rows[0];
    if (!announcement) throw ApiError.notFound('Announcement not found');

    const isAuthor = announcement.created_by === req.auth.profile.id;
    const isAdmin = ['super_admin', 'admin', 'institution_admin', 'principal'].includes(req.auth.profile.role);
    if (!isAuthor && !isAdmin) {
      throw ApiError.forbidden('You can only delete your own announcements.');
    }

    await db.execute('DELETE FROM announcements WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  })
);

// ==================================================================
// Direct messages
// ==================================================================
router.get(
  '/messages',
  requirePermission('communication.read'),
  validate({
    query: z.object({
      box: z.enum(['inbox', 'sent']).default('inbox'),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      since: z.string().optional(),
    }).passthrough(),
  }),
  asyncHandler(async (req, res) => {
    const isInbox = req.query.box === 'inbox';
    const conditions = [
      isInbox ? 'm.recipient_id = ?' : 'm.sender_id = ?',
      'm.institution_id = ?',
    ];
    const params = [req.auth.profile.id, req.institutionId];

    if (req.query.since) {
      conditions.push('m.created_at > ?');
      params.push(req.query.since);
    }

    const [rows] = await db.query(
      // `sender`/`recipient` are nested objects so the client can render
      // them the same way it did against the Supabase joined query.
      `SELECT m.*,
              CONCAT_WS(' ', sp.first_name, sp.last_name) AS sender_name,
              CONCAT_WS(' ', rp.first_name, rp.last_name) AS recipient_name,
              JSON_OBJECT('first_name', sp.first_name, 'last_name', sp.last_name, 'role', sp.role) AS sender,
              JSON_OBJECT('first_name', rp.first_name, 'last_name', rp.last_name, 'role', rp.role) AS recipient
         FROM messages m
         LEFT JOIN user_profiles sp ON sp.id = m.sender_id
         LEFT JOIN user_profiles rp ON rp.id = m.recipient_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY m.created_at DESC
        LIMIT ${Number(req.query.limit)}`,
      params
    );

    const [[counts]] = await db.execute(
      'SELECT SUM(is_read = 0) AS unread FROM messages WHERE recipient_id = ? AND institution_id = ?',
      [req.auth.profile.id, req.institutionId]
    );

    res.json({ messages: rows, unread: Number(counts.unread) || 0 });
  })
);

router.post(
  '/messages',
  requirePermission('communication.write'),
  validate({
    body: z.object({
      recipient_id: z.string().uuid(),
      subject: optionalText(255),
      body: z.string().trim().min(1).max(20000),
    }),
  }),
  asyncHandler(async (req, res) => {
    if (req.body.recipient_id === req.auth.profile.id) {
      throw ApiError.badRequest('You cannot message yourself.');
    }

    const [recipients] = await db.execute(
      'SELECT id FROM user_profiles WHERE id = ? AND institution_id = ? AND is_active = 1',
      [req.body.recipient_id, req.institutionId]
    );
    if (recipients.length === 0) {
      throw ApiError.notFound('That recipient is not an active member of this institution.');
    }

    const id = uuidv4();
    await withTransaction(async (connection) => {
      await connection.execute(
        `INSERT INTO messages (id, institution_id, sender_id, recipient_id, subject, body)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, req.institutionId, req.auth.profile.id, req.body.recipient_id, req.body.subject, req.body.body]
      );

      await connection.execute(
        `INSERT INTO notifications
           (id, institution_id, user_id, title, body, type, link, created_by)
         VALUES (?, ?, ?, ?, ?, 'info', '/communication', ?)`,
        [
          uuidv4(), req.institutionId, req.body.recipient_id,
          req.body.subject || 'New message',
          req.body.body.slice(0, 300),
          req.auth.profile.id,
        ]
      );
    });

    const [rows] = await db.execute(
      `SELECT m.*, CONCAT_WS(' ', rp.first_name, rp.last_name) AS recipient_name,
              JSON_OBJECT('first_name', rp.first_name, 'last_name', rp.last_name, 'role', rp.role) AS recipient
         FROM messages m LEFT JOIN user_profiles rp ON rp.id = m.recipient_id
        WHERE m.id = ?`,
      [id]
    );
    res.status(201).json(rows[0]);
  })
);

router.post(
  '/messages/:id/read',
  requirePermission('communication.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const [result] = await db.execute(
      'UPDATE messages SET is_read = 1 WHERE id = ? AND recipient_id = ?',
      [req.params.id, req.auth.profile.id]
    );
    if (result.affectedRows === 0) throw ApiError.notFound('Message not found');
    res.json({ success: true });
  })
);

/** People in this tenant the caller can message. */
router.get(
  '/recipients',
  requirePermission('communication.write'),
  validate({ query: z.object({ search: z.string().trim().max(120).optional() }).passthrough() }),
  asyncHandler(async (req, res) => {
    const conditions = ['institution_id = ?', 'is_active = 1', 'id <> ?'];
    const params = [req.institutionId, req.auth.profile.id];

    if (req.query.search) {
      conditions.push('(first_name LIKE ? OR last_name LIKE ?)');
      params.push(`%${req.query.search}%`, `%${req.query.search}%`);
    }

    const [rows] = await db.query(
      `SELECT id, first_name, last_name, role, avatar_url
         FROM user_profiles
        WHERE ${conditions.join(' AND ')}
        ORDER BY first_name, last_name
        LIMIT 20`,
      params
    );
    res.json(rows);
  })
);

export default router;
