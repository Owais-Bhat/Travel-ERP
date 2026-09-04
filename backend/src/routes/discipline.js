/**
 * Discipline / Behavior Tracking — merit and demerit point log per student.
 *
 * Reuses the existing students.read/students.write permissions rather than
 * adding new keys, matching the precedent set by transport.js.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requireFeature } from '../middleware/feature.js';
import { requirePermission } from '../auth/permissions.js';
import { recordAuditEvent } from '../lib/audit.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { findOwnedOrFail } from '../lib/query.js';
import { z, longText, idParam } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('discipline'));

const recordSchema = z.object({
  student_id: z.string().uuid(),
  record_type: z.enum(['merit', 'demerit']).default('demerit'),
  points: z.coerce.number().int().min(0).max(1000).default(1),
  reason: longText,
});

router.get(
  '/',
  requirePermission('students.read'),
  asyncHandler(async (req, res) => {
    const studentId = req.query.student_id;
    const [rows] = await db.execute(
      studentId
        ? `SELECT d.*, s.first_name, s.last_name, s.admission_no, s.class_name
             FROM discipline_records d
             JOIN students s ON s.id = d.student_id
            WHERE d.institution_id = ? AND d.student_id = ?
            ORDER BY d.created_at DESC`
        : `SELECT d.*, s.first_name, s.last_name, s.admission_no, s.class_name
             FROM discipline_records d
             JOIN students s ON s.id = d.student_id
            WHERE d.institution_id = ?
            ORDER BY d.created_at DESC
            LIMIT 200`,
      studentId ? [req.institutionId, studentId] : [req.institutionId]
    );
    res.json(rows);
  })
);

router.post(
  '/',
  requirePermission('students.write'),
  validate({ body: recordSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const student = await findOwnedOrFail(db, 'students', body.student_id, req.institutionId);

    const id = uuidv4();
    await db.execute(
      `INSERT INTO discipline_records (id, institution_id, student_id, record_type, points, reason, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, req.institutionId, student.id, body.record_type, body.points, body.reason, req.auth.profile.id]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: `discipline.${body.record_type}`,
      description: `${body.record_type} (${body.points} pts) recorded for ${student.first_name} ${student.last_name || ''}`.trim(),
      entityType: 'discipline_record',
      entityId: id,
      severity: body.record_type === 'demerit' ? 'warning' : 'success',
    });

    const created = await findOwnedOrFail(db, 'discipline_records', id, req.institutionId);
    res.status(201).json(created);
  })
);

router.delete(
  '/:id',
  requirePermission('students.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'discipline_records', req.params.id, req.institutionId);
    await db.execute('DELETE FROM discipline_records WHERE id = ? AND institution_id = ?', [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

export default router;
