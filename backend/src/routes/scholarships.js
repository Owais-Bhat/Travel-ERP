/**
 * Scholarships — schemes, applications, eligibility scoring, awards and
 * cashback disbursement.
 *
 * Award accounting is the delicate part: approving an application commits
 * budget and consumes an award slot on the scheme, so approve/reject/revert
 * all run inside a transaction that re-reads the scheme `FOR UPDATE`.
 */
import express from 'express';
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
  z, optionalText, longText, money, percentage, count, isoDate,
  listQuery, idParam, optionalUuid, partialUpdate,
} from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('scholarships'));

const SCHEME_TYPES = ['merit', 'need', 'sports', 'minority', 'staff', 'alumni', 'other'];
const AWARD_TYPES = ['percentage', 'fixed'];
const SCHEME_STATUSES = ['draft', 'open', 'closed', 'archived'];
const APPLICATION_STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'disbursed', 'withdrawn'];
const CASHBACK_STATUSES = ['pending', 'approved', 'paid', 'failed', 'cancelled'];

/**
 * Score an application against its scheme, 0-100.
 *
 * Academics carry the most weight, then financial need (inverted — a lower
 * family income scores higher), then a small bonus for a complete profile.
 * A hard fail on a stated minimum returns 0 so it sorts to the bottom.
 */
export function scoreEligibility(application, scheme) {
  const reasons = [];

  const percent = Number(application.academic_percentage);
  if (scheme.min_percentage !== null && scheme.min_percentage !== undefined) {
    const minimum = Number(scheme.min_percentage);
    if (!Number.isFinite(percent) || percent < minimum) {
      return { score: 0, eligible: false, reasons: [`Below the ${minimum}% academic minimum`] };
    }
  }

  const income = Number(application.family_income);
  if (scheme.max_family_income !== null && scheme.max_family_income !== undefined) {
    const cap = Number(scheme.max_family_income);
    if (Number.isFinite(income) && income > cap) {
      return { score: 0, eligible: false, reasons: [`Family income exceeds the cap of ${cap}`] };
    }
  }

  let score = 0;

  // Academic merit — up to 60 points.
  if (Number.isFinite(percent)) {
    score += Math.min(60, (percent / 100) * 60);
    reasons.push(`Academic ${percent}%`);
  }

  // Financial need — up to 30 points, scaled against the scheme's cap.
  const cap = Number(scheme.max_family_income);
  if (Number.isFinite(income) && Number.isFinite(cap) && cap > 0) {
    const need = Math.max(0, 1 - income / cap);
    score += need * 30;
    reasons.push(`Need factor ${(need * 100).toFixed(0)}%`);
  } else if (Number.isFinite(income)) {
    score += 15;
  }

  // Completeness — up to 10 points, rewards a usable application.
  const completeness = ['email', 'phone', 'statement', 'category']
    .filter((field) => application[field]).length / 4;
  score += completeness * 10;

  return {
    score: Number(Math.min(100, score).toFixed(2)),
    eligible: true,
    reasons,
  };
}

/** Money the scheme would award for a given application. */
export function computeAward(scheme, { requestedAmount = 0, tuitionFee = 0 } = {}) {
  if (scheme.award_type === 'fixed') {
    return Number(scheme.award_value);
  }
  const base = Number(tuitionFee) || Number(requestedAmount) || 0;
  return Number(((base * Number(scheme.award_value)) / 100).toFixed(2));
}

// ==================================================================
// Schemes
// ==================================================================
const schemeSchema = z.object({
  name: z.string().trim().min(1).max(255),
  code: optionalText(60),
  type: z.enum(SCHEME_TYPES).default('merit'),
  award_type: z.enum(AWARD_TYPES).default('percentage'),
  award_value: money.default(0),
  currency: z.string().trim().length(3).default('INR'),
  max_awards: count.default(0),
  budget_total: money.default(0),
  min_percentage: percentage.nullable().optional(),
  max_family_income: money.nullable().optional(),
  eligibility_notes: longText,
  description: longText,
  opens_at: isoDate,
  closes_at: isoDate,
  status: z.enum(SCHEME_STATUSES).default('open'),
});

const SCHEME_UPDATABLE = [
  'name', 'code', 'type', 'award_type', 'award_value', 'currency', 'max_awards',
  'budget_total', 'min_percentage', 'max_family_income', 'eligibility_notes',
  'description', 'opens_at', 'closes_at', 'status',
];

