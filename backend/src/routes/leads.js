/**
 * CRM — lead capture, assignment, activity timeline and conversion.
 *
 * Converting a lead creates the admission application it becomes, links any
 * originating referral to it, and closes the lead as won. That whole hand-off
 * is one transaction so a half-converted lead cannot exist.
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
  z, optionalText, longText, money, isoDate, listQuery, idParam, optionalUuid, email, phone, partialUpdate,
} from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('leads'));

const SOURCES = ['website', 'walk_in', 'referral', 'campaign', 'social', 'phone', 'event', 'other'];
const STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'whatsapp', 'note', 'stage_change'];

/**
 * Lead score, 0-100. Deliberately simple and explainable — sales staff need
 * to understand why a lead sits where it does.
 */
export function scoreLead(lead) {
  let score = 0;
  if (lead.email) score += 15;
  if (lead.phone) score += 20;
  if (lead.program_id) score += 15;
  if (lead.budget && Number(lead.budget) > 0) score += 15;
  if (lead.city) score += 5;

  score += { website: 10, referral: 20, walk_in: 15, event: 12, campaign: 8, social: 5, phone: 10, other: 0 }[lead.source] ?? 0;

  const stageBonus = { new: 0, contacted: 5, qualified: 10, proposal: 15, won: 15, lost: 0 };
  score += stageBonus[lead.stage] ?? 0;

  return Math.max(0, Math.min(100, Math.round(score)));
}

const leadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email,
  phone,
  city: optionalText(120),
  source: z.enum(SOURCES).default('website'),
  program_id: optionalUuid,
  interest: optionalText(255),
  stage: z.enum(STAGES).default('new'),
  budget: money.nullable().optional(),
  assigned_to: optionalUuid,
  referral_partner_id: optionalUuid,
  notes: longText,
  next_follow_up_at: isoDate,
});

const UPDATABLE = [
  'name', 'email', 'phone', 'city', 'source', 'program_id', 'interest',
  'budget', 'assigned_to', 'referral_partner_id', 'notes', 'next_follow_up_at',
];

