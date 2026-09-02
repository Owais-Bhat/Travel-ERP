/**
 * Referral partners, referrals, commissions and partner invoices.
 *
 * The money path: a referral converts → a commission is accrued against the
 * partner's rate → approved commissions are batched onto an invoice →
 * marking the invoice paid settles every commission on it and updates the
 * partner's running totals. Each of those steps is transactional.
 */
import express from 'express';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import db, { withTransaction } from '../lib/db.js';
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
import {
  z, optionalText, longText, money, isoDate, listQuery, idParam, optionalUuid, email, phone, partialUpdate,
} from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('referrals'));

const PARTNER_TYPES = ['agent', 'consultant', 'student', 'staff', 'alumni', 'affiliate'];
const PARTNER_STATUSES = ['active', 'paused', 'blocked'];
const REFERRAL_STATUSES = ['pending', 'contacted', 'qualified', 'converted', 'rejected', 'expired'];
const COMMISSION_STATUSES = ['pending', 'approved', 'invoiced', 'paid', 'rejected'];
const INVOICE_STATUSES = ['draft', 'issued', 'paid', 'void'];

/** Short, unambiguous partner code (no 0/O/1/I). */
function generateReferralCode(name) {
  const stem = String(name || 'PTR')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4)
    .padEnd(3, 'X');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(4);
  const suffix = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return `${stem}-${suffix}`;
}

/** Commission for one conversion, given the partner's terms. */
export function computeCommission(partner, baseAmount) {
  const base = Number(baseAmount) || 0;
  const rate = Number(partner.commission_rate) || 0;
  const amount = partner.commission_type === 'fixed' ? rate : (base * rate) / 100;
  return { base, rate, amount: Number(amount.toFixed(2)) };
}

// ==================================================================
// Partners
// ==================================================================
const partnerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(PARTNER_TYPES).default('agent'),
  email,
  phone,
  company: optionalText(200),
  city: optionalText(120),
  referral_code: optionalText(40),
  commission_type: z.enum(['percentage', 'fixed']).default('percentage'),
  commission_rate: z.coerce.number().min(0).max(1000000).default(0),
  payout_details: z.record(z.string(), z.unknown()).nullable().optional(),
  status: z.enum(PARTNER_STATUSES).default('active'),
  notes: longText,
});

const PARTNER_UPDATABLE = [
  'name', 'type', 'email', 'phone', 'company', 'city', 'commission_type',
  'commission_rate', 'status', 'notes',
];

