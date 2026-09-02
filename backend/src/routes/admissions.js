/**
 * Admissions — applications, the decision pipeline, offer letters and
 * enrolment.
 *
 * Hardened (the old PUT interpolated request keys into SQL) and extended to
 * EIMS parity: application numbers, programs, a status history, offer
 * issue/accept, and conversion into a student record.
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
  z, optionalText, longText, isoDate, listQuery, idParam, optionalUuid, email, phone, partialUpdate,
} from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('admissions'));

const STATUSES = [
  'pending', 'under_review', 'shortlisted', 'offered',
  'approved', 'rejected', 'withdrawn', 'enrolled',
];
const SOURCES = ['direct', 'website', 'walk_in', 'referral', 'campaign', 'social', 'agent', 'other'];
const SORTABLE = ['applied_at', 'updated_at', 'applicant_name', 'status', 'application_no'];

const UPDATABLE = [
  'applicant_name', 'email', 'phone', 'dob', 'class_applying', 'parent_name',
  'parent_phone', 'address', 'remarks', 'program_id', 'assigned_to', 'source',
  'intake_year', 'intake_term', 'documents_verified',
];

const admissionSchema = z.object({
  applicant_name: z.string().trim().min(1).max(200),
  email,
  phone,
  dob: isoDate,
  class_applying: optionalText(50),
  parent_name: optionalText(200),
  parent_phone: phone,
  address: longText,
  remarks: longText,
  program_id: optionalUuid,
  assigned_to: optionalUuid,
  source: z.enum(SOURCES).default('direct'),
  intake_year: z.coerce.number().int().min(2000).max(2100).nullable().optional(),
  intake_term: optionalText(30),
});

async function recordStatusChange(connection, { admissionId, institutionId, from, to, note, changedBy }) {
  await connection.execute(
    `INSERT INTO admission_status_history
       (id, admission_id, institution_id, from_status, to_status, note, changed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), admissionId, institutionId, from, to, note || null, changedBy]
  );
}

// ------------------------------------------------------------------ list
router.get(
  '/',
  requirePermission('admissions.read'),
  validate({
    query: listQuery.extend({
      status: z.enum(STATUSES).optional(),
      programId: z.string().uuid().optional(),
      source: z.enum(SOURCES).optional(),
      intakeYear: z.coerce.number().int().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const sort = parseSort(req.query, SORTABLE, 'applied_at');

    const { clause, params } = buildWhere({
      alias: 'a',
      equals: {
        institution_id: req.institutionId,
        status: req.query.status,
        program_id: req.query.programId,
        source: req.query.source,
        intake_year: req.query.intakeYear,
      },
      search: req.query.search,
      searchColumns: ['applicant_name', 'email', 'phone', 'application_no'],
    });

    const result = await paginatedQuery(db, {
      select: `a.*, p.name AS program_name,
               CONCAT_WS(' ', u.first_name, u.last_name) AS assigned_to_name`,
      from: `admissions a
             LEFT JOIN programs p ON p.id = a.program_id
             LEFT JOIN user_profiles u ON u.id = a.assigned_to`,
      where: clause,
      params,
      orderBy: `a.${sort.sql}`,
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

// --------------------------------------------------------------- summary
router.get(
  '/summary',
  requirePermission('admissions.read'),
  asyncHandler(async (req, res) => {
    const [byStatus] = await db.execute(
      'SELECT status, COUNT(*) AS total FROM admissions WHERE institution_id = ? GROUP BY status',
      [req.institutionId]
    );
    const [bySource] = await db.execute(
      'SELECT source, COUNT(*) AS total FROM admissions WHERE institution_id = ? GROUP BY source ORDER BY total DESC',
      [req.institutionId]
    );
    const [[totals]] = await db.execute(
      `SELECT COUNT(*) AS total,
              SUM(status = 'approved') AS approved,
              SUM(status = 'enrolled') AS enrolled,
              SUM(status = 'rejected') AS rejected,
              SUM(documents_verified = 1) AS documents_verified,
              SUM(offer_issued_at IS NOT NULL) AS offers_issued
         FROM admissions WHERE institution_id = ?`,
      [req.institutionId]
    );

    const statusMap = Object.fromEntries(STATUSES.map((status) => [status, 0]));
    for (const row of byStatus) statusMap[row.status] = Number(row.total);

    const total = Number(totals.total) || 0;
    res.json({
      byStatus: statusMap,
      bySource,
      totals: {
        ...totals,
        approval_rate: total > 0 ? Number(((Number(totals.approved) / total) * 100).toFixed(1)) : 0,
      },
    });
  })
);

// ------------------------------------------------------------------- one
router.get(
  '/:id',
  requirePermission('admissions.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const admission = await findOwnedOrFail(db, 'admissions', req.params.id, req.institutionId);

    const [history] = await db.execute(
      `SELECT h.*, CONCAT_WS(' ', u.first_name, u.last_name) AS changed_by_name
         FROM admission_status_history h
         LEFT JOIN user_profiles u ON u.id = h.changed_by
        WHERE h.admission_id = ? ORDER BY h.created_at DESC`,
      [req.params.id]
    );
    const [documents] = await db.execute(
      'SELECT * FROM student_documents WHERE admission_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );

    res.json({ admission, history, documents });
  })
);

// ---------------------------------------------------------------- create
router.post(
  '/',
  requirePermission('admissions.write'),
  validate({ body: admissionSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const id = uuidv4();
    const applicationNo = await nextSequenceNo(db, {
      table: 'admissions', column: 'application_no', institutionId: req.institutionId, prefix: 'APP',
    });

    await db.execute(
      `INSERT INTO admissions
         (id, institution_id, application_no, applicant_name, email, phone, dob,
          class_applying, parent_name, parent_phone, address, status, remarks,
          program_id, assigned_to, source, intake_year, intake_term)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
      [
        id, req.institutionId, applicationNo, body.applicant_name, body.email, body.phone,
        body.dob, body.class_applying, body.parent_name, body.parent_phone, body.address,
        body.remarks, body.program_id || null, body.assigned_to || null, body.source,
        body.intake_year ?? null, body.intake_term,
      ]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'admission.created',
      description: `Application ${applicationNo} from ${body.applicant_name}`,
      entityType: 'admission',
      entityId: id,
      severity: 'success',
    });

    const admission = await findOwnedOrFail(db, 'admissions', id, req.institutionId);
    res.status(201).json(admission);
  })
);

// ---------------------------------------------------------------- update
router.put(
  '/:id',
  requirePermission('admissions.write'),
  validate({
    params: idParam,
    body: partialUpdate(admissionSchema).extend({
      status: z.enum(STATUSES).optional(),
      documents_verified: z.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const existing = await findOwnedOrFail(db, 'admissions', req.params.id, req.institutionId);

    const statusChange = req.body.status && req.body.status !== existing.status
      ? req.body.status
      : null;

    // Changing status through PUT is allowed — the page has always done it —
    // but it still has to be permitted and still has to leave a history row.
    if (statusChange && !['super_admin', 'admin', 'institution_admin', 'principal', 'staff'].includes(req.auth.profile.role)) {
      throw ApiError.forbidden('Changing an application status requires admissions.decide.');
    }

    const payload = { ...req.body };
    if (payload.documents_verified !== undefined) {
      payload.documents_verified = payload.documents_verified ? 1 : 0;
    }

    const update = buildUpdate(payload, statusChange ? [...UPDATABLE, 'status'] : UPDATABLE);
    if (!update) throw ApiError.badRequest('No updatable fields provided');

    await withTransaction(async (connection) => {
      await connection.execute(
        `UPDATE admissions SET ${update.sql} WHERE id = ? AND institution_id = ?`,
        [...update.params, req.params.id, req.institutionId]
      );

      if (statusChange) {
        await recordStatusChange(connection, {
          admissionId: req.params.id,
          institutionId: req.institutionId,
          from: existing.status,
          to: statusChange,
          note: req.body.remarks || null,
          changedBy: req.auth.profile.id,
        });
      }
    });

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'admission.updated',
      entityType: 'admission',
      entityId: req.params.id,
      metadata: { changed_fields: Object.keys(req.body) },
    });

    const admission = await findOwnedOrFail(db, 'admissions', req.params.id, req.institutionId);
    res.json(admission);
  })
);

// -------------------------------------------------------------- decision
const decisionSchema = z.object({
  status: z.enum(STATUSES),
  note: longText,
  decision_reason: optionalText(1000),
});

router.post(
  '/:id/decision',
  requirePermission('admissions.decide'),
  validate({ params: idParam, body: decisionSchema }),
  asyncHandler(async (req, res) => {
    const { status, note } = req.body;
    const institutionId = req.institutionId;
    const changedBy = req.auth.profile.id;

    const admission = await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM admissions WHERE id = ? AND institution_id = ? FOR UPDATE',
        [req.params.id, institutionId]
      );
      const current = rows[0];
      if (!current) throw ApiError.notFound('Application not found');
      if (current.status === 'enrolled') {
        throw ApiError.conflict('This applicant is already enrolled.');
      }
      if (current.status === status) {
        throw ApiError.badRequest(`Application is already "${status}".`);
      }

      await connection.execute(
        `UPDATE admissions SET status = ?, decision_reason = COALESCE(?, decision_reason) WHERE id = ?`,
        [status, req.body.decision_reason || null, req.params.id]
      );

      await recordStatusChange(connection, {
        admissionId: req.params.id,
        institutionId,
        from: current.status,
        to: status,
        note,
        changedBy,
      });

      const [updated] = await connection.execute('SELECT * FROM admissions WHERE id = ?', [req.params.id]);
      return { ...updated[0], _previous: current.status };
    });

    await recordAuditEvent(req, {
      institutionId,
      action: `admission.${status}`,
      description: `${admission.applicant_name}: ${admission._previous} → ${status}`,
      entityType: 'admission',
      entityId: req.params.id,
      severity: status === 'rejected' ? 'warning' : 'success',
    });

    delete admission._previous;
    res.json(admission);
  })
);

// ----------------------------------------------------------- offer letter
const offerSchema = z.object({
  offer_letter_url: optionalText(500),
  expires_in_days: z.coerce.number().int().min(1).max(365).default(14),
  note: longText,
});

router.post(
  '/:id/offer',
  requirePermission('admissions.decide'),
  validate({ params: idParam, body: offerSchema }),
  asyncHandler(async (req, res) => {
    const institutionId = req.institutionId;

    const admission = await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM admissions WHERE id = ? AND institution_id = ? FOR UPDATE',
        [req.params.id, institutionId]
      );
      const current = rows[0];
      if (!current) throw ApiError.notFound('Application not found');
      if (['rejected', 'withdrawn'].includes(current.status)) {
        throw ApiError.conflict(`Cannot issue an offer to a ${current.status} application.`);
      }

      await connection.execute(
        `UPDATE admissions
            SET status = 'offered',
                offer_letter_url = COALESCE(?, offer_letter_url),
                offer_issued_at  = NOW(),
                offer_expires_at = DATE_ADD(NOW(), INTERVAL ? DAY)
          WHERE id = ?`,
        [req.body.offer_letter_url || null, req.body.expires_in_days, req.params.id]
      );

      await recordStatusChange(connection, {
        admissionId: req.params.id,
        institutionId,
        from: current.status,
        to: 'offered',
        note: req.body.note,
        changedBy: req.auth.profile.id,
      });

      const [updated] = await connection.execute('SELECT * FROM admissions WHERE id = ?', [req.params.id]);
      return updated[0];
    });

    await recordAuditEvent(req, {
      institutionId,
      action: 'admission.offer_issued',
      description: `Offer issued to ${admission.applicant_name}`,
      entityType: 'admission',
      entityId: req.params.id,
      severity: 'success',
    });

    res.json(admission);
  })
);

router.post(
  '/:id/accept-offer',
  requirePermission('admissions.decide'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const admission = await findOwnedOrFail(db, 'admissions', req.params.id, req.institutionId);
    if (!admission.offer_issued_at) throw ApiError.badRequest('No offer has been issued for this application.');
    if (admission.offer_expires_at && new Date(admission.offer_expires_at) < new Date()) {
      throw ApiError.conflict(`The offer expired on ${admission.offer_expires_at}.`);
    }

    await db.execute(
      `UPDATE admissions SET offer_accepted_at = NOW(), status = 'approved' WHERE id = ?`,
      [req.params.id]
    );

    const updated = await findOwnedOrFail(db, 'admissions', req.params.id, req.institutionId);
    res.json(updated);
  })
);

// -------------------------------------------------------------- enrolment
const enrolSchema = z.object({
  admission_no: optionalText(50),
  class_name: optionalText(50),
  section: optionalText(20),
});

/** Turn an approved application into a student record. */
router.post(
  '/:id/enrol',
  requirePermission('admissions.decide', 'students.write'),
  validate({ params: idParam, body: enrolSchema }),
  asyncHandler(async (req, res) => {
    const institutionId = req.institutionId;

    const outcome = await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM admissions WHERE id = ? AND institution_id = ? FOR UPDATE',
        [req.params.id, institutionId]
      );
      const admission = rows[0];
      if (!admission) throw ApiError.notFound('Application not found');
      if (admission.student_id) throw ApiError.conflict('This applicant has already been enrolled.');
      if (!['approved', 'offered'].includes(admission.status)) {
        throw ApiError.badRequest(`Only an approved or offered application can be enrolled (this one is "${admission.status}").`);
      }

      const [firstName, ...rest] = String(admission.applicant_name).trim().split(/\s+/);
      const studentId = uuidv4();

      await connection.execute(
        `INSERT INTO students
           (id, institution_id, admission_no, first_name, last_name, email, phone,
            dob, address, class_name, section, parent_name, parent_phone, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [
          studentId, institutionId, req.body.admission_no || admission.application_no,
          firstName, rest.join(' ') || null, admission.email, admission.phone,
          admission.dob, admission.address,
          req.body.class_name || admission.class_applying, req.body.section || null,
          admission.parent_name, admission.parent_phone,
        ]
      );

      await connection.execute(
        `UPDATE admissions SET status = 'enrolled', student_id = ? WHERE id = ?`,
        [studentId, admission.id]
      );

      await recordStatusChange(connection, {
        admissionId: admission.id,
        institutionId,
        from: admission.status,
        to: 'enrolled',
        note: 'Converted to a student record',
        changedBy: req.auth.profile.id,
      });

      // Any documents collected during the application follow the student.
      await connection.execute(
        'UPDATE student_documents SET student_id = ? WHERE admission_id = ? AND student_id IS NULL',
        [studentId, admission.id]
      );

      // Fill one seat on the program, if the application named one.
      if (admission.program_id) {
        await connection.execute(
          'UPDATE programs SET seats_filled = seats_filled + 1 WHERE id = ?',
          [admission.program_id]
        );
      }

      const [studentRows] = await connection.execute('SELECT * FROM students WHERE id = ?', [studentId]);
      const [admissionRows] = await connection.execute('SELECT * FROM admissions WHERE id = ?', [admission.id]);
      return { student: studentRows[0], admission: admissionRows[0] };
    });

    await recordAuditEvent(req, {
      institutionId,
      action: 'admission.enrolled',
      description: `Enrolled ${outcome.admission.applicant_name}`,
      entityType: 'admission',
      entityId: req.params.id,
      severity: 'success',
      metadata: { student_id: outcome.student.id },
    });

    res.status(201).json(outcome);
  })
);

export default router;