// ------------------------------------------------------------------ list
router.get(
  '/',
  requirePermission('leads.read'),
  validate({
    query: listQuery.extend({
      stage: z.enum(STAGES).optional(),
      source: z.enum(SOURCES).optional(),
      assignedTo: z.string().uuid().optional(),
      overdue: z.coerce.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const sort = parseSort(
      req.query,
      ['created_at', 'updated_at', 'name', 'score', 'stage', 'next_follow_up_at'],
      'created_at'
    );

    const raw = [];
    if (req.query.overdue) {
      raw.push({ sql: "l.`next_follow_up_at` IS NOT NULL AND l.`next_follow_up_at` < CURDATE() AND l.`stage` NOT IN ('won','lost')" });
    }

    const { clause, params } = buildWhere({
      alias: 'l',
      equals: {
        institution_id: req.institutionId,
        stage: req.query.stage,
        source: req.query.source,
        assigned_to: req.query.assignedTo,
      },
      search: req.query.search,
      searchColumns: ['name', 'email', 'phone', 'interest'],
      raw,
    });

    const result = await paginatedQuery(db, {
      select: `l.*, p.name AS program_name,
               CONCAT_WS(' ', u.first_name, u.last_name) AS assigned_to_name,
               rp.name AS referral_partner_name,
               (SELECT COUNT(*) FROM lead_activities a WHERE a.lead_id = l.id) AS activity_count`,
      from: `leads l
             LEFT JOIN programs p ON p.id = l.program_id
             LEFT JOIN user_profiles u ON u.id = l.assigned_to
             LEFT JOIN referral_partners rp ON rp.id = l.referral_partner_id`,
      where: clause,
      params,
      orderBy: `l.${sort.sql}`,
      page,
      pageSize,
      offset,
    });

    res.json(result);
  })
);

// ------------------------------------------------------- pipeline summary
router.get(
  '/summary',
  requirePermission('leads.read'),
  asyncHandler(async (req, res) => {
    const [byStage] = await db.execute(
      `SELECT stage, COUNT(*) AS total, COALESCE(SUM(budget), 0) AS pipeline_value
         FROM leads WHERE institution_id = ? GROUP BY stage`,
      [req.institutionId]
    );

    const [bySource] = await db.execute(
      `SELECT source, COUNT(*) AS total, SUM(stage = 'won') AS won
         FROM leads WHERE institution_id = ? GROUP BY source ORDER BY total DESC`,
      [req.institutionId]
    );

    const [[totals]] = await db.execute(
      `SELECT COUNT(*) AS total,
              SUM(stage = 'won')  AS won,
              SUM(stage = 'lost') AS lost,
              SUM(next_follow_up_at IS NOT NULL AND next_follow_up_at < CURDATE()
                  AND stage NOT IN ('won','lost')) AS overdue_follow_ups,
              COALESCE(AVG(score), 0) AS average_score
         FROM leads WHERE institution_id = ?`,
      [req.institutionId]
    );

    const [[recent]] = await db.execute(
      `SELECT COUNT(*) AS created_last_30_days
         FROM leads WHERE institution_id = ? AND created_at >= (NOW() - INTERVAL 30 DAY)`,
      [req.institutionId]
    );

    const stageMap = Object.fromEntries(STAGES.map((stage) => [stage, { total: 0, pipeline_value: 0 }]));
    for (const row of byStage) {
      stageMap[row.stage] = { total: Number(row.total), pipeline_value: Number(row.pipeline_value) };
    }

    const total = Number(totals.total) || 0;
    res.json({
      byStage: stageMap,
      bySource,
      totals: {
        ...totals,
        ...recent,
        conversion_rate: total > 0 ? Number(((Number(totals.won) / total) * 100).toFixed(1)) : 0,
      },
    });
  })
);

// ------------------------------------------------------------------- one
router.get(
  '/:id',
  requirePermission('leads.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const lead = await findOwnedOrFail(db, 'leads', req.params.id, req.institutionId);
    const [activities] = await db.execute(
      `SELECT a.*, CONCAT_WS(' ', u.first_name, u.last_name) AS performed_by_name
         FROM lead_activities a
         LEFT JOIN user_profiles u ON u.id = a.performed_by
        WHERE a.lead_id = ?
        ORDER BY a.occurred_at DESC`,
      [req.params.id]
    );
    res.json({ lead, activities });
  })
);

// ---------------------------------------------------------------- create
router.post(
  '/',
  requirePermission('leads.write'),
  validate({ body: leadSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const id = uuidv4();
    const score = scoreLead(body);

    await db.execute(
      `INSERT INTO leads
         (id, institution_id, name, email, phone, city, source, program_id, interest,
          stage, score, budget, assigned_to, referral_partner_id, notes,
          next_follow_up_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, req.institutionId, body.name, body.email, body.phone, body.city,
        body.source, body.program_id || null, body.interest, body.stage, score,
        body.budget ?? null, body.assigned_to || null, body.referral_partner_id || null,
        body.notes, body.next_follow_up_at, req.auth.profile.id,
      ]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'lead.created',
      description: `Captured lead ${body.name} from ${body.source}`,
      entityType: 'lead',
      entityId: id,
      metadata: { score, source: body.source },
    });

    const lead = await findOwnedOrFail(db, 'leads', id, req.institutionId);
    res.status(201).json({ lead });
  })
);

// ---------------------------------------------------------------- update
router.put(
  '/:id',
  requirePermission('leads.write'),
  validate({ params: idParam, body: partialUpdate(leadSchema) }),
  asyncHandler(async (req, res) => {
    const existing = await findOwnedOrFail(db, 'leads', req.params.id, req.institutionId);
    const update = buildUpdate(req.body, UPDATABLE);
    if (!update) throw ApiError.badRequest('No updatable fields provided');

    const score = scoreLead({ ...existing, ...req.body });
    await db.execute(
      `UPDATE leads SET ${update.sql}, score = ? WHERE id = ? AND institution_id = ?`,
      [...update.params, score, req.params.id, req.institutionId]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'lead.updated',
      entityType: 'lead',
      entityId: req.params.id,
      metadata: { changed_fields: Object.keys(req.body) },
    });

    const lead = await findOwnedOrFail(db, 'leads', req.params.id, req.institutionId);
    res.json({ lead });
  })
);

// ----------------------------------------------------------- stage change
const stageSchema = z.object({
  stage: z.enum(STAGES),
  note: longText,
  lost_reason: optionalText(255),
  next_follow_up_at: isoDate,
});

router.post(
  '/:id/stage',
  requirePermission('leads.write'),
  validate({ params: idParam, body: stageSchema }),
  asyncHandler(async (req, res) => {
    const lead = await findOwnedOrFail(db, 'leads', req.params.id, req.institutionId);
    const { stage } = req.body;

    if (lead.stage === 'won' && stage !== 'won') {
      throw ApiError.conflict('A converted lead cannot be moved back into the pipeline.');
    }
    if (stage === 'lost' && !req.body.lost_reason) {
      throw ApiError.badRequest('A lost reason is required when marking a lead lost.');
    }

    const score = scoreLead({ ...lead, stage });

    await withTransaction(async (connection) => {
      await connection.execute(
        `UPDATE leads
            SET stage = ?, score = ?, lost_reason = ?,
                next_follow_up_at = COALESCE(?, next_follow_up_at),
                last_contacted_at = NOW()
          WHERE id = ? AND institution_id = ?`,
        [
          stage, score, stage === 'lost' ? req.body.lost_reason : null,
          req.body.next_follow_up_at, req.params.id, req.institutionId,
        ]
      );

      await connection.execute(
        `INSERT INTO lead_activities
           (id, institution_id, lead_id, type, subject, body, outcome, performed_by)
         VALUES (?, ?, ?, 'stage_change', ?, ?, ?, ?)`,
        [
          uuidv4(), req.institutionId, req.params.id,
          `${lead.stage} → ${stage}`, req.body.note || null, stage, req.auth.profile.id,
        ]
      );
    });

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: `lead.${stage}`,
      description: `${lead.name}: ${lead.stage} → ${stage}`,
      entityType: 'lead',
      entityId: req.params.id,
      severity: stage === 'lost' ? 'warning' : 'info',
    });

    const updated = await findOwnedOrFail(db, 'leads', req.params.id, req.institutionId);
    res.json({ lead: updated });
  })
);

// -------------------------------------------------------------- activity
const activitySchema = z.object({
  type: z.enum(ACTIVITY_TYPES).default('note'),
  subject: optionalText(255),
  body: longText,
  outcome: optionalText(60),
  occurred_at: z.string().optional(),
  next_follow_up_at: isoDate,
});

router.post(
  '/:id/activities',
  requirePermission('leads.write'),
  validate({ params: idParam, body: activitySchema }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'leads', req.params.id, req.institutionId);
    const activityId = uuidv4();

    await withTransaction(async (connection) => {
      await connection.execute(
        `INSERT INTO lead_activities
           (id, institution_id, lead_id, type, subject, body, outcome, performed_by, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
        [
          activityId, req.institutionId, req.params.id, req.body.type,
          req.body.subject, req.body.body, req.body.outcome,
          req.auth.profile.id, req.body.occurred_at || null,
        ]
      );

      await connection.execute(
        `UPDATE leads
            SET last_contacted_at = NOW(),
                next_follow_up_at = COALESCE(?, next_follow_up_at)
          WHERE id = ?`,
        [req.body.next_follow_up_at, req.params.id]
      );
    });

    const [rows] = await db.execute('SELECT * FROM lead_activities WHERE id = ?', [activityId]);
    res.status(201).json({ activity: rows[0] });
  })
);

