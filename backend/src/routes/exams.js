/**
 * Exams and results.
 *
 * Hardened: updates use a column allow-list, results are tenant-checked
 * before they are read or written (the old handlers trusted the exam id in
 * the URL without confirming it belonged to the caller's institution).
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
import {
  parsePagination, parseSort, buildWhere, paginatedQuery, findOwnedOrFail, buildUpdate,
} from '../lib/query.js';
import { z, optionalText, longText, isoDate, listQuery, idParam, partialUpdate } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('exams'));

const STATUSES = ['upcoming', 'ongoing', 'completed', 'cancelled', 'published'];
const SORTABLE = ['exam_date', 'created_at', 'title', 'status'];
const UPDATABLE = ['title', 'subject', 'class_name', 'exam_date', 'total_marks', 'pass_marks', 'status'];

const examSchema = z.object({
  title: z.string().trim().min(1).max(255),
  subject: optionalText(100),
  class_name: optionalText(50),
  exam_date: isoDate,
  total_marks: z.coerce.number().min(0).max(10000).nullable().optional(),
  pass_marks: z.coerce.number().min(0).max(10000).nullable().optional(),
  status: z.enum(STATUSES).default('upcoming'),
});

router.get(
  '/',
  requirePermission('exams.read'),
  validate({
    query: listQuery.extend({
      status: z.enum(STATUSES).optional(),
      class_name: z.string().max(50).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const sort = parseSort(req.query, SORTABLE, 'exam_date');

    const { clause, params } = buildWhere({
      equals: {
        institution_id: req.institutionId,
        status: req.query.status,
        class_name: req.query.class_name,
      },
      search: req.query.search,
      searchColumns: ['title', 'subject', 'class_name'],
    });

    const result = await paginatedQuery(db, {
      select: '*',
      from: 'exams',
      where: clause,
      params,
      orderBy: sort.sql,
      page,
      pageSize,
      offset,
    });

    if (req.query.page === undefined && req.query.pageSize === undefined) {
      return res.json(result.data);
    }
    return res.json(result);
  })
);

router.post(
  '/',
  requirePermission('exams.write'),
  validate({ body: examSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (body.pass_marks != null && body.total_marks != null && body.pass_marks > body.total_marks) {
      throw ApiError.badRequest('Pass marks cannot exceed total marks.');
    }

    const id = uuidv4();
    await db.execute(
      `INSERT INTO exams (id, institution_id, title, subject, class_name, exam_date, total_marks, pass_marks, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, req.institutionId, body.title, body.subject, body.class_name,
        body.exam_date, body.total_marks ?? null, body.pass_marks ?? null, body.status,
      ]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'exam.created',
      description: `Scheduled "${body.title}"`,
      entityType: 'exam',
      entityId: id,
    });

    const exam = await findOwnedOrFail(db, 'exams', id, req.institutionId);
    res.status(201).json(exam);
  })
);

router.put(
  '/:id',
  requirePermission('exams.write'),
  validate({ params: idParam, body: partialUpdate(examSchema) }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'exams', req.params.id, req.institutionId);

    const update = buildUpdate(req.body, UPDATABLE);
    if (!update) throw ApiError.badRequest('No updatable fields provided');

    await db.execute(
      `UPDATE exams SET ${update.sql} WHERE id = ? AND institution_id = ?`,
      [...update.params, req.params.id, req.institutionId]
    );

    const exam = await findOwnedOrFail(db, 'exams', req.params.id, req.institutionId);
    res.json(exam);
  })
);

router.delete(
  '/:id',
  requirePermission('exams.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const exam = await findOwnedOrFail(db, 'exams', req.params.id, req.institutionId);
    await db.execute('DELETE FROM exams WHERE id = ? AND institution_id = ?', [
      req.params.id, req.institutionId,
    ]);

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'exam.deleted',
      description: `Deleted "${exam.title}"`,
      entityType: 'exam',
      entityId: req.params.id,
      severity: 'warning',
    });

    res.json({ success: true });
  })
);

// ------------------------------------------------------------- results
router.get(
  '/:id/results',
  requirePermission('exams.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    // Confirms the exam belongs to this tenant before exposing any marks.
    await findOwnedOrFail(db, 'exams', req.params.id, req.institutionId);

    const [rows] = await db.execute(
      `SELECT r.*, s.first_name, s.last_name, s.admission_no
         FROM exam_results r
         JOIN students s ON s.id = r.student_id
        WHERE r.exam_id = ?
        ORDER BY s.first_name, s.last_name`,
      [req.params.id]
    );
    res.json(rows);
  })
);

const resultSchema = z.object({
  student_id: z.string().uuid(),
  marks_obtained: z.coerce.number().min(0).max(10000).nullable().optional(),
  grade: optionalText(20),
  remarks: longText,
});

router.post(
  '/:id/results',
  requirePermission('exams.write'),
  validate({ params: idParam, body: resultSchema }),
  asyncHandler(async (req, res) => {
    const exam = await findOwnedOrFail(db, 'exams', req.params.id, req.institutionId);

    const [students] = await db.execute(
      'SELECT id FROM students WHERE id = ? AND institution_id = ?',
      [req.body.student_id, req.institutionId]
    );
    if (students.length === 0) throw ApiError.notFound('Student not found in this institution');

    if (
      req.body.marks_obtained != null
      && exam.total_marks != null
      && Number(req.body.marks_obtained) > Number(exam.total_marks)
    ) {
      throw ApiError.badRequest(`Marks cannot exceed the exam total of ${exam.total_marks}.`);
    }

    const [existing] = await db.execute(
      'SELECT id FROM exam_results WHERE exam_id = ? AND student_id = ?',
      [req.params.id, req.body.student_id]
    );

    // Re-entering a mark should correct it, not create a duplicate row.
    if (existing.length > 0) {
      await db.execute(
        'UPDATE exam_results SET marks_obtained = ?, grade = ?, remarks = ? WHERE id = ?',
        [req.body.marks_obtained ?? null, req.body.grade, req.body.remarks, existing[0].id]
      );
      const [updated] = await db.execute('SELECT * FROM exam_results WHERE id = ?', [existing[0].id]);
      return res.json(updated[0]);
    }

    const id = uuidv4();
    await db.execute(
      'INSERT INTO exam_results (id, exam_id, student_id, marks_obtained, grade, remarks) VALUES (?, ?, ?, ?, ?, ?)',
      [id, req.params.id, req.body.student_id, req.body.marks_obtained ?? null, req.body.grade, req.body.remarks]
    );

    const [created] = await db.execute('SELECT * FROM exam_results WHERE id = ?', [id]);
    return res.status(201).json(created[0]);
  })
);

export default router;
