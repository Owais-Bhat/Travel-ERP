/**
 * Substitute Teacher Management — assign a stand-in teacher to a specific
 * timetable slot on a specific date when the regular teacher is away.
 * Clash-checked against the substitute's own schedule for that day/period,
 * same shape as timetable.js's own clash check.
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
import { findOwnedOrFail } from '../lib/query.js';
import { z, optionalText, isoDate, idParam } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('substitute_teacher'));

const assignSchema = z.object({
  timetable_slot_id: z.string().uuid(),
  substitute_teacher_id: z.string().uuid(),
  assignment_date: isoDate,
  reason: optionalText(255),
});

router.get(
  '/',
  requirePermission('students.read'),
  asyncHandler(async (req, res) => {
    const { date } = req.query;
    const conditions = ['sa.institution_id = ?'];
    const params = [req.institutionId];
    if (date) { conditions.push('sa.assignment_date = ?'); params.push(date); }

    const [rows] = await db.execute(
      `SELECT sa.*, ts.class_name, ts.section, ts.subject, ts.day_of_week, ts.period_number,
              ot.first_name AS original_first_name, ot.last_name AS original_last_name,
              st.first_name AS substitute_first_name, st.last_name AS substitute_last_name
         FROM substitute_assignments sa
         JOIN timetable_slots ts ON ts.id = sa.timetable_slot_id
         LEFT JOIN teachers ot ON ot.id = sa.original_teacher_id
         JOIN teachers st ON st.id = sa.substitute_teacher_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY sa.assignment_date DESC`,
      params
    );
    res.json(rows);
  })
);

router.post(
  '/',
  requirePermission('students.write'),
  validate({ body: assignSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const slot = await findOwnedOrFail(db, 'timetable_slots', body.timetable_slot_id, req.institutionId);

    const [clash] = await db.execute(
      `SELECT sa.id FROM substitute_assignments sa
         JOIN timetable_slots ts ON ts.id = sa.timetable_slot_id
        WHERE sa.substitute_teacher_id = ? AND sa.assignment_date = ? AND ts.day_of_week = ? AND ts.period_number = ?`,
      [body.substitute_teacher_id, body.assignment_date, slot.day_of_week, slot.period_number]
    );
    if (clash.length > 0) throw ApiError.conflict('This teacher already has a substitute assignment at that day/period.');

    const [existing] = await db.execute(
      'SELECT id FROM substitute_assignments WHERE timetable_slot_id = ? AND assignment_date = ?',
      [body.timetable_slot_id, body.assignment_date]
    );
    if (existing.length > 0) throw ApiError.conflict('A substitute is already assigned for this slot on this date.');

    const id = uuidv4();
    await db.execute(
      `INSERT INTO substitute_assignments (id, institution_id, timetable_slot_id, original_teacher_id, substitute_teacher_id, assignment_date, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, req.institutionId, body.timetable_slot_id, slot.teacher_id, body.substitute_teacher_id, body.assignment_date, body.reason]
    );

    const created = await findOwnedOrFail(db, 'substitute_assignments', id, req.institutionId);
    res.status(201).json(created);
  })
);

router.delete(
  '/:id',
  requirePermission('students.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'substitute_assignments', req.params.id, req.institutionId);
    await db.execute('DELETE FROM substitute_assignments WHERE id = ? AND institution_id = ?', [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

export default router;
