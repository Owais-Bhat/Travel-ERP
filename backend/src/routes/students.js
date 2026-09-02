/**
 * Students.
 *
 * Hardened: the previous PUT built its SET clause from `Object.keys(req.body)`,
 * so a request key became a raw SQL fragment. Updates now go through an
 * explicit column allow-list, and everything is validated before it reaches
 * the driver.
 *
 * Response shape is unchanged (bare array / bare object) so the existing
 * pages keep working; pass `page` to opt into the paginated envelope.
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
import {
  z, optionalText, longText, isoDate, listQuery, idParam, email, phone, partialUpdate,
} from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('students'));

const SORTABLE = ['created_at', 'first_name', 'last_name', 'admission_no', 'class_name', 'status'];

const UPDATABLE = [
  'admission_no', 'first_name', 'last_name', 'email', 'phone', 'dob', 'gender',
  'address', 'class_name', 'section', 'parent_name', 'parent_phone', 'parent_email', 'status',
];

const studentSchema = z.object({
  admission_no: optionalText(50),
  first_name: z.string().trim().min(1, 'First name is required').max(100),
  last_name: optionalText(100),
  email,
  phone,
  dob: isoDate,
  gender: z.preprocess(
    (value) => (value === '' ? null : value),
    z.enum(['male', 'female', 'other', 'prefer_not_to_say']).nullable().optional()
  ),
  address: longText,
  class_name: optionalText(50),
  section: optionalText(20),
  parent_name: optionalText(200),
  parent_phone: phone,
  parent_email: email,
  status: z.enum(['active', 'inactive', 'alumni', 'suspended']).default('active'),
});

router.get(
  '/',
  requirePermission('students.read'),
  validate({
    query: listQuery.extend({
      status: z.string().max(30).optional(),
      class_name: z.string().max(50).optional(),
      section: z.string().max(20).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const sort = parseSort(req.query, SORTABLE, 'created_at');

    const { clause, params } = buildWhere({
      equals: {
        institution_id: req.institutionId,
        status: req.query.status,
        class_name: req.query.class_name,
        section: req.query.section,
      },
      search: req.query.search,
      searchColumns: ['first_name', 'last_name', 'admission_no', 'email', 'phone'],
    });

    const result = await paginatedQuery(db, {
      select: '*',
      from: 'students',
      where: clause,
      params,
      orderBy: sort.sql,
      page,
      pageSize,
      offset,
    });

    // Legacy callers expect a bare array; the envelope is opt-in via ?page=.
    if (req.query.page === undefined && req.query.pageSize === undefined) {
      return res.json(result.data);
    }
    return res.json(result);
  })
);

router.get(
  '/:id',
  requirePermission('students.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const student = await findOwnedOrFail(db, 'students', req.params.id, req.institutionId);

    const [documents] = await db.execute(
      'SELECT id, doc_type, name, file_url, status, created_at FROM student_documents WHERE student_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );
    const [certifications] = await db.execute(
      'SELECT id, title, certificate_no, status, issued_on FROM certifications WHERE student_id = ? ORDER BY issued_on DESC',
      [req.params.id]
    );

    res.json({ student, documents, certifications });
  })
);

/** Every exam result for one student, newest first. */
router.get(
  '/:id/results',
  requirePermission('exams.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    // Confirms the student is in this tenant before exposing any marks.
    await findOwnedOrFail(db, 'students', req.params.id, req.institutionId);

    const [rows] = await db.execute(
      `SELECT r.id, r.marks_obtained, r.grade, r.remarks, r.created_at,
              e.id AS exam_id, e.title AS exam_title, e.subject,
              e.total_marks, e.pass_marks, e.exam_date,
              (SELECT ROUND(AVG(r2.marks_obtained), 2)
                 FROM exam_results r2 WHERE r2.exam_id = e.id) AS class_average
         FROM exam_results r
         JOIN exams e ON e.id = r.exam_id
        WHERE r.student_id = ? AND e.institution_id = ?
        ORDER BY e.exam_date DESC, r.created_at DESC
        LIMIT 50`,
      [req.params.id, req.institutionId]
    );

    res.json(rows);
  })
);

router.post(
  '/',
  requirePermission('students.write'),
  validate({ body: studentSchema }),
  asyncHandler(async (req, res) => {
    const id = uuidv4();
    const body = req.body;

    if (body.admission_no) {
      const [existing] = await db.execute(
        'SELECT id FROM students WHERE institution_id = ? AND admission_no = ?',
        [req.institutionId, body.admission_no]
      );
      if (existing.length > 0) {
        throw ApiError.conflict(`Admission number "${body.admission_no}" is already in use.`);
      }
    }

    await db.execute(
      `INSERT INTO students (
        id, institution_id, admission_no, first_name, last_name, email, phone,
        dob, gender, address, class_name, section, parent_name, parent_phone,
        parent_email, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, req.institutionId, body.admission_no, body.first_name, body.last_name,
        body.email, body.phone, body.dob, body.gender ?? null, body.address,
        body.class_name, body.section, body.parent_name, body.parent_phone,
        body.parent_email, body.status,
      ]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'student.created',
      description: `Added student ${body.first_name} ${body.last_name || ''}`.trim(),
      entityType: 'student',
      entityId: id,
      severity: 'success',
    });

    const student = await findOwnedOrFail(db, 'students', id, req.institutionId);
    res.status(201).json(student);
  })
);

router.put(
  '/:id',
  requirePermission('students.write'),
  validate({ params: idParam, body: partialUpdate(studentSchema) }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'students', req.params.id, req.institutionId);

    const update = buildUpdate(req.body, UPDATABLE);
    if (!update) throw ApiError.badRequest('No updatable fields provided');

    await db.execute(
      `UPDATE students SET ${update.sql} WHERE id = ? AND institution_id = ?`,
      [...update.params, req.params.id, req.institutionId]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'student.updated',
      entityType: 'student',
      entityId: req.params.id,
      metadata: { changed_fields: Object.keys(req.body) },
    });

    const student = await findOwnedOrFail(db, 'students', req.params.id, req.institutionId);
    res.json(student);
  })
);

router.delete(
  '/:id',
  requirePermission('students.delete'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const student = await findOwnedOrFail(db, 'students', req.params.id, req.institutionId);

    await db.execute('DELETE FROM students WHERE id = ? AND institution_id = ?', [
      req.params.id, req.institutionId,
    ]);

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'student.deleted',
      description: `Deleted student ${student.first_name} ${student.last_name || ''}`.trim(),
      entityType: 'student',
      entityId: req.params.id,
      severity: 'warning',
    });

    res.json({ success: true });
  })
);

export default router;
