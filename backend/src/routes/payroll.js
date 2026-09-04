/**
 * HR & Payroll — monthly pay runs against the existing teacher registry.
 *
 * One record per (teacher, month) — re-generating a month updates the
 * existing row instead of duplicating it, so a correction never leaves two
 * payslips for the same period.
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
import { z, idParam } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('payroll'));

router.get(
  '/records',
  requirePermission('students.read'),
  validate({ query: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }) }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT p.*, t.first_name, t.last_name, t.employee_id
         FROM payroll_records p
         JOIN teachers t ON t.id = p.teacher_id
        WHERE p.institution_id = ? AND (? IS NULL OR p.pay_month = ?)
        ORDER BY p.pay_month DESC, t.first_name`,
      [req.institutionId, req.query.month || null, req.query.month || null]
    );
    res.json(rows);
  })
);

const recordSchema = z.object({
  teacher_id: z.string().uuid(),
  pay_month: z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM'),
  basic_pay: z.coerce.number().min(0).max(10000000),
  allowances: z.coerce.number().min(0).max(10000000).default(0),
  deductions: z.coerce.number().min(0).max(10000000).default(0),
});

router.post(
  '/records',
  requirePermission('students.write'),
  validate({ body: recordSchema }),
  asyncHandler(async (req, res) => {
    const { teacher_id, pay_month, basic_pay, allowances, deductions } = req.body;
    await findOwnedOrFail(db, 'teachers', teacher_id, req.institutionId);

    const netPay = basic_pay + allowances - deductions;
    const id = uuidv4();
    await db.execute(
      `INSERT INTO payroll_records (id, institution_id, teacher_id, pay_month, basic_pay, allowances, deductions, net_pay, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE
         basic_pay = VALUES(basic_pay), allowances = VALUES(allowances),
         deductions = VALUES(deductions), net_pay = VALUES(net_pay)`,
      [id, req.institutionId, teacher_id, pay_month, basic_pay, allowances, deductions, netPay]
    );

    const [rows] = await db.execute(
      'SELECT * FROM payroll_records WHERE institution_id = ? AND teacher_id = ? AND pay_month = ?',
      [req.institutionId, teacher_id, pay_month]
    );
    res.status(201).json(rows[0]);
  })
);

router.post(
  '/records/:id/mark-paid',
  requirePermission('students.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const record = await findOwnedOrFail(db, 'payroll_records', req.params.id, req.institutionId);
    if (record.status === 'paid') throw ApiError.conflict('This payslip is already marked paid.');

    await db.execute(
      `UPDATE payroll_records SET status = 'paid', paid_on = CURDATE() WHERE id = ?`,
      [req.params.id]
    );
    const updated = await findOwnedOrFail(db, 'payroll_records', req.params.id, req.institutionId);
    res.json(updated);
  })
);

export default router;
