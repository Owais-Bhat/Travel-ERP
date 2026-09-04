/**
 * Parent-Teacher Meeting Scheduler.
 *
 * A teacher opens time slots; a parent books one for their child. Booking
 * locks the row with `FOR UPDATE` so two parents can't grab the same slot,
 * same pattern as transport.js's seat-capacity check.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db, { withTransaction } from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requireFeature } from '../middleware/feature.js';
import { requirePermission } from '../auth/permissions.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { findOwnedOrFail } from '../lib/query.js';
import { z, optionalText, isoDate, idParam } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('ptm_scheduler'));

const timeOfDay = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use HH:MM');

const slotSchema = z.object({
  teacher_id: z.string().uuid(),
  slot_date: isoDate,
  start_time: timeOfDay,
  end_time: timeOfDay,
  notes: optionalText(500),
});

router.get(
  '/slots',
  asyncHandler(async (req, res) => {
    const { teacher_id, open } = req.query;
    const conditions = ['institution_id = ?'];
    const params = [req.institutionId];
    if (teacher_id) { conditions.push('teacher_id = ?'); params.push(teacher_id); }
    if (open === 'true') { conditions.push("status = 'open'"); }

    const [rows] = await db.execute(
      `SELECT p.*, t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
              s.first_name AS student_first_name, s.last_name AS student_last_name
         FROM ptm_slots p
         JOIN teachers t ON t.id = p.teacher_id
         LEFT JOIN students s ON s.id = p.student_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.slot_date, p.start_time`,
      params
    );
    res.json(rows);
  })
);

router.post(
  '/slots',
  requirePermission('students.write'),
  validate({ body: slotSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (body.end_time <= body.start_time) throw ApiError.badRequest('end_time must be after start_time');

    const id = uuidv4();
    await db.execute(
      `INSERT INTO ptm_slots (id, institution_id, teacher_id, slot_date, start_time, end_time, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
      [id, req.institutionId, body.teacher_id, body.slot_date, body.start_time, body.end_time, body.notes]
    );
    const created = await findOwnedOrFail(db, 'ptm_slots', id, req.institutionId);
    res.status(201).json(created);
  })
);

router.post(
  '/slots/:id/book',
  validate({ params: idParam, body: z.object({ student_id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const slot = await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM ptm_slots WHERE id = ? AND institution_id = ? FOR UPDATE',
        [req.params.id, req.institutionId]
      );
      const existing = rows[0];
      if (!existing) throw ApiError.notFound('Slot not found');
      if (existing.status !== 'open') throw ApiError.conflict('This slot is already booked.');

      const [studentRows] = await connection.execute(
        'SELECT id FROM students WHERE id = ? AND institution_id = ?',
        [req.body.student_id, req.institutionId]
      );
      if (studentRows.length === 0) throw ApiError.notFound('Student not found in this institution');

      await connection.execute(
        `UPDATE ptm_slots SET status = 'booked', student_id = ?, booked_by = ? WHERE id = ?`,
        [req.body.student_id, req.auth.profile.id, existing.id]
      );
      const [updated] = await connection.execute('SELECT * FROM ptm_slots WHERE id = ?', [existing.id]);
      return updated[0];
    });

    res.json(slot);
  })
);

router.delete(
  '/slots/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const existing = await findOwnedOrFail(db, 'ptm_slots', req.params.id, req.institutionId);
    const canCancel = existing.booked_by === req.auth.profile.id
      || ['super_admin', 'admin', 'institution_admin', 'principal', 'staff', 'teacher'].includes(req.auth.profile.role);
    if (!canCancel) throw ApiError.forbidden('You can only cancel your own booking.');

    await db.execute(`UPDATE ptm_slots SET status = 'cancelled' WHERE id = ? AND institution_id = ?`, [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

export default router;