router.get(
  '/partners',
  requirePermission('referrals.read'),
  validate({ query: listQuery.extend({ status: z.enum(PARTNER_STATUSES).optional(), type: z.enum(PARTNER_TYPES).optional() }) }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const sort = parseSort(req.query, ['created_at', 'name', 'total_earned', 'total_converted', 'status'], 'created_at');

    const { clause, params } = buildWhere({
      alias: 'p',
      equals: { institution_id: req.institutionId, status: req.query.status, type: req.query.type },
      search: req.query.search,
      searchColumns: ['name', 'email', 'company', 'referral_code'],
    });

    const result = await paginatedQuery(db, {
      select: `p.*,
               (SELECT COALESCE(SUM(c.amount), 0) FROM commissions c
                 WHERE c.partner_id = p.id AND c.status IN ('pending','approved','invoiced')) AS outstanding_amount`,
      from: 'referral_partners p',
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

router.post(
  '/partners',
  requirePermission('referrals.write'),
  validate({ body: partnerSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (body.commission_type === 'percentage' && body.commission_rate > 100) {
      throw ApiError.badRequest('A percentage commission rate cannot exceed 100.');
    }

    const id = uuidv4();
    let code = body.referral_code || generateReferralCode(body.name);

    // Regenerate on the (unlikely) collision rather than failing the request.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const [existing] = await db.execute(
        'SELECT id FROM referral_partners WHERE institution_id = ? AND referral_code = ?',
        [req.institutionId, code]
      );
      if (existing.length === 0) break;
      if (body.referral_code) throw ApiError.conflict(`Referral code "${code}" is already in use.`);
      code = generateReferralCode(body.name);
    }

    await db.execute(
      `INSERT INTO referral_partners
         (id, institution_id, name, type, email, phone, company, city, referral_code,
          commission_type, commission_rate, payout_details, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, req.institutionId, body.name, body.type, body.email, body.phone,
        body.company, body.city, code, body.commission_type, body.commission_rate,
        body.payout_details ? JSON.stringify(body.payout_details) : null,
        body.status, body.notes,
      ]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'referral_partner.created',
      description: `Added referral partner ${body.name} (${code})`,
      entityType: 'referral_partner',
      entityId: id,
      severity: 'success',
    });

    const partner = await findOwnedOrFail(db, 'referral_partners', id, req.institutionId);
    res.status(201).json({ partner });
  })
);

router.get(
  '/partners/:id',
  requirePermission('referrals.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const partner = await findOwnedOrFail(db, 'referral_partners', req.params.id, req.institutionId);

    const [referrals] = await db.execute(
      'SELECT * FROM referrals WHERE partner_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.params.id]
    );
    const [commissions] = await db.execute(
      'SELECT * FROM commissions WHERE partner_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.params.id]
    );
    const [[ledger]] = await db.execute(
      `SELECT COALESCE(SUM(CASE WHEN status = 'pending'  THEN amount ELSE 0 END), 0) AS pending,
              COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) AS approved,
              COALESCE(SUM(CASE WHEN status = 'invoiced' THEN amount ELSE 0 END), 0) AS invoiced,
              COALESCE(SUM(CASE WHEN status = 'paid'     THEN amount ELSE 0 END), 0) AS paid
         FROM commissions WHERE partner_id = ?`,
      [req.params.id]
    );

    res.json({ partner, referrals, commissions, ledger });
  })
);

router.put(
  '/partners/:id',
  requirePermission('referrals.write'),
  validate({ params: idParam, body: partialUpdate(partnerSchema) }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'referral_partners', req.params.id, req.institutionId);
    const update = buildUpdate(req.body, PARTNER_UPDATABLE);
    if (!update) throw ApiError.badRequest('No updatable fields provided');

    await db.execute(
      `UPDATE referral_partners SET ${update.sql} WHERE id = ? AND institution_id = ?`,
      [...update.params, req.params.id, req.institutionId]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'referral_partner.updated',
      entityType: 'referral_partner',
      entityId: req.params.id,
      metadata: { changed_fields: Object.keys(req.body) },
    });

    const partner = await findOwnedOrFail(db, 'referral_partners', req.params.id, req.institutionId);
    res.json({ partner });
  })
);

// ==================================================================
// Referrals
// ==================================================================
const referralSchema = z.object({
  partner_id: z.string().uuid(),
  referee_name: z.string().trim().min(1).max(200),
  referee_email: email,
  referee_phone: phone,
  program_id: optionalUuid,
  lead_id: optionalUuid,
  admission_id: optionalUuid,
  expires_at: isoDate,
  notes: longText,
});

router.get(
  '/',
  requirePermission('referrals.read'),
  validate({ query: listQuery.extend({ status: z.enum(REFERRAL_STATUSES).optional(), partnerId: z.string().uuid().optional() }) }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const sort = parseSort(req.query, ['created_at', 'referee_name', 'status', 'converted_at'], 'created_at');

    const { clause, params } = buildWhere({
      alias: 'r',
      equals: { institution_id: req.institutionId, status: req.query.status, partner_id: req.query.partnerId },
      search: req.query.search,
      searchColumns: ['referee_name', 'referee_email', 'referral_code'],
    });

    const result = await paginatedQuery(db, {
      select: 'r.*, p.name AS partner_name, p.commission_type, p.commission_rate',
      from: 'referrals r JOIN referral_partners p ON p.id = r.partner_id',
      where: clause,
      params,
      orderBy: `r.${sort.sql}`,
      page,
      pageSize,
      offset,
    });

    res.json(result);
  })
);

router.post(
  '/',
  requirePermission('referrals.write'),
  validate({ body: referralSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const partner = await findOwnedOrFail(db, 'referral_partners', body.partner_id, req.institutionId);
    if (partner.status !== 'active') {
      throw ApiError.badRequest(`Partner "${partner.name}" is ${partner.status} and cannot receive new referrals.`);
    }

    const id = uuidv4();
    await withTransaction(async (connection) => {
      await connection.execute(
        `INSERT INTO referrals
           (id, institution_id, partner_id, referral_code, lead_id, admission_id,
            referee_name, referee_email, referee_phone, program_id, expires_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, req.institutionId, body.partner_id, partner.referral_code,
          body.lead_id || null, body.admission_id || null, body.referee_name,
          body.referee_email, body.referee_phone, body.program_id || null,
          body.expires_at, body.notes,
        ]
      );
      await connection.execute(
        'UPDATE referral_partners SET total_referrals = total_referrals + 1 WHERE id = ?',
        [body.partner_id]
      );
    });

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'referral.created',
      description: `${partner.name} referred ${body.referee_name}`,
      entityType: 'referral',
      entityId: id,
    });

    const referral = await findOwnedOrFail(db, 'referrals', id, req.institutionId);
    res.status(201).json({ referral });
  })
);