// ------------------------------------------------------------- assignment
router.post(
  '/:id/assign',
  requirePermission('leads.write'),
  validate({ params: idParam, body: z.object({ assigned_to: z.string().uuid().nullable() }) }),
  asyncHandler(async (req, res) => {
    const lead = await findOwnedOrFail(db, 'leads', req.params.id, req.institutionId);
    const assignee = req.body.assigned_to;

    if (assignee) {
      const [rows] = await db.execute(
        'SELECT id FROM user_profiles WHERE id = ? AND institution_id = ? AND is_active = 1',
        [assignee, req.institutionId]
      );
      if (rows.length === 0) throw ApiError.badRequest('That user is not an active member of this institution.');
    }

    await db.execute('UPDATE leads SET assigned_to = ? WHERE id = ? AND institution_id = ?', [
      assignee, req.params.id, req.institutionId,
    ]);

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'lead.assigned',
      description: assignee ? `Assigned ${lead.name}` : `Unassigned ${lead.name}`,
      entityType: 'lead',
      entityId: req.params.id,
      metadata: { previous: lead.assigned_to, next: assignee },
    });

    const updated = await findOwnedOrFail(db, 'leads', req.params.id, req.institutionId);
    res.json({ lead: updated });
  })
);

// -------------------------------------------------------------- convert
const convertSchema = z.object({
  program_id: optionalUuid,
  class_applying: optionalText(50),
  intake_year: z.coerce.number().int().min(2000).max(2100).optional(),
  intake_term: optionalText(30),
  parent_name: optionalText(200),
  parent_phone: phone,
  address: longText,
  dob: isoDate,
});