router.get(
  '/schemes',
  requirePermission('scholarships.read'),
  validate({ query: listQuery.extend({ status: z.enum(SCHEME_STATUSES).optional(), type: z.enum(SCHEME_TYPES).optional() }) }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const sort = parseSort(req.query, ['created_at', 'name', 'award_value', 'closes_at', 'status'], 'created_at');

    const { clause, params } = buildWhere({
      alias: 's',
      equals: { institution_id: req.institutionId, status: req.query.status, type: req.query.type },
      search: req.query.search,
      searchColumns: ['name', 'code'],
    });

    const result = await paginatedQuery(db, {
      select: `s.*,
               (SELECT COUNT(*) FROM scholarship_applications a WHERE a.scheme_id = s.id) AS application_count,
               (SELECT COUNT(*) FROM scholarship_applications a WHERE a.scheme_id = s.id AND a.status = 'approved') AS approved_count`,
      from: 'scholarship_schemes s',
      where: clause,
      params,
      orderBy: `s.${sort.sql}`,
      page,
      pageSize,
      offset,
    });

    res.json(result);
  })
);

router.post(
  '/schemes',
  requirePermission('scholarships.write'),
  validate({ body: schemeSchema }),
  asyncHandler(async (req, res) => {
    const id = uuidv4();
    const body = req.body;

    if (body.award_type === 'percentage' && body.award_value > 100) {
      throw ApiError.badRequest('A percentage award cannot exceed 100.');
    }

    await db.execute(
      `INSERT INTO scholarship_schemes
         (id, institution_id, name, code, type, award_type, award_value, currency,
          max_awards, budget_total, min_percentage, max_family_income,
          eligibility_notes, description, opens_at, closes_at, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, req.institutionId, body.name, body.code, body.type, body.award_type,
        body.award_value, body.currency, body.max_awards, body.budget_total,
        body.min_percentage ?? null, body.max_family_income ?? null,
        body.eligibility_notes, body.description, body.opens_at, body.closes_at,
        body.status, req.auth.profile.id,
      ]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'scholarship_scheme.created',
      description: `Created scholarship scheme ${body.name}`,
      entityType: 'scholarship_scheme',
      entityId: id,
      severity: 'success',
    });

    const scheme = await findOwnedOrFail(db, 'scholarship_schemes', id, req.institutionId);
    res.status(201).json({ scheme });
  })
);

router.get(
  '/schemes/:id',
  requirePermission('scholarships.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const scheme = await findOwnedOrFail(db, 'scholarship_schemes', req.params.id, req.institutionId);
    const [[stats]] = await db.execute(
      `SELECT COUNT(*) AS total,
              SUM(status = 'approved')  AS approved,
              SUM(status = 'rejected')  AS rejected,
              SUM(status = 'disbursed') AS disbursed,
              COALESCE(SUM(awarded_amount), 0) AS awarded_total
         FROM scholarship_applications WHERE scheme_id = ?`,
      [req.params.id]
    );
    res.json({ scheme, stats });
  })
);

router.put(
  '/schemes/:id',
  requirePermission('scholarships.write'),
  validate({ params: idParam, body: partialUpdate(schemeSchema) }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'scholarship_schemes', req.params.id, req.institutionId);
    const update = buildUpdate(req.body, SCHEME_UPDATABLE);
    if (!update) throw ApiError.badRequest('No updatable fields provided');

    await db.execute(
      `UPDATE scholarship_schemes SET ${update.sql} WHERE id = ? AND institution_id = ?`,
      [...update.params, req.params.id, req.institutionId]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'scholarship_scheme.updated',
      entityType: 'scholarship_scheme',
      entityId: req.params.id,
      metadata: { changed_fields: Object.keys(req.body) },
    });

    const scheme = await findOwnedOrFail(db, 'scholarship_schemes', req.params.id, req.institutionId);
    res.json({ scheme });
  })
);

router.delete(
  '/schemes/:id',
  requirePermission('scholarships.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const scheme = await findOwnedOrFail(db, 'scholarship_schemes', req.params.id, req.institutionId);
    const [[{ total }]] = await db.execute(
      'SELECT COUNT(*) AS total FROM scholarship_applications WHERE scheme_id = ?',
      [req.params.id]
    );
    if (Number(total) > 0) {
      throw ApiError.conflict(`This scheme has ${total} application(s). Archive it instead.`, { code: 'in_use' });
    }

    await db.execute('DELETE FROM scholarship_schemes WHERE id = ? AND institution_id = ?', [
      req.params.id, req.institutionId,
    ]);
    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'scholarship_scheme.deleted',
      description: `Deleted scheme ${scheme.name}`,
      entityType: 'scholarship_scheme',
      entityId: req.params.id,
      severity: 'warning',
    });
    res.json({ success: true });
  })
);

// ==================================================================
// Applications
// ==================================================================
const applicationSchema = z.object({
  scheme_id: z.string().uuid(),
  student_id: optionalUuid,
  admission_id: optionalUuid,
  applicant_name: z.string().trim().min(1).max(200),
  email: optionalText(255),
  phone: optionalText(30),
  academic_percentage: percentage.nullable().optional(),
  family_income: money.nullable().optional(),
  category: optionalText(60),
  statement: longText,
  requested_amount: money.default(0),
  status: z.enum(['draft', 'submitted']).default('submitted'),
});

router.get(
  '/applications',
  requirePermission('scholarships.read'),
  validate({
    query: listQuery.extend({
      status: z.enum(APPLICATION_STATUSES).optional(),
      schemeId: z.string().uuid().optional(),
      studentId: z.string().uuid().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const sort = parseSort(
      req.query,
      ['created_at', 'applicant_name', 'eligibility_score', 'awarded_amount', 'status'],
      'created_at'
    );

    const { clause, params } = buildWhere({
      alias: 'a',
      equals: {
        institution_id: req.institutionId,
        status: req.query.status,
        scheme_id: req.query.schemeId,
        student_id: req.query.studentId,
      },
      search: req.query.search,
      searchColumns: ['applicant_name', 'email', 'application_no'],
    });

    const result = await paginatedQuery(db, {
      select: `a.*, s.name AS scheme_name, s.award_type, s.currency`,
      from: 'scholarship_applications a JOIN scholarship_schemes s ON s.id = a.scheme_id',
      where: clause,
      params,
      orderBy: `a.${sort.sql}`,
      page,
      pageSize,
      offset,
    });

    res.json(result);
  })
);

router.post(
  '/applications',
  requirePermission('scholarships.write'),
  validate({ body: applicationSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const scheme = await findOwnedOrFail(db, 'scholarship_schemes', body.scheme_id, req.institutionId);

    if (!['open', 'draft'].includes(scheme.status)) {
      throw ApiError.badRequest(`Scheme "${scheme.name}" is ${scheme.status} and is not accepting applications.`);
    }
    if (scheme.closes_at && scheme.closes_at < new Date().toISOString().slice(0, 10)) {
      throw ApiError.badRequest(`Applications for "${scheme.name}" closed on ${scheme.closes_at}.`);
    }

    const evaluation = scoreEligibility(body, scheme);
    const id = uuidv4();
    const applicationNo = await nextSequenceNo(db, {
      table: 'scholarship_applications',
      column: 'application_no',
      institutionId: req.institutionId,
      prefix: 'SCH',
    });

    await db.execute(
      `INSERT INTO scholarship_applications
         (id, institution_id, scheme_id, student_id, admission_id, application_no,
          applicant_name, email, phone, academic_percentage, family_income, category,
          statement, eligibility_score, eligibility_notes, requested_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, req.institutionId, body.scheme_id, body.student_id || null, body.admission_id || null,
        applicationNo, body.applicant_name, body.email, body.phone,
        body.academic_percentage ?? null, body.family_income ?? null, body.category,
        body.statement, evaluation.score, evaluation.reasons.join('; '),
        body.requested_amount, body.status,
      ]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'scholarship_application.created',
      description: `${body.applicant_name} applied for ${scheme.name}`,
      entityType: 'scholarship_application',
      entityId: id,
      metadata: { eligibility_score: evaluation.score, eligible: evaluation.eligible },
    });

    const application = await findOwnedOrFail(db, 'scholarship_applications', id, req.institutionId);
    res.status(201).json({ application, evaluation });
  })
);