/**
 * Move a referral along. Converting accrues a commission against the
 * partner's terms; reverting a conversion voids an unpaid commission.
 */
const referralStatusSchema = z.object({
  status: z.enum(REFERRAL_STATUSES),
  base_amount: money.optional(),
  admission_id: optionalUuid,
  student_id: optionalUuid,
  notes: longText,
});

router.post(
  '/:id/status',
  requirePermission('referrals.write'),
  validate({ params: idParam, body: referralStatusSchema }),
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    const institutionId = req.institutionId;

    const outcome = await withTransaction(async (connection) => {
      const [referralRows] = await connection.execute(
        'SELECT * FROM referrals WHERE id = ? AND institution_id = ? FOR UPDATE',
        [req.params.id, institutionId]
      );
      const referral = referralRows[0];
      if (!referral) throw ApiError.notFound('Referral not found');

      const [partnerRows] = await connection.execute(
        'SELECT * FROM referral_partners WHERE id = ? FOR UPDATE',
        [referral.partner_id]
      );
      const partner = partnerRows[0];

      const wasConverted = referral.status === 'converted';
      const willConvert = status === 'converted';
      let commission = null;

      if (willConvert && !wasConverted) {
        // Base defaults to the referred program's tuition when not supplied.
        let baseAmount = req.body.base_amount;
        if (baseAmount === undefined && referral.program_id) {
          const [programRows] = await connection.execute(
            'SELECT tuition_fee FROM programs WHERE id = ?',
            [referral.program_id]
          );
          baseAmount = programRows[0]?.tuition_fee ?? 0;
        }

        const computed = computeCommission(partner, baseAmount ?? 0);
        if (computed.amount <= 0 && partner.commission_type === 'percentage' && computed.base <= 0) {
          throw ApiError.badRequest(
            'Cannot compute a percentage commission without a base amount. Pass base_amount or link a program.'
          );
        }

        const commissionId = uuidv4();
        await connection.execute(
          `INSERT INTO commissions
             (id, institution_id, partner_id, referral_id, base_amount, rate, amount, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
          [
            commissionId, institutionId, partner.id, referral.id,
            computed.base, computed.rate, computed.amount, req.body.notes || null,
          ]
        );

        await connection.execute(
          `UPDATE referral_partners
              SET total_converted = total_converted + 1, total_earned = total_earned + ?
            WHERE id = ?`,
          [computed.amount, partner.id]
        );

        const [created] = await connection.execute('SELECT * FROM commissions WHERE id = ?', [commissionId]);
        commission = created[0];
      } else if (wasConverted && !willConvert) {
        // Only unpaid, un-invoiced commissions can be voided.
        const [pending] = await connection.execute(
          `SELECT id, amount FROM commissions
            WHERE referral_id = ? AND status IN ('pending','approved')`,
          [referral.id]
        );
        if (pending.length === 0) {
          throw ApiError.conflict(
            'This referral has already been invoiced or paid; reverse the invoice before changing its status.'
          );
        }
        const total = pending.reduce((sum, row) => sum + Number(row.amount), 0);
        await connection.execute(
          `UPDATE commissions SET status = 'rejected' WHERE referral_id = ? AND status IN ('pending','approved')`,
          [referral.id]
        );
        await connection.execute(
          `UPDATE referral_partners
              SET total_converted = GREATEST(0, total_converted - 1),
                  total_earned    = GREATEST(0, total_earned - ?)
            WHERE id = ?`,
          [total, partner.id]
        );
      }

      await connection.execute(
        `UPDATE referrals
            SET status = ?, notes = COALESCE(?, notes),
                admission_id = COALESCE(?, admission_id),
                student_id   = COALESCE(?, student_id),
                converted_at = ${willConvert ? 'COALESCE(converted_at, NOW())' : 'NULL'}
          WHERE id = ?`,
        [status, req.body.notes || null, req.body.admission_id || null, req.body.student_id || null, referral.id]
      );

      const [updated] = await connection.execute('SELECT * FROM referrals WHERE id = ?', [referral.id]);
      return { referral: updated[0], commission, partnerName: partner.name, previous: referral.status };
    });

    await recordAuditEvent(req, {
      institutionId,
      action: `referral.${status}`,
      description: `${outcome.referral.referee_name}: ${outcome.previous} → ${status}`,
      entityType: 'referral',
      entityId: req.params.id,
      severity: status === 'converted' ? 'success' : 'info',
      metadata: { commission_amount: outcome.commission?.amount ?? null },
    });

    res.json({ referral: outcome.referral, commission: outcome.commission });
  })
);

// ==================================================================
// Commissions
// ==================================================================
router.get(
  '/commissions',
  requirePermission('referrals.read'),
  validate({ query: listQuery.extend({ status: z.enum(COMMISSION_STATUSES).optional(), partnerId: z.string().uuid().optional() }) }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const sort = parseSort(req.query, ['created_at', 'amount', 'status', 'paid_at'], 'created_at');

    const { clause, params } = buildWhere({
      alias: 'c',
      equals: { institution_id: req.institutionId, status: req.query.status, partner_id: req.query.partnerId },
    });

    const result = await paginatedQuery(db, {
      select: 'c.*, p.name AS partner_name, r.referee_name, i.invoice_no',
      from: `commissions c
             JOIN referral_partners p ON p.id = c.partner_id
             LEFT JOIN referrals r ON r.id = c.referral_id
             LEFT JOIN commission_invoices i ON i.id = c.invoice_id`,
      where: clause,
      params,
      orderBy: `c.${sort.sql}`,
      page,
      pageSize,
      offset,
    });

    res.json(result);
  })
);

router.post(
  '/commissions/:id/approve',
  requirePermission('commissions.approve'),
  validate({ params: idParam, body: z.object({ approved: z.boolean().default(true), notes: longText }) }),
  asyncHandler(async (req, res) => {
    const commission = await findOwnedOrFail(db, 'commissions', req.params.id, req.institutionId);
    if (!['pending', 'approved', 'rejected'].includes(commission.status)) {
      throw ApiError.conflict(`A commission that is "${commission.status}" can no longer be approved or rejected.`);
    }

    const nextStatus = req.body.approved ? 'approved' : 'rejected';
    await db.execute(
      `UPDATE commissions
          SET status = ?, notes = COALESCE(?, notes), approved_by = ?, approved_at = NOW()
        WHERE id = ? AND institution_id = ?`,
      [nextStatus, req.body.notes || null, req.auth.profile.id, req.params.id, req.institutionId]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: `commission.${nextStatus}`,
      description: `Commission of ${commission.amount} ${nextStatus}`,
      entityType: 'commission',
      entityId: req.params.id,
      severity: req.body.approved ? 'success' : 'warning',
    });

    const updated = await findOwnedOrFail(db, 'commissions', req.params.id, req.institutionId);
    res.json({ commission: updated });
  })
);

// ==================================================================
// Invoices
// ==================================================================
router.get(
  '/invoices',
  requirePermission('referrals.read'),
  validate({ query: listQuery.extend({ status: z.enum(INVOICE_STATUSES).optional(), partnerId: z.string().uuid().optional() }) }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const sort = parseSort(req.query, ['created_at', 'invoice_no', 'total', 'status', 'due_at'], 'created_at');

    const { clause, params } = buildWhere({
      alias: 'i',
      equals: { institution_id: req.institutionId, status: req.query.status, partner_id: req.query.partnerId },
      search: req.query.search,
      searchColumns: ['invoice_no'],
    });

    const result = await paginatedQuery(db, {
      select: `i.*, p.name AS partner_name,
               (SELECT COUNT(*) FROM commissions c WHERE c.invoice_id = i.id) AS line_count`,
      from: 'commission_invoices i JOIN referral_partners p ON p.id = i.partner_id',
      where: clause,
      params,
      orderBy: `i.${sort.sql}`,
      page,
      pageSize,
      offset,
    });

    res.json(result);
  })
);

router.get(
  '/invoices/:id',
  requirePermission('referrals.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const invoice = await findOwnedOrFail(db, 'commission_invoices', req.params.id, req.institutionId);
    const partner = await findOwnedOrFail(db, 'referral_partners', invoice.partner_id, req.institutionId);
    const [lines] = await db.execute(
      `SELECT c.*, r.referee_name, r.converted_at
         FROM commissions c
         LEFT JOIN referrals r ON r.id = c.referral_id
        WHERE c.invoice_id = ?
        ORDER BY c.created_at`,
      [req.params.id]
    );
    res.json({ invoice, partner, lines });
  })
);

/** Batch every approved commission for a partner into one invoice. */
const invoiceSchema = z.object({
  partner_id: z.string().uuid(),
  period_start: isoDate,
  period_end: isoDate,
  tax_rate: z.coerce.number().min(0).max(100).default(0),
  due_at: isoDate,
  notes: longText,
  commission_ids: z.array(z.string().uuid()).optional(),
});

router.post(
  '/invoices',
  requirePermission('commissions.approve'),
  validate({ body: invoiceSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const institutionId = req.institutionId;
    const partner = await findOwnedOrFail(db, 'referral_partners', body.partner_id, institutionId);
    const invoiceNo = await nextSequenceNo(db, {
      table: 'commission_invoices',
      column: 'invoice_no',
      institutionId,
      prefix: 'CINV',
    });

    const invoice = await withTransaction(async (connection) => {
      const filters = ['institution_id = ?', 'partner_id = ?', "status = 'approved'", 'invoice_id IS NULL'];
      const params = [institutionId, body.partner_id];

      if (body.commission_ids?.length) {
        filters.push(`id IN (${body.commission_ids.map(() => '?').join(', ')})`);
        params.push(...body.commission_ids);
      }
      if (body.period_start) {
        filters.push('DATE(created_at) >= ?');
        params.push(body.period_start);
      }
      if (body.period_end) {
        filters.push('DATE(created_at) <= ?');
        params.push(body.period_end);
      }

      const [commissions] = await connection.execute(
        `SELECT id, amount FROM commissions WHERE ${filters.join(' AND ')} FOR UPDATE`,
        params
      );

      if (commissions.length === 0) {
        throw ApiError.badRequest(
          `No approved, un-invoiced commissions found for ${partner.name} in that period.`
        );
      }

      const subtotal = Number(
        commissions.reduce((sum, row) => sum + Number(row.amount), 0).toFixed(2)
      );
      const taxAmount = Number(((subtotal * body.tax_rate) / 100).toFixed(2));
      const total = Number((subtotal + taxAmount).toFixed(2));
      const invoiceId = uuidv4();

      await connection.execute(
        `INSERT INTO commission_invoices
           (id, institution_id, partner_id, invoice_no, period_start, period_end,
            subtotal, tax_rate, tax_amount, total, status, notes, due_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
        [
          invoiceId, institutionId, body.partner_id, invoiceNo, body.period_start,
          body.period_end, subtotal, body.tax_rate, taxAmount, total,
          body.notes, body.due_at, req.auth.profile.id,
        ]
      );

      await connection.query(
        `UPDATE commissions SET status = 'invoiced', invoice_id = ? WHERE id IN (?)`,
        [invoiceId, commissions.map((row) => row.id)]
      );

      const [created] = await connection.execute('SELECT * FROM commission_invoices WHERE id = ?', [invoiceId]);
      return { ...created[0], line_count: commissions.length };
    });

    await recordAuditEvent(req, {
      institutionId,
      action: 'commission_invoice.created',
      description: `Invoice ${invoiceNo} for ${partner.name}: ${invoice.total}`,
      entityType: 'commission_invoice',
      entityId: invoice.id,
      severity: 'success',
      metadata: { line_count: invoice.line_count, total: invoice.total },
    });

    res.status(201).json({ invoice });
  })
);

