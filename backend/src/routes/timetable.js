/**
 * Timetable — weekly class schedule with teacher clash detection.
 *
 * A slot is unique per (class, section, day, period); a teacher can't be
 * booked into two slots at the same day+period regardless of class — that
 * check is application-level since it spans the whole institution, not one
 * class's slot.
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
import { idParam } from '../validation/common.js';
import { z, optionalText } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('timetable'));

router.get(
  '/',
  requirePermission('students.read'),
  validate({ query: z.object({ class_name: z.string().min(1).max(50), section: z.string().max(20).optional() }) }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT s.*, t.first_name AS teacher_first_name, t.last_name AS teacher_last_name
         FROM timetable_slots s
         LEFT JOIN teachers t ON t.id = s.teacher_id
        WHERE s.institution_id = ? AND s.class_name = ? AND s.section = ?
        ORDER BY s.day_of_week, s.period_number`,
      [req.institutionId, req.query.class_name, req.query.section || '']
    );
    res.json(rows);
  })
);

router.get(
  '/teacher/:teacherId',
  requirePermission('students.read'),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT * FROM timetable_slots WHERE institution_id = ? AND teacher_id = ? ORDER BY day_of_week, period_number`,
      [req.institutionId, req.params.teacherId]
    );
    res.json(rows);
  })
);

const slotSchema = z.object({
  class_name: z.string().trim().min(1).max(50),
  section: optionalText(20),
  day_of_week: z.coerce.number().int().min(0).max(6),
  period_number: z.coerce.number().int().min(1).max(20),
  subject: z.string().trim().min(1).max(100),
  teacher_id: z.string().uuid().nullable().optional(),
  start_time: optionalText(8),
  end_time: optionalText(8),
});

router.post(
  '/',
  requirePermission('students.write'),
  validate({ body: slotSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const section = body.section || '';

    if (body.teacher_id) {
      const [clashRows] = await db.execute(
        `SELECT class_name, section FROM timetable_slots
          WHERE institution_id = ? AND teacher_id = ? AND day_of_week = ? AND period_number = ?
            AND NOT (class_name = ? AND section = ?)`,
        [req.institutionId, body.teacher_id, body.day_of_week, body.period_number, body.class_name, section]
      );
      if (clashRows.length > 0) {
        throw ApiError.conflict(
          `This teacher already has a class (${clashRows[0].class_name}${clashRows[0].section ? ` ${clashRows[0].section}` : ''}) at this day/period.`
        );
      }
    }

    const id = uuidv4();
    await db.execute(
      `INSERT INTO timetable_slots
         (id, institution_id, class_name, section, day_of_week, period_number, subject, teacher_id, start_time, end_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         subject = VALUES(subject), teacher_id = VALUES(teacher_id),
         start_time = VALUES(start_time), end_time = VALUES(end_time)`,
      [
        id, req.institutionId, body.class_name, section, body.day_of_week, body.period_number,
        body.subject, body.teacher_id || null, body.start_time || null, body.end_time || null,
      ]
    );

    const [rows] = await db.execute(
      `SELECT * FROM timetable_slots
        WHERE institution_id = ? AND class_name = ? AND section = ? AND day_of_week = ? AND period_number = ?`,
      [req.institutionId, body.class_name, section, body.day_of_week, body.period_number]
    );
    res.status(201).json(rows[0]);
  })
);

router.delete(
  '/:id',
  requirePermission('students.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      'SELECT id FROM timetable_slots WHERE id = ? AND institution_id = ?',
      [req.params.id, req.institutionId]
    );
    if (!rows[0]) throw ApiError.notFound('Slot not found');
    await db.execute('DELETE FROM timetable_slots WHERE id = ? AND institution_id = ?', [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

export default router;
