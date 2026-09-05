/**
 * Health / Nurse Records — one record per student (blood group, allergies,
 * emergency contact) plus a log of infirmary visits.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requireFeature } from '../middleware/feature.js';
import { requirePermission } from '../auth/permissions.js';
import { asyncHandler } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { findOwnedOrFail } from '../lib/query.js';
import { z, optionalText, longText, isoDate, phone, idParam } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('health_records'));

const recordSchema = z.object({
  blood_group: optionalText(10),
  allergies: longText,
  medical_conditions: longText,
  emergency_contact_name: optionalText(200),
  emergency_contact_phone: phone,
  notes: longText,
});

const visitSchema = z.object({
  student_id: z.string().uuid(),
  visit_date: isoDate,
  reason: z.string().trim().min(1).max(255),
  treatment: longText,
  notes: longText,
});

router.get(
  '/:studentId',
  requirePermission('students.read'),
  validate({ params: z.object({ studentId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'students', req.params.studentId, req.institutionId);
    const [rows] = await db.execute('SELECT * FROM health_records WHERE student_id = ? AND institution_id = ?', [
      req.params.studentId, req.institutionId,
    ]);
    const [visits] = await db.execute(
      'SELECT * FROM infirmary_visits WHERE student_id = ? AND institution_id = ? ORDER BY visit_date DESC',
      [req.params.studentId, req.institutionId]
    );
    res.json({ record: rows[0] || null, visits });
  })
);

router.put(
  '/:studentId',
  requirePermission('students.write'),
  validate({ params: z.object({ studentId: z.string().uuid() }), body: recordSchema }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'students', req.params.studentId, req.institutionId);
    const body = req.body;

    const [existing] = await db.execute('SELECT id FROM health_records WHERE student_id = ? AND institution_id = ?', [
      req.params.studentId, req.institutionId,
    ]);

    if (existing[0]) {
      await db.execute(
        `UPDATE health_records SET blood_group = ?, allergies = ?, medical_conditions = ?,
                emergency_contact_name = ?, emergency_contact_phone = ?, notes = ?
          WHERE id = ?`,
        [body.blood_group, body.allergies, body.medical_conditions, body.emergency_contact_name, body.emergency_contact_phone, body.notes, existing[0].id]
      );
    } else {
      await db.execute(
        `INSERT INTO health_records (id, institution_id, student_id, blood_group, allergies, medical_conditions, emergency_contact_name, emergency_contact_phone, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), req.institutionId, req.params.studentId, body.blood_group, body.allergies, body.medical_conditions, body.emergency_contact_name, body.emergency_contact_phone, body.notes]
      );
    }

    const [rows] = await db.execute('SELECT * FROM health_records WHERE student_id = ? AND institution_id = ?', [
      req.params.studentId, req.institutionId,
    ]);
    res.json(rows[0]);
  })
);

router.post(
  '/visits',
  requirePermission('students.write'),
  validate({ body: visitSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    await findOwnedOrFail(db, 'students', body.student_id, req.institutionId);

    const id = uuidv4();
    await db.execute(
      `INSERT INTO infirmary_visits (id, institution_id, student_id, visit_date, reason, treatment, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, req.institutionId, body.student_id, body.visit_date, body.reason, body.treatment, body.notes]
    );
    const created = await findOwnedOrFail(db, 'infirmary_visits', id, req.institutionId);
    res.status(201).json(created);
  })
);

router.delete(
  '/visits/:id',
  requirePermission('students.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'infirmary_visits', req.params.id, req.institutionId);
    await db.execute('DELETE FROM infirmary_visits WHERE id = ? AND institution_id = ?', [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

export default router;
