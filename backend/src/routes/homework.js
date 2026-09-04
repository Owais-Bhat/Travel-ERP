/**
 * Homework — assignments posted per class, submitted per student.
 *
 * One submission per (homework, student), same upsert-on-resubmit pattern
 * as library issues / payroll records.
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
import { z, optionalText, longText, idParam } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('homework'));

router.get(
  '/',
  requirePermission('students.read'),
  validate({ query: z.object({ class_name: z.string().max(50).optional() }) }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT h.*, t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
              (SELECT COUNT(*) FROM homework_submissions s WHERE s.homework_id = h.id) AS submission_count
         FROM homework h
         LEFT JOIN teachers t ON t.id = h.teacher_id
        WHERE h.institution_id = ? AND (? IS NULL OR h.class_name = ?)
        ORDER BY h.due_date DESC`,
      [req.institutionId, req.query.class_name || null, req.query.class_name || null]
    );
    res.json(rows);
  })
);

const homeworkSchema = z.object({
  class_name: z.string().trim().min(1).max(50),
  section: optionalText(20),
  subject: optionalText(100),
  title: z.string().trim().min(1).max(255),
  description: longText,
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  teacher_id: z.string().uuid().nullable().optional(),
});

router.post(
  '/',
  requirePermission('students.write'),
  validate({ body: homeworkSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const id = uuidv4();
    await db.execute(
      `INSERT INTO homework (id, institution_id, class_name, section, subject, title, description, due_date, teacher_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.institutionId, body.class_name, body.section, body.subject, body.title, body.description, body.due_date, body.teacher_id || null]
    );
    const homework = await findOwnedOrFail(db, 'homework', id, req.institutionId);
    res.status(201).json(homework);
  })
);

router.delete(
  '/:id',
  requirePermission('students.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'homework', req.params.id, req.institutionId);
    await db.execute('DELETE FROM homework WHERE id = ? AND institution_id = ?', [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

// -------------------------------------------------------- submissions
router.get(
  '/:id/submissions',
  requirePermission('students.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'homework', req.params.id, req.institutionId);
    const [rows] = await db.execute(
      `SELECT sub.*, s.first_name, s.last_name, s.admission_no
         FROM homework_submissions sub
         JOIN students s ON s.id = sub.student_id
        WHERE sub.homework_id = ? AND sub.institution_id = ?
        ORDER BY sub.submitted_at DESC`,
      [req.params.id, req.institutionId]
    );
    res.json(rows);
  })
);

router.post(
  '/:id/submissions',
  requirePermission('students.write'),
  validate({
    params: idParam,
    body: z.object({ student_id: z.string().uuid(), note: longText, link: optionalText(500) }),
  }),
  asyncHandler(async (req, res) => {
    const homework = await findOwnedOrFail(db, 'homework', req.params.id, req.institutionId);
    await findOwnedOrFail(db, 'students', req.body.student_id, req.institutionId);

    const id = uuidv4();
    await db.execute(
      `INSERT INTO homework_submissions (id, institution_id, homework_id, student_id, note, link, status)
       VALUES (?, ?, ?, ?, ?, ?, 'submitted')
       ON DUPLICATE KEY UPDATE note = VALUES(note), link = VALUES(link), status = 'submitted', submitted_at = CURRENT_TIMESTAMP`,
      [id, req.institutionId, homework.id, req.body.student_id, req.body.note, req.body.link]
    );

    const [rows] = await db.execute(
      'SELECT * FROM homework_submissions WHERE homework_id = ? AND student_id = ?',
      [homework.id, req.body.student_id]
    );
    res.status(201).json(rows[0]);
  })
);

router.post(
  '/submissions/:submissionId/grade',
  requirePermission('students.write'),
  validate({
    params: z.object({ submissionId: z.string().uuid() }),
    body: z.object({ grade: optionalText(20), remarks: optionalText(500) }),
  }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      'SELECT id FROM homework_submissions WHERE id = ? AND institution_id = ?',
      [req.params.submissionId, req.institutionId]
    );
    if (!rows[0]) throw ApiError.notFound('Submission not found');

    await db.execute(
      `UPDATE homework_submissions SET grade = ?, remarks = ?, status = 'graded' WHERE id = ?`,
      [req.body.grade, req.body.remarks, req.params.submissionId]
    );
    const [updated] = await db.execute('SELECT * FROM homework_submissions WHERE id = ?', [req.params.submissionId]);
    res.json(updated[0]);
  })
);

export default router;
