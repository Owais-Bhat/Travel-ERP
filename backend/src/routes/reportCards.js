/**
 * Report Card Generator — pulls a student's exam results across every exam
 * so the frontend can render a printable marksheet. No new table: this
 * reads the existing `exams` / `exam_results` / `students` data.
 */
import express from 'express';
import db from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requireFeature } from '../middleware/feature.js';
import { requirePermission } from '../auth/permissions.js';
import { asyncHandler } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { findOwnedOrFail } from '../lib/query.js';
import { z } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('report_cards'));

router.get(
  '/student/:studentId',
  requirePermission('exams.read'),
  validate({ params: z.object({ studentId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const student = await findOwnedOrFail(db, 'students', req.params.studentId, req.institutionId);

    const [results] = await db.execute(
      `SELECT r.marks_obtained, r.grade, r.remarks,
              e.id AS exam_id, e.title AS exam_title, e.subject, e.exam_date, e.total_marks, e.pass_marks
         FROM exam_results r
         JOIN exams e ON e.id = r.exam_id
        WHERE r.student_id = ? AND e.institution_id = ?
        ORDER BY e.exam_date DESC`,
      [student.id, req.institutionId]
    );

    res.json({ student, results });
  })
);

export default router;