const invoiceStatusSchema = z.object({
  status: z.enum(INVOICE_STATUSES),
  notes: longText,
});

router.post(
  '/invoices/:id/status',
  requirePermission('commissions.approve'),
  validate({ params: idParam, body: invoiceStatusSchema }),
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    const institutionId = req.institutionId;

    const invoice = await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM commission_invoices WHERE id = ? AND institution_id = ? FOR UPDATE',
        [req.params.id, institutionId]
      );
      const current = rows[0];
      if (!current) throw ApiError.notFound('Invoice not found');
      if (current.status === 'paid' && status !== 'paid') {
        throw ApiError.conflict('A paid invoice cannot be reopened.');
      }

      await connection.execute(
        `UPDATE commission_invoices
            SET status = ?,
                notes  = COALESCE(?, notes),
                issued_at = ${status === 'issued' ? 'COALESCE(issued_at, NOW())' : 'issued_at'},
                paid_at   = ${status === 'paid' ? 'NOW()' : 'paid_at'}
          WHERE id = ?`,
        [status, req.body.notes || null, req.params.id]
      );

      if (status === 'paid') {
        await connection.execute(
          `UPDATE commissions SET status = 'paid', paid_at = NOW() WHERE invoice_id = ?`,
          [req.params.id]
        );
        await connection.execute(
          'UPDATE referral_partners SET total_paid = total_paid + ? WHERE id = ?',
          [current.total, current.partner_id]
        );
      }

      if (status === 'void') {
        // Release the lines so they can be invoiced again.
        await connection.execute(
          `UPDATE commissions SET status = 'approved', invoice_id = NULL WHERE invoice_id = ?`,
          [req.params.id]
        );
      }

      const [updated] = await connection.execute('SELECT * FROM commission_invoices WHERE id = ?', [req.params.id]);
      return updated[0];
    });

    await recordAuditEvent(req, {
      institutionId,
      action: `commission_invoice.${status}`,
      description: `Invoice ${invoice.invoice_no} marked ${status}`,
      entityType: 'commission_invoice',
      entityId: req.params.id,
      severity: status === 'void' ? 'warning' : 'success',
    });

    res.json({ invoice });
  })
);