router.post(
  '/:id/convert',
  requirePermission('leads.write', 'admissions.write'),
  validate({ params: idParam, body: convertSchema }),
  asyncHandler(async (req, res) => {
    const institutionId = req.institutionId;
    const body = req.body;

    const applicationNo = await nextSequenceNo(db, {
      table: 'admissions',
      column: 'application_no',
      institutionId,
      prefix: 'APP',
    });

    const outcome = await withTransaction(async (connection) => {
      const [leadRows] = await connection.execute(
        'SELECT * FROM leads WHERE id = ? AND institution_id = ? FOR UPDATE',
        [req.params.id, institutionId]
      );
      const lead = leadRows[0];
      if (!lead) throw ApiError.notFound('Lead not found');
      if (lead.converted_admission_id) {
        throw ApiError.conflict('This lead has already been converted.');
      }

      const admissionId = uuidv4();
      await connection.execute(
        `INSERT INTO admissions
           (id, institution_id, applicant_name, email, phone, dob, class_applying,
            parent_name, parent_phone, address, status, application_no, program_id,
            lead_id, assigned_to, source, intake_year, intake_term)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
        [
          admissionId, institutionId, lead.name, lead.email, lead.phone, body.dob,
          body.class_applying, body.parent_name, body.parent_phone, body.address,
          applicationNo, body.program_id || lead.program_id || null, lead.id,
          lead.assigned_to, lead.referral_partner_id ? 'referral' : lead.source,
          body.intake_year ?? null, body.intake_term,
        ]
      );

      await connection.execute(
        `UPDATE leads
            SET stage = 'won', converted_admission_id = ?, converted_at = NOW(), score = 100
          WHERE id = ?`,
        [admissionId, lead.id]
      );

      await connection.execute(
        `INSERT INTO lead_activities
           (id, institution_id, lead_id, type, subject, body, outcome, performed_by)
         VALUES (?, ?, ?, 'stage_change', ?, ?, 'won', ?)`,
        [
          uuidv4(), institutionId, lead.id,
          `Converted to application ${applicationNo}`, null, req.auth.profile.id,
        ]
      );

      // Keep any originating referral in step with the conversion.
      await connection.execute(
        `UPDATE referrals SET admission_id = ? WHERE lead_id = ? AND admission_id IS NULL`,
        [admissionId, lead.id]
      );

      const [admissionRows] = await connection.execute('SELECT * FROM admissions WHERE id = ?', [admissionId]);
      const [updatedLead] = await connection.execute('SELECT * FROM leads WHERE id = ?', [lead.id]);
      return { admission: admissionRows[0], lead: updatedLead[0] };
    });

    await recordAuditEvent(req, {
      institutionId,
      action: 'lead.converted',
      description: `${outcome.lead.name} converted to application ${applicationNo}`,
      entityType: 'lead',
      entityId: req.params.id,
      severity: 'success',
      metadata: { admission_id: outcome.admission.id, application_no: applicationNo },
    });

    res.status(201).json(outcome);
  })
);

// --------------------------------------------------------------- delete
router.delete(
  '/:id',
  requirePermission('leads.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const lead = await findOwnedOrFail(db, 'leads', req.params.id, req.institutionId);
    if (lead.converted_admission_id) {
      throw ApiError.conflict('A converted lead cannot be deleted — it is linked to an application.');
    }

    await db.execute('DELETE FROM leads WHERE id = ? AND institution_id = ?', [req.params.id, req.institutionId]);
    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'lead.deleted',
      description: `Deleted lead ${lead.name}`,
      entityType: 'lead',
      entityId: req.params.id,
      severity: 'warning',
    });
    res.json({ success: true });
  })
);

export default router;
