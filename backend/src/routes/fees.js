/**
 * Fee payments.
 *
 * Hardened alongside students: updates use a column allow-list instead of
 * interpolating request keys into the SET clause.
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
  parsePagination, parseSort, buildWhere, paginatedQuery, findOwnedOrFail,
  buildUpdate, nextSequenceNo,
} from '../lib/query.js';
import { z, optionalText, money, isoDate, listQuery, idParam, partialUpdate } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('fees'));

const STATUSES = ['pending', 'partial', 'paid', 'overdue', 'waived', 'cancelled'];
const SORTABLE = ['created_at', 'due_date', 'payment_date', 'total_amount', 'paid_amount', 'status'];
const UPDATABLE = [
  'fee_type', 'total_amount', 'paid_amount', 'due_date', 'payment_date', 'status', 'receipt_no',
];

const feeSchema = z.object({
  student_id: z.string().uuid(),
  fee_type: optionalText(100),
  total_amount: money.default(0),
  paid_amount: money.default(0),
  due_date: isoDate,
  payment_date: isoDate,
  status: z.enum(STATUSES).default('pending'),
  receipt_no: optionalText(50),
});

/**
 * Fee rows always travel with their student. The flat columns are kept for
 * older callers; `students` is the nested object the fees screen renders
 * from, matching the shape the Supabase joined query used to return.
 */
const STUDENT_COLUMNS = `f.*, s.first_name, s.last_name, s.admission_no, s.class_name, s.section,
       JSON_OBJECT(
         'id', s.id,
         'first_name', s.first_name,
         'last_name', s.last_name,
         'admission_no', s.admission_no,
         'class_name', s.class_name,
         'section', s.section
       ) AS students`;

const WITH_STUDENT = `SELECT ${STUDENT_COLUMNS}
                        FROM fee_payments f
                        JOIN students s ON s.id = f.student_id`;

router.get(
  '/',
  requirePermission('fees.read'),
  validate({
    query: listQuery.extend({
      status: z.enum(STATUSES).optional(),
      studentId: z.string().uuid().optional(),
      overdue: z.coerce.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const sort = parseSort(req.query, SORTABLE, 'created_at');

    const raw = [];
    if (req.query.overdue) {
      raw.push({ sql: "f.`due_date` IS NOT NULL AND f.`due_date` < CURDATE() AND f.`status` NOT IN ('paid','waived','cancelled')" });
    }

    const { clause, params } = buildWhere({
      alias: 'f',
      equals: {
        institution_id: req.institutionId,
        status: req.query.status,
        student_id: req.query.studentId,
      },
      raw,
    });

    // Search spans the joined student, so it cannot use buildWhere's alias.
    const conditions = [clause.replace(/^WHERE /, '')].filter(Boolean);
    const allParams = [...params];
    if (req.query.search) {
      conditions.push('(s.first_name LIKE ? OR s.last_name LIKE ? OR s.admission_no LIKE ? OR f.receipt_no LIKE ?)');
      const like = `%${req.query.search}%`;
      allParams.push(like, like, like, like);
    }

    const result = await paginatedQuery(db, {
      select: STUDENT_COLUMNS,
      from: 'fee_payments f JOIN students s ON s.id = f.student_id',
      where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
      params: allParams,
      orderBy: `f.${sort.sql}`,
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

router.get(
  '/summary',
  requirePermission('fees.read'),
  asyncHandler(async (req, res) => {
    const [[totals]] = await db.execute(
      `SELECT COUNT(*) AS records,
              COALESCE(SUM(total_amount), 0)                 AS billed,
              COALESCE(SUM(paid_amount), 0)                  AS collected,
              COALESCE(SUM(total_amount - paid_amount), 0)   AS outstanding,
              SUM(status = 'paid')                           AS paid_count,
              SUM(due_date IS NOT NULL AND due_date < CURDATE()
                  AND status NOT IN ('paid','waived','cancelled')) AS overdue_count
         FROM fee_payments WHERE institution_id = ?`,
      [req.institutionId]
    );

    const [byType] = await db.execute(
      `SELECT COALESCE(fee_type, 'Unspecified') AS fee_type,
              COALESCE(SUM(total_amount), 0) AS billed,
              COALESCE(SUM(paid_amount), 0)  AS collected
         FROM fee_payments WHERE institution_id = ?
        GROUP BY fee_type ORDER BY billed DESC`,
      [req.institutionId]
    );

    res.json({ totals, byType });
  })
);

router.post(
  '/',
  requirePermission('fees.write'),
  validate({ body: feeSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;

    const [students] = await db.execute(
      'SELECT id FROM students WHERE id = ? AND institution_id = ?',
      [body.student_id, req.institutionId]
    );
    if (students.length === 0) throw ApiError.notFound('Student not found in this institution');

    if (body.paid_amount > body.total_amount) {
      throw ApiError.badRequest('Paid amount cannot exceed the total amount.');
    }

    const id = uuidv4();
    const receiptNo = body.receipt_no || (body.paid_amount > 0
      ? await nextSequenceNo(db, {
        table: 'fee_payments', column: 'receipt_no', institutionId: req.institutionId, prefix: 'RCP',
      })
      : null);

    await db.execute(
      `INSERT INTO fee_payments
         (id, institution_id, student_id, fee_type, total_amount, paid_amount,
          due_date, payment_date, status, receipt_no)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, req.institutionId, body.student_id, body.fee_type, body.total_amount,
        body.paid_amount, body.due_date, body.payment_date, body.status, receiptNo,
      ]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'fee.recorded',
      description: `Recorded ${body.paid_amount} of ${body.total_amount} (${body.fee_type || 'fee'})`,
      entityType: 'fee_payment',
      entityId: id,
      severity: 'success',
    });

    const [created] = await db.execute(`${WITH_STUDENT} WHERE f.id = ?`, [id]);
    res.status(201).json(created[0]);
  })
);

router.put(
  '/:id',
  requirePermission('fees.write'),
  validate({ params: idParam, body: partialUpdate(feeSchema) }),
  asyncHandler(async (req, res) => {
    const existing = await findOwnedOrFail(db, 'fee_payments', req.params.id, req.institutionId);

    const nextTotal = req.body.total_amount ?? Number(existing.total_amount);
    const nextPaid = req.body.paid_amount ?? Number(existing.paid_amount);
    if (nextPaid > nextTotal) {
      throw ApiError.badRequest('Paid amount cannot exceed the total amount.');
    }

    const update = buildUpdate(req.body, UPDATABLE);
    if (!update) throw ApiError.badRequest('No updatable fields provided');

    await db.execute(
      `UPDATE fee_payments SET ${update.sql} WHERE id = ? AND institution_id = ?`,
      [...update.params, req.params.id, req.institutionId]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'fee.updated',
      entityType: 'fee_payment',
      entityId: req.params.id,
      metadata: { changed_fields: Object.keys(req.body) },
    });

    const [updated] = await db.execute(`${WITH_STUDENT} WHERE f.id = ?`, [req.params.id]);
    res.json(updated[0]);
  })
);

export default router;