router.get(
  '/applications/:id',
  requirePermission('scholarships.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const application = await findOwnedOrFail(db, 'scholarship_applications', req.params.id, req.institutionId);
    const scheme = await findOwnedOrFail(db, 'scholarship_schemes', application.scheme_id, req.institutionId);
    const [cashback] = await db.execute(
      'SELECT * FROM cashback_transactions WHERE application_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json({
      application,
      scheme,
      cashback,
      evaluation: scoreEligibility(application, scheme),
    });
  })
);

/**
 * Decide an application. Approving commits scheme budget and an award slot;
 * rejecting an already-approved application releases them again.
 */
const decisionSchema = z.object({
  status: z.enum(['under_review', 'approved', 'rejected', 'withdrawn']),
  awarded_amount: money.optional(),
  review_notes: longText,
});

router.post(
  '/applications/:id/decision',
  requirePermission('scholarships.approve'),
  validate({ params: idParam, body: decisionSchema }),
  asyncHandler(async (req, res) => {
    const { status, review_notes: reviewNotes } = req.body;
    const institutionId = req.institutionId;
    const reviewerId = req.auth.profile.id;

    const result = await withTransaction(async (connection) => {
      const [applicationRows] = await connection.execute(
        'SELECT * FROM scholarship_applications WHERE id = ? AND institution_id = ? FOR UPDATE',
        [req.params.id, institutionId]
      );
      const application = applicationRows[0];
      if (!application) throw ApiError.notFound('Application not found');
      if (application.status === 'disbursed') {
        throw ApiError.conflict('This application has already been disbursed and can no longer be changed.');
      }

      const [schemeRows] = await connection.execute(
        'SELECT * FROM scholarship_schemes WHERE id = ? AND institution_id = ? FOR UPDATE',
        [application.scheme_id, institutionId]
      );
      const scheme = schemeRows[0];
      if (!scheme) throw ApiError.notFound('Scheme not found');

      const wasApproved = application.status === 'approved';
      const willApprove = status === 'approved';
      let awardedAmount = Number(application.awarded_amount) || 0;

      if (willApprove) {
        const evaluation = scoreEligibility(application, scheme);
        if (!evaluation.eligible) {
          throw ApiError.badRequest(`Applicant is not eligible: ${evaluation.reasons.join('; ')}`);
        }

        awardedAmount = req.body.awarded_amount !== undefined
          ? Number(req.body.awarded_amount)
          : computeAward(scheme, { requestedAmount: application.requested_amount });

        if (!wasApproved) {
          const slots = Number(scheme.max_awards);
          if (slots > 0 && Number(scheme.awards_granted) >= slots) {
            throw ApiError.conflict(`"${scheme.name}" has no award slots left (${slots} of ${slots} used).`);
          }
          const budget = Number(scheme.budget_total);
          if (budget > 0 && Number(scheme.budget_committed) + awardedAmount > budget) {
            const remaining = budget - Number(scheme.budget_committed);
            throw ApiError.conflict(
              `Award of ${awardedAmount} exceeds the remaining budget of ${remaining.toFixed(2)}.`
            );
          }

          await connection.execute(
            `UPDATE scholarship_schemes
                SET awards_granted = awards_granted + 1,
                    budget_committed = budget_committed + ?
              WHERE id = ?`,
            [awardedAmount, scheme.id]
          );
        }
      } else if (wasApproved) {
        // Releasing a previously approved award.
        await connection.execute(
          `UPDATE scholarship_schemes
              SET awards_granted   = GREATEST(0, awards_granted - 1),
                  budget_committed = GREATEST(0, budget_committed - ?)
            WHERE id = ?`,
          [Number(application.awarded_amount) || 0, scheme.id]
        );
        awardedAmount = 0;
      }

      await connection.execute(
        `UPDATE scholarship_applications
            SET status = ?, awarded_amount = ?, review_notes = ?, reviewed_by = ?, reviewed_at = NOW()
          WHERE id = ? AND institution_id = ?`,
        [status, awardedAmount, reviewNotes || null, reviewerId, req.params.id, institutionId]
      );

      const [updatedRows] = await connection.execute(
        'SELECT * FROM scholarship_applications WHERE id = ?',
        [req.params.id]
      );
      return { application: updatedRows[0], previousStatus: application.status };
    });

    await recordAuditEvent(req, {
      institutionId,
      action: `scholarship_application.${status}`,
      description: `${result.application.applicant_name}: ${result.previousStatus} → ${status}`,
      entityType: 'scholarship_application',
      entityId: req.params.id,
      severity: status === 'rejected' ? 'warning' : 'success',
      metadata: { awarded_amount: result.application.awarded_amount, notes: reviewNotes || null },
    });

    res.json({ application: result.application });
  })
);

