/**
 * Video Classes — schedules a link-based session (Zoom/Meet/etc). This does
 * not host video itself; it stores the meeting link, time and roster
 * context so the class shows up on the timetable and everyone has the same
 * join link.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requireFeature } from '../middleware/feature.js';
import { requirePermission } from '../auth/permissions.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { findOwnedOrFail, buildUpdate } from '../lib/query.js';
import { z, optionalText, idParam, partialUpdate } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('video_classes'));

const UPDATABLE = ['title', 'subject', 'class_name', 'teacher_id', 'meeting_link', 'scheduled_at', 'duration_minutes', 'status'];

const classSchema = z.object({
  title: z.string().trim().min(1).max(255),
  subject: optionalText(100),
  class_name: optionalText(50),
  teacher_id: z.string().uuid().nullable().optional(),
  meeting_link: z.string().trim().url('Must be a valid URL').max(500),
  scheduled_at: z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/, 'Use YYYY-MM-DD HH:MM'),
  duration_minutes: z.coerce.number().int().min(5).max(600).default(40),
});

router.get(
  '/',
  requirePermission('students.read'),
  validate({ query: z.object({ status: z.enum(['scheduled', 'completed', 'cancelled']).optional() }) }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT v.*, t.first_name AS teacher_first_name, t.last_name AS teacher_last_name
         FROM video_classes v
         LEFT JOIN teachers t ON t.id = v.teacher_id
        WHERE v.institution_id = ? AND (? IS NULL OR v.status = ?)
        ORDER BY v.scheduled_at DESC
        LIMIT 200`,
      [req.institutionId, req.query.status || null, req.query.status || null]
    );
    res.json(rows);
  })
);

router.post(
  '/',
  requirePermission('students.write'),
  validate({ body: classSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (body.teacher_id) await findOwnedOrFail(db, 'teachers', body.teacher_id, req.institutionId);

    const id = uuidv4();
    await db.execute(
      `INSERT INTO video_classes
         (id, institution_id, title, subject, class_name, teacher_id, meeting_link, scheduled_at, duration_minutes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
      [
        id, req.institutionId, body.title, body.subject, body.class_name,
        body.teacher_id || null, body.meeting_link, body.scheduled_at.replace('T', ' '), body.duration_minutes,
      ]
    );
    const created = await findOwnedOrFail(db, 'video_classes', id, req.institutionId);
    res.status(201).json(created);
  })
);

router.put(
  '/:id',
  requirePermission('students.write'),
  validate({ params: idParam, body: partialUpdate(classSchema) }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'video_classes', req.params.id, req.institutionId);

    const payload = { ...req.body };
    if (payload.scheduled_at) payload.scheduled_at = payload.scheduled_at.replace('T', ' ');

    const update = buildUpdate(payload, UPDATABLE);
    if (!update) throw ApiError.badRequest('No updatable fields provided');
    await db.execute(
      `UPDATE video_classes SET ${update.sql} WHERE id = ? AND institution_id = ?`,
      [...update.params, req.params.id, req.institutionId]
    );
    const updated = await findOwnedOrFail(db, 'video_classes', req.params.id, req.institutionId);
    res.json(updated);
  })
);

router.delete(
  '/:id',
  requirePermission('students.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'video_classes', req.params.id, req.institutionId);
    await db.execute('DELETE FROM video_classes WHERE id = ? AND institution_id = ?', [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

export default router;