// ==================================================================
// Summary
// ==================================================================
router.get(
  '/summary',
  requirePermission('referrals.read'),
  asyncHandler(async (req, res) => {
    const [[partners]] = await db.execute(
      `SELECT COUNT(*) AS total, SUM(status = 'active') AS active,
              COALESCE(SUM(total_earned), 0) AS earned, COALESCE(SUM(total_paid), 0) AS paid
         FROM referral_partners WHERE institution_id = ?`,
      [req.institutionId]
    );

    const [[referrals]] = await db.execute(
      `SELECT COUNT(*) AS total,
              SUM(status = 'converted') AS converted,
              SUM(status = 'pending')   AS pending
         FROM referrals WHERE institution_id = ?`,
      [req.institutionId]
    );

    const [[commissions]] = await db.execute(
      `SELECT COALESCE(SUM(CASE WHEN status = 'pending'  THEN amount ELSE 0 END), 0) AS pending,
              COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) AS approved,
              COALESCE(SUM(CASE WHEN status = 'invoiced' THEN amount ELSE 0 END), 0) AS invoiced,
              COALESCE(SUM(CASE WHEN status = 'paid'     THEN amount ELSE 0 END), 0) AS paid
         FROM commissions WHERE institution_id = ?`,
      [req.institutionId]
    );

    const [topPartners] = await db.execute(
      `SELECT id, name, total_converted, total_earned
         FROM referral_partners
        WHERE institution_id = ?
        ORDER BY total_earned DESC LIMIT 5`,
      [req.institutionId]
    );

    const total = Number(referrals.total) || 0;
    res.json({
      partners,
      referrals: {
        ...referrals,
        conversion_rate: total > 0 ? Number(((Number(referrals.converted) / total) * 100).toFixed(1)) : 0,
      },
      commissions,
      topPartners,
    });
  })
);

export default router;