/** Disburse an approved award as a cashback transaction. */
const disburseSchema = z.object({
  amount: money.optional(),
  payout_method: z.enum(['bank_transfer', 'upi', 'cheque', 'fee_adjustment', 'cash']).default('fee_adjustment'),
  reference_no: optionalText(80),
  notes: longText,
});

router.post(
  '/applications/:id/disburse',
  requirePermission('scholarships.approve'),
  validate({ params: idParam, body: disburseSchema }),
  asyncHandler(async (req, res) => {
    const institutionId = req.institutionId;

    const transaction = await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM scholarship_applications WHERE id = ? AND institution_id = ? FOR UPDATE',
        [req.params.id, institutionId]
      );
      const application = rows[0];
      if (!application) throw ApiError.notFound('Application not found');
      if (application.status !== 'approved') {
        throw ApiError.badRequest(`Only approved applications can be disbursed (this one is "${application.status}").`);
      }

      const amount = req.body.amount !== undefined ? Number(req.body.amount) : Number(application.awarded_amount);
      if (!(amount > 0)) throw ApiError.badRequest('Disbursement amount must be greater than zero.');

      const cashbackId = uuidv4();
      await connection.execute(
        `INSERT INTO cashback_transactions
           (id, institution_id, student_id, application_id, source, amount, status,
            reference_no, payout_method, notes, approved_by, approved_at, paid_at)
         VALUES (?, ?, ?, ?, 'scholarship', ?, 'paid', ?, ?, ?, ?, NOW(), NOW())`,
        [
          cashbackId, institutionId, application.student_id, application.id, amount,
          req.body.reference_no || null, req.body.payout_method, req.body.notes || null,
          req.auth.profile.id,
        ]
      );

      await connection.execute(
        `UPDATE scholarship_applications SET status = 'disbursed' WHERE id = ?`,
        [application.id]
      );

      const [created] = await connection.execute('SELECT * FROM cashback_transactions WHERE id = ?', [cashbackId]);
      return created[0];
    });

    await recordAuditEvent(req, {
      institutionId,
      action: 'scholarship.disbursed',
      description: `Disbursed ${transaction.amount} via ${transaction.payout_method}`,
      entityType: 'cashback_transaction',
      entityId: transaction.id,
      severity: 'success',
    });

    res.status(201).json({ transaction });
  })
);

