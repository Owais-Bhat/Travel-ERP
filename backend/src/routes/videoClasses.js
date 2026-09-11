/**
 * Video Classes — schedules a link-based session (Zoom/Meet/etc). This does
 * not host video itself; it stores the meeting link, time and roster
 * context so the class shows up on the timetable and everyone has the same
 * join link.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db, { withTransaction } from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requireFeature } from '../middleware/feature.js';
import { requirePermission, requirePermissionOrSelfService } from '../auth/permissions.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { findOwnedOrFail, buildUpdate } from '../lib/query.js';
import { resolveRoleScope, inClause } from '../lib/roleScope.js';
import { z, optionalText, idParam, partialUpdate } from '../validation/common.js';
import { env } from '../lib/env.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('video_classes'));

const UPDATABLE = ['title', 'subject', 'class_name', 'teacher_id', 'meeting_link', 'mode', 'scheduled_at', 'duration_minutes', 'status'];

const classSchema = z.object({
  title: z.string().trim().min(1).max(255),
  subject: optionalText(100),
  class_name: optionalText(50),
  teacher_id: z.string().uuid().nullable().optional(),
  mode: z.enum(['external', 'jitsi']).default('external'),
  meeting_link: z.string().trim().url('Must be a valid URL').max(500).optional(),
  scheduled_at: z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/, 'Use YYYY-MM-DD HH:MM'),
  duration_minutes: z.coerce.number().int().min(5).max(600).default(40),
}).refine((body) => body.mode !== 'external' || Boolean(body.meeting_link), {
  message: 'Meeting link is required for an external class',
  path: ['meeting_link'],
});

/** Adds a ready-to-join room_url for in-app classes; external classes keep using meeting_link. */
function withRoomUrl(row) {
  if (row.mode !== 'jitsi' || !row.room_name || !env.jitsiDomain) return row;
  return { ...row, room_url: `https://${env.jitsiDomain}/${row.room_name}` };
}

router.get(
  '/',
  requirePermissionOrSelfService('students.read'),
  validate({ query: z.object({ status: z.enum(['scheduled', 'completed', 'cancelled']).optional() }) }),
  asyncHandler(async (req, res) => {
    // A student/parent only sees classes scheduled for their own class(es).
    const scope = await resolveRoleScope(req);
    const ownClause = scope ? inClause('v.class_name', scope.classNames) : null;

    const [rows] = await db.execute(
      `SELECT v.*, t.first_name AS teacher_first_name, t.last_name AS teacher_last_name
         FROM video_classes v
         LEFT JOIN teachers t ON t.id = v.teacher_id
        WHERE v.institution_id = ? AND (? IS NULL OR v.status = ?)
          ${ownClause ? `AND ${ownClause.sql}` : ''}
        ORDER BY v.scheduled_at DESC
        LIMIT 200`,
      [req.institutionId, req.query.status || null, req.query.status || null, ...(ownClause ? ownClause.params : [])]
    );
    res.json(rows.map(withRoomUrl));
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
    // A client-supplied room name would let anyone guess/collide into
    // another class's room — always generate it server-side, tenant-scoped.
    const roomName = body.mode === 'jitsi' ? `${req.institutionId}-${uuidv4().slice(0, 8)}` : null;
    await db.execute(
      `INSERT INTO video_classes
         (id, institution_id, title, subject, class_name, teacher_id, meeting_link, mode, room_name, scheduled_at, duration_minutes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
      [
        id, req.institutionId, body.title, body.subject, body.class_name,
        body.teacher_id || null, body.meeting_link || null, body.mode, roomName,
        body.scheduled_at.replace('T', ' '), body.duration_minutes,
      ]
    );
    const created = await findOwnedOrFail(db, 'video_classes', id, req.institutionId);
    res.status(201).json(withRoomUrl(created));
  })
);

router.put(
  '/:id',
  requirePermission('students.write'),
  validate({ params: idParam, body: partialUpdate(classSchema) }),
  asyncHandler(async (req, res) => {
    const existing = await findOwnedOrFail(db, 'video_classes', req.params.id, req.institutionId);

    const payload = { ...req.body };
    if (payload.scheduled_at) payload.scheduled_at = payload.scheduled_at.replace('T', ' ');

    const update = buildUpdate(payload, UPDATABLE);
    if (!update) throw ApiError.badRequest('No updatable fields provided');

    // Switching into in-app mode needs a room even if one wasn't set at
    // creation time — generate it the same server-side way as POST.
    if (payload.mode === 'jitsi' && !existing.room_name) {
      await db.execute('UPDATE video_classes SET room_name = ? WHERE id = ? AND institution_id = ?', [
        `${req.institutionId}-${uuidv4().slice(0, 8)}`, req.params.id, req.institutionId,
      ]);
    }

    await db.execute(
      `UPDATE video_classes SET ${update.sql} WHERE id = ? AND institution_id = ?`,
      [...update.params, req.params.id, req.institutionId]
    );
    const updated = await findOwnedOrFail(db, 'video_classes', req.params.id, req.institutionId);
    res.json(withRoomUrl(updated));
  })
);

/** Self-marks the caller present today for this class's own class_name — used when their Jitsi room fires "joined". */
router.post(
  '/:id/attendance',
  requirePermissionOrSelfService('attendance.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const videoClass = await findOwnedOrFail(db, 'video_classes', req.params.id, req.institutionId);

    const scope = await resolveRoleScope(req);
    if (!scope || !['student', 'parent'].includes(req.auth.profile.role)) {
      throw ApiError.forbidden('Only a student can self-mark their own attendance.');
    }
    if (req.auth.profile.role === 'student' && scope.studentIds.length !== 1) {
      throw ApiError.badRequest('No linked student record found for this account.');
    }
    // Parent accounts can have multiple children; only a student login has
    // exactly one "self" to mark, so only students trigger this from the app.
    const studentId = req.auth.profile.role === 'student' ? scope.studentIds[0] : null;
    if (!studentId) throw ApiError.forbidden('Only a student can self-mark their own attendance.');

    const today = new Date().toISOString().slice(0, 10);
    await db.execute(
      `INSERT INTO attendance (id, institution_id, student_id, class_name, date, status, marked_by)
       VALUES (?, ?, ?, ?, ?, 'present', ?)
       ON DUPLICATE KEY UPDATE status = 'present'`,
      [uuidv4(), req.institutionId, studentId, videoClass.class_name, today, req.auth.profile.id]
    );

    res.json({ success: true });
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
