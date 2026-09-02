/**
 * Programs — degrees, diplomas and certificate tracks, plus the courses
 * that hang off them. This is the EIMS "Academic Operations" backbone that
 * admissions, scholarships and certifications all reference.
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
  z, optionalText, longText, money, count, listQuery, idParam, optionalUuid, partialUpdate,
} from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('programs'));

const LEVELS = ['certificate', 'diploma', 'undergraduate', 'postgraduate', 'doctorate', 'short_course'];
const MODES = ['full_time', 'part_time', 'online', 'hybrid', 'distance'];
const STATUSES = ['draft', 'active', 'closed', 'archived'];

const SORTABLE = ['created_at', 'name', 'level', 'tuition_fee', 'seats_filled', 'status'];
const UPDATABLE = [
  'name', 'code', 'level', 'department', 'mode', 'duration_months', 'tuition_fee',
  'currency', 'seats_total', 'eligibility', 'description', 'coordinator_id', 'status',
];

const programSchema = z.object({
  name: z.string().trim().min(1).max(255),
  code: optionalText(60),
  level: z.enum(LEVELS).default('certificate'),
  department: optionalText(150),
  mode: z.enum(MODES).default('full_time'),
  duration_months: z.coerce.number().int().min(1).max(120).default(12),
  tuition_fee: money.default(0),
  currency: z.string().trim().length(3).default('INR'),
  seats_total: count.default(0),
  eligibility: longText,
  description: longText,
  coordinator_id: optionalUuid,
  status: z.enum(STATUSES).default('active'),
});

// ------------------------------------------------------------------ list
router.get(
  '/',
  requirePermission('programs.read'),
  validate({
    query: listQuery.extend({
      status: z.enum(STATUSES).optional(),
      level: z.enum(LEVELS).optional(),
      department: z.string().max(150).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const sort = parseSort(req.query, SORTABLE, 'created_at');

    const { clause, params } = buildWhere({
      alias: 'p',
      equals: {
        institution_id: req.institutionId,
        status: req.query.status,
        level: req.query.level,
        department: req.query.department,
      },
      search: req.query.search,
      searchColumns: ['name', 'code', 'department'],
    });

    const result = await paginatedQuery(db, {
      select: `p.*,
               (SELECT COUNT(*) FROM courses c WHERE c.program_id = p.id) AS course_count,
               (SELECT COUNT(*) FROM admissions a WHERE a.program_id = p.id) AS application_count`,
      from: 'programs p',
      where: clause,
      params,
      orderBy: `p.${sort.sql}`,
      page,
      pageSize,
      offset,
    });

    res.json(result);
  })
);

// --------------------------------------------------------------- summary
router.get(
  '/summary',
  requirePermission('programs.read'),
  asyncHandler(async (req, res) => {
    const [[totals]] = await db.execute(
      `SELECT COUNT(*)                                            AS total,
              SUM(status = 'active')                              AS active,
              COALESCE(SUM(seats_total), 0)                       AS seats_total,
              COALESCE(SUM(seats_filled), 0)                      AS seats_filled,
              COALESCE(AVG(NULLIF(tuition_fee, 0)), 0)            AS average_fee
         FROM programs WHERE institution_id = ?`,
      [req.institutionId]
    );

    const [byLevel] = await db.execute(
      `SELECT level, COUNT(*) AS total, COALESCE(SUM(seats_filled), 0) AS seats_filled
         FROM programs WHERE institution_id = ? GROUP BY level ORDER BY total DESC`,
      [req.institutionId]
    );

    const seatsTotal = Number(totals.seats_total) || 0;
    res.json({
      totals: {
        ...totals,
        fill_rate: seatsTotal > 0 ? Number(((Number(totals.seats_filled) / seatsTotal) * 100).toFixed(1)) : 0,
      },
      byLevel,
    });
  })
);

// ------------------------------------------------------------------- one
router.get(
  '/:id',
  requirePermission('programs.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const program = await findOwnedOrFail(db, 'programs', req.params.id, req.institutionId);

    const [courses] = await db.execute(
      `SELECT c.id, c.title, c.code, c.credits, c.semester, c.subject, c.is_published,
              c.teacher_id, CONCAT_WS(' ', t.first_name, t.last_name) AS teacher_name
         FROM courses c
         LEFT JOIN teachers t ON t.id = c.teacher_id
        WHERE c.program_id = ? AND c.institution_id = ?
        ORDER BY c.semester, c.title`,
      [req.params.id, req.institutionId]
    );

    const [[stats]] = await db.execute(
      `SELECT COUNT(*) AS applications,
              SUM(status = 'approved') AS approved,
              SUM(status = 'pending')  AS pending
         FROM admissions WHERE program_id = ? AND institution_id = ?`,
      [req.params.id, req.institutionId]
    );

    res.json({ program, courses, stats });
  })
);

// ---------------------------------------------------------------- create
router.post(
  '/',
  requirePermission('programs.write'),
  validate({ body: programSchema }),
  asyncHandler(async (req, res) => {
    const id = uuidv4();
    const body = req.body;

    await db.execute(
      `INSERT INTO programs
         (id, institution_id, name, code, level, department, mode, duration_months,
          tuition_fee, currency, seats_total, eligibility, description, coordinator_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, req.institutionId, body.name, body.code, body.level, body.department,
        body.mode, body.duration_months, body.tuition_fee, body.currency,
        body.seats_total, body.eligibility, body.description, body.coordinator_id || null, body.status,
      ]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'program.created',
      description: `Created program ${body.name}`,
      entityType: 'program',
      entityId: id,
      severity: 'success',
    });

    const program = await findOwnedOrFail(db, 'programs', id, req.institutionId);
    res.status(201).json({ program });
  })
);

// ---------------------------------------------------------------- update
router.put(
  '/:id',
  requirePermission('programs.write'),
  validate({ params: idParam, body: partialUpdate(programSchema) }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'programs', req.params.id, req.institutionId);

    const update = buildUpdate(req.body, UPDATABLE);
    if (!update) throw ApiError.badRequest('No updatable fields provided');

    await db.execute(
      `UPDATE programs SET ${update.sql} WHERE id = ? AND institution_id = ?`,
      [...update.params, req.params.id, req.institutionId]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'program.updated',
      entityType: 'program',
      entityId: req.params.id,
      metadata: { changed_fields: Object.keys(req.body) },
    });

    const program = await findOwnedOrFail(db, 'programs', req.params.id, req.institutionId);
    res.json({ program });
  })
);

// ---------------------------------------------------------------- delete
router.delete(
  '/:id',
  requirePermission('programs.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const program = await findOwnedOrFail(db, 'programs', req.params.id, req.institutionId);

    const [[{ applications }]] = await db.execute(
      'SELECT COUNT(*) AS applications FROM admissions WHERE program_id = ?',
      [req.params.id]
    );
    if (Number(applications) > 0) {
      throw ApiError.conflict(
        `This program has ${applications} application(s). Archive it instead of deleting.`,
        { code: 'in_use' }
      );
    }

    await db.execute('DELETE FROM programs WHERE id = ? AND institution_id = ?', [
      req.params.id, req.institutionId,
    ]);

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'program.deleted',
      description: `Deleted program ${program.name}`,
      entityType: 'program',
      entityId: req.params.id,
      severity: 'warning',
    });

    res.json({ success: true });
  })
);

// ------------------------------------------------------- courses under it
const courseSchema = z.object({
  title: z.string().trim().min(1).max(255),
  code: optionalText(60),
  subject: optionalText(100),
  description: longText,
  credits: z.coerce.number().min(0).max(100).default(0),
  semester: z.coerce.number().int().min(1).max(20).nullable().optional(),
  teacher_id: optionalUuid,
  is_published: z.boolean().default(false),
});

router.post(
  '/:id/courses',
  requirePermission('programs.write'),
  validate({ params: idParam, body: courseSchema }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'programs', req.params.id, req.institutionId);

    const courseId = uuidv4();
    const body = req.body;
    await db.execute(
      `INSERT INTO courses
         (id, institution_id, program_id, title, code, subject, description,
          credits, semester, teacher_id, is_published)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        courseId, req.institutionId, req.params.id, body.title, body.code, body.subject,
        body.description, body.credits, body.semester ?? null, body.teacher_id || null,
        body.is_published ? 1 : 0,
      ]
    );

    const [rows] = await db.execute('SELECT * FROM courses WHERE id = ?', [courseId]);
    res.status(201).json({ course: rows[0] });
  })
);

export default router;