// ==================================================================
// Cashback ledger
// ==================================================================
router.get(
  '/cashback',
  requirePermission('scholarships.read'),
  validate({ query: listQuery.extend({ status: z.enum(CASHBACK_STATUSES).optional() }) }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const sort = parseSort(req.query, ['created_at', 'amount', 'status', 'paid_at'], 'created_at');

    const { clause, params } = buildWhere({
      alias: 'c',
      equals: { institution_id: req.institutionId, status: req.query.status },
      search: req.query.search,
      searchColumns: ['reference_no'],
    });

    const result = await paginatedQuery(db, {
      select: `c.*, CONCAT_WS(' ', st.first_name, st.last_name) AS student_name, a.applicant_name`,
      from: `cashback_transactions c
             LEFT JOIN students st ON st.id = c.student_id
             LEFT JOIN scholarship_applications a ON a.id = c.application_id`,
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

// ==================================================================
// Summary for dashboards
// ==================================================================
router.get(
  '/summary',
  requirePermission('scholarships.read'),
  asyncHandler(async (req, res) => {
    const [[schemes]] = await db.execute(
      `SELECT COUNT(*) AS total,
              SUM(status = 'open') AS open,
              COALESCE(SUM(budget_total), 0)     AS budget_total,
              COALESCE(SUM(budget_committed), 0) AS budget_committed
         FROM scholarship_schemes WHERE institution_id = ?`,
      [req.institutionId]
    );

    const [[applications]] = await db.execute(
      `SELECT COUNT(*) AS total,
              SUM(status = 'submitted')    AS submitted,
              SUM(status = 'under_review') AS under_review,
              SUM(status = 'approved')     AS approved,
              SUM(status = 'rejected')     AS rejected,
              SUM(status = 'disbursed')    AS disbursed,
              COALESCE(SUM(awarded_amount), 0) AS awarded_total
         FROM scholarship_applications WHERE institution_id = ?`,
      [req.institutionId]
    );

    const [[cashback]] = await db.execute(
      `SELECT COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0)    AS paid_total,
              COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) AS pending_total
         FROM cashback_transactions WHERE institution_id = ?`,
      [req.institutionId]
    );

    const [byType] = await db.execute(
      `SELECT s.type, COUNT(a.id) AS applications, COALESCE(SUM(a.awarded_amount), 0) AS awarded
         FROM scholarship_schemes s
         LEFT JOIN scholarship_applications a ON a.scheme_id = s.id
        WHERE s.institution_id = ?
        GROUP BY s.type`,
      [req.institutionId]
    );

    res.json({ schemes, applications, cashback, byType });
  })
);

export default router;
