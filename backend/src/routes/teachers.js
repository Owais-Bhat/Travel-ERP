/**
 * Teachers / faculty.
 *
 * Hardened (the old PUT interpolated request keys into SQL) and extended
 * with the EIMS faculty fields: department, designation, joining date and
 * years of experience.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requirePermission } from '../auth/permissions.js';
import { recordAuditEvent } from '../lib/audit.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { upload, publicUrlFor, uploadErrorHandler } from '../lib/uploads.js';
import {
  parsePagination, parseSort, buildWhere, paginatedQuery, findOwnedOrFail, buildUpdate,
} from '../lib/query.js';
import {
  z, optionalText, isoDate, listQuery, idParam, email, phone, partialUpdate,
} from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);

const SORTABLE = ['created_at', 'first_name', 'last_name', 'employee_id', 'department', 'status'];
const UPDATABLE = [
  'employee_id', 'first_name', 'last_name', 'email', 'phone', 'subjects',
  'qualification', 'status', 'department', 'designation', 'joining_date', 'experience_years',
];

const teacherSchema = z.object({
  employee_id: optionalText(50),
  first_name: z.string().trim().min(1).max(100),
  last_name: optionalText(100),
  email,
  phone,
  subjects: z.array(z.string().trim().max(100)).max(30).optional(),
  qualification: optionalText(255),
  department: optionalText(150),
  designation: optionalText(120),
  joining_date: isoDate,
  experience_years: z.coerce.number().min(0).max(70).optional(),
  status: z.enum(['active', 'inactive', 'on_leave', 'resigned']).default('active'),
});

/** mysql2 parses JSON columns already; tolerate a string for older rows. */
function withSubjects(row) {
  if (!row) return row;
  let subjects = row.subjects;
  if (typeof subjects === 'string') {
    try { subjects = JSON.parse(subjects); } catch { subjects = []; }
  }
  return { ...row, subjects: Array.isArray(subjects) ? subjects : [] };
}

router.get(
  '/',
  requirePermission('students.read', 'programs.read'),
  validate({
    query: listQuery.extend({
      status: z.string().max(30).optional(),
      department: z.string().max(150).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const sort = parseSort(req.query, SORTABLE, 'created_at');

    const { clause, params } = buildWhere({
      equals: {
        institution_id: req.institutionId,
        status: req.query.status,
        department: req.query.department,
      },
      search: req.query.search,
      searchColumns: ['first_name', 'last_name', 'employee_id', 'email', 'designation'],
    });

    const result = await paginatedQuery(db, {
      select: '*',
      from: 'teachers',
      where: clause,
      params,
      orderBy: sort.sql,
      page,
      pageSize,
      offset,
    });

    const data = result.data.map(withSubjects);
    if (req.query.page === undefined && req.query.pageSize === undefined) {
      return res.json(data);
    }
    return res.json({ ...result, data });
  })
);

router.post(
  '/',
  requirePermission('programs.write'),
  validate({ body: teacherSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const id = uuidv4();

    await db.execute(
      `INSERT INTO teachers
         (id, institution_id, employee_id, first_name, last_name, email, phone,
          subjects, qualification, status, department, designation, joining_date, experience_years)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, req.institutionId, body.employee_id, body.first_name, body.last_name,
        body.email, body.phone, body.subjects ? JSON.stringify(body.subjects) : null,
        body.qualification, body.status, body.department, body.designation,
        body.joining_date, body.experience_years ?? 0,
      ]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'teacher.created',
      description: `Added faculty ${body.first_name} ${body.last_name || ''}`.trim(),
      entityType: 'teacher',
      entityId: id,
      severity: 'success',
    });

    const teacher = await findOwnedOrFail(db, 'teachers', id, req.institutionId);
    res.status(201).json(withSubjects(teacher));
  })
);

router.put(
  '/:id',
  requirePermission('programs.write'),
  validate({ params: idParam, body: partialUpdate(teacherSchema) }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'teachers', req.params.id, req.institutionId);

    const payload = { ...req.body };
    if (payload.subjects !== undefined) payload.subjects = JSON.stringify(payload.subjects);

    const update = buildUpdate(payload, UPDATABLE);
    if (!update) throw ApiError.badRequest('No updatable fields provided');

    await db.execute(
      `UPDATE teachers SET ${update.sql} WHERE id = ? AND institution_id = ?`,
      [...update.params, req.params.id, req.institutionId]
    );

    const teacher = await findOwnedOrFail(db, 'teachers', req.params.id, req.institutionId);
    res.json(withSubjects(teacher));
  })
);

router.post(
  '/:id/photo',
  requirePermission('programs.write'),
  validate({ params: idParam }),
  upload.single('file'),
  uploadErrorHandler,
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No file uploaded. Send it as multipart/form-data field "file".');
    await findOwnedOrFail(db, 'teachers', req.params.id, req.institutionId);

    const photoUrl = publicUrlFor(req.file, req.institutionId);
    await db.execute('UPDATE teachers SET photo_url = ? WHERE id = ? AND institution_id = ?', [
      photoUrl, req.params.id, req.institutionId,
    ]);
    res.json({ photo_url: photoUrl });
  })
);

router.delete(
  '/:id',
  requirePermission('programs.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const teacher = await findOwnedOrFail(db, 'teachers', req.params.id, req.institutionId);

    await db.execute('DELETE FROM teachers WHERE id = ? AND institution_id = ?', [
      req.params.id, req.institutionId,
    ]);

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'teacher.deleted',
      description: `Removed faculty ${teacher.first_name} ${teacher.last_name || ''}`.trim(),
      entityType: 'teacher',
      entityId: req.params.id,
      severity: 'warning',
    });

    res.json({ success: true });
  })
);

export default router;
