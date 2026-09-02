/**
 * Cross-module reporting.
 *
 * One overview endpoint for the executive dashboard plus per-domain reports
 * that can be exported to CSV. Every query is tenant-scoped and read-only.
 */
import express from 'express';
import db from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requireFeature } from '../middleware/feature.js';
import { requirePermission } from '../auth/permissions.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { z } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('reports'));
router.use(requirePermission('reports.read'));

const rangeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).passthrough();

/** Default to the trailing 12 months when no explicit range is given. */
function resolveRange(query) {
  const to = query.to || new Date().toISOString().slice(0, 10);
  const from = query.from
    || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (from > to) throw ApiError.badRequest('"from" must not be after "to".');
  return { from, to };
}

/** Serialise rows to CSV, quoting anything that needs it. */
function toCsv(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ].join('\n');
}

function sendCsv(res, filename, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // Byte-order mark so Excel opens UTF-8 correctly.
  res.send(`﻿${toCsv(rows)}`);
}

// ==================================================================
// Executive overview
// ==================================================================
router.get(
  '/overview',
  validate({ query: rangeQuery }),
  asyncHandler(async (req, res) => {
    const institutionId = req.institutionId;
    const { from, to } = resolveRange(req.query);

    const [
      [[students]],
      [[admissions]],
      [[leads]],
      [[scholarships]],
      [[referrals]],
      [[fees]],
      [[programs]],
      [[certifications]],
    ] = await Promise.all([
      db.execute(
        `SELECT COUNT(*) AS total, SUM(status = 'active') AS active FROM students WHERE institution_id = ?`,
        [institutionId]
      ),
      db.execute(
        `SELECT COUNT(*) AS total,
                SUM(status = 'pending')  AS pending,
                SUM(status = 'approved') AS approved,
                SUM(status = 'rejected') AS rejected
           FROM admissions WHERE institution_id = ? AND DATE(applied_at) BETWEEN ? AND ?`,
        [institutionId, from, to]
      ),
      db.execute(
        `SELECT COUNT(*) AS total, SUM(stage = 'won') AS won, COALESCE(SUM(budget), 0) AS pipeline_value
           FROM leads WHERE institution_id = ? AND DATE(created_at) BETWEEN ? AND ?`,
        [institutionId, from, to]
      ),
      db.execute(
        `SELECT COUNT(*) AS applications,
                SUM(status = 'approved')  AS approved,
                SUM(status = 'disbursed') AS disbursed,
                COALESCE(SUM(awarded_amount), 0) AS awarded_total
           FROM scholarship_applications WHERE institution_id = ? AND DATE(created_at) BETWEEN ? AND ?`,
        [institutionId, from, to]
      ),
      db.execute(
        `SELECT COUNT(*) AS total, SUM(status = 'converted') AS converted
           FROM referrals WHERE institution_id = ? AND DATE(created_at) BETWEEN ? AND ?`,
        [institutionId, from, to]
      ),
      db.execute(
        `SELECT COALESCE(SUM(paid_amount), 0)  AS collected,
                COALESCE(SUM(total_amount), 0) AS billed,
                COUNT(*)                       AS payments
           FROM fee_payments
          WHERE institution_id = ? AND DATE(COALESCE(payment_date, created_at)) BETWEEN ? AND ?`,
        [institutionId, from, to]
      ),
      db.execute(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(seats_total), 0)  AS seats_total,
                COALESCE(SUM(seats_filled), 0) AS seats_filled
           FROM programs WHERE institution_id = ?`,
        [institutionId]
      ),
      db.execute(
        `SELECT COUNT(*) AS total FROM certifications WHERE institution_id = ? AND DATE(created_at) BETWEEN ? AND ?`,
        [institutionId, from, to]
      ),
    ]);

    const admissionTotal = Number(admissions.total) || 0;
    const leadTotal = Number(leads.total) || 0;
    const seatsTotal = Number(programs.seats_total) || 0;

    res.json({
      range: { from, to },
      students,
      admissions: {
        ...admissions,
        approval_rate: admissionTotal > 0
          ? Number(((Number(admissions.approved) / admissionTotal) * 100).toFixed(1)) : 0,
      },
      leads: {
        ...leads,
        conversion_rate: leadTotal > 0
          ? Number(((Number(leads.won) / leadTotal) * 100).toFixed(1)) : 0,
      },
      scholarships,
      referrals,
      fees,
      programs: {
        ...programs,
        fill_rate: seatsTotal > 0
          ? Number(((Number(programs.seats_filled) / seatsTotal) * 100).toFixed(1)) : 0,
      },
      certifications,
    });
  })
);

// ==================================================================
// Trends — monthly series for charts
// ==================================================================
router.get(
  '/trends',
  validate({ query: rangeQuery.extend({ metric: z.enum(['admissions', 'leads', 'fees', 'scholarships']).default('admissions') }) }),
  asyncHandler(async (req, res) => {
    const { from, to } = resolveRange(req.query);
    const institutionId = req.institutionId;

    const sources = {
      admissions: {
        table: 'admissions',
        dateColumn: 'applied_at',
        extra: `SUM(status = 'approved') AS approved, SUM(status = 'rejected') AS rejected`,
      },
      leads: {
        table: 'leads',
        dateColumn: 'created_at',
        extra: `SUM(stage = 'won') AS won, SUM(stage = 'lost') AS lost`,
      },
      fees: {
        table: 'fee_payments',
        dateColumn: 'COALESCE(payment_date, created_at)',
        extra: `COALESCE(SUM(paid_amount), 0) AS amount, COALESCE(SUM(total_amount), 0) AS billed`,
      },
      scholarships: {
        table: 'scholarship_applications',
        dateColumn: 'created_at',
        extra: `COALESCE(SUM(awarded_amount), 0) AS awarded, SUM(status = 'approved') AS approved`,
      },
    };

    // `metric` is constrained by the enum above, so the table name is safe.
    const source = sources[req.query.metric];
    const [rows] = await db.execute(
      `SELECT DATE_FORMAT(${source.dateColumn}, '%Y-%m') AS month,
              COUNT(*) AS total,
              ${source.extra}
         FROM ${source.table}
        WHERE institution_id = ? AND DATE(${source.dateColumn}) BETWEEN ? AND ?
        GROUP BY month
        ORDER BY month`,
      [institutionId, from, to]
    );

    res.json({ metric: req.query.metric, range: { from, to }, series: rows });
  })
);

// ==================================================================
// Detailed reports (JSON, or CSV with ?format=csv)
// ==================================================================
const REPORTS = {
  admissions: {
    filename: 'admissions.csv',
    sql: `SELECT a.application_no, a.applicant_name, a.email, a.phone, a.status,
                 a.source, a.intake_year, a.intake_term, p.name AS program,
                 a.documents_verified, a.applied_at
            FROM admissions a
            LEFT JOIN programs p ON p.id = a.program_id
           WHERE a.institution_id = ? AND DATE(a.applied_at) BETWEEN ? AND ?
           ORDER BY a.applied_at DESC`,
  },
  leads: {
    filename: 'leads.csv',
    sql: `SELECT l.name, l.email, l.phone, l.city, l.source, l.stage, l.score,
                 l.budget, p.name AS program, l.next_follow_up_at, l.created_at
            FROM leads l
            LEFT JOIN programs p ON p.id = l.program_id
           WHERE l.institution_id = ? AND DATE(l.created_at) BETWEEN ? AND ?
           ORDER BY l.created_at DESC`,
  },
  scholarships: {
    filename: 'scholarships.csv',
    sql: `SELECT a.application_no, a.applicant_name, s.name AS scheme, s.type,
                 a.academic_percentage, a.family_income, a.eligibility_score,
                 a.status, a.awarded_amount, a.created_at
            FROM scholarship_applications a
            JOIN scholarship_schemes s ON s.id = a.scheme_id
           WHERE a.institution_id = ? AND DATE(a.created_at) BETWEEN ? AND ?
           ORDER BY a.created_at DESC`,
  },
  commissions: {
    filename: 'commissions.csv',
    sql: `SELECT p.name AS partner, p.referral_code, r.referee_name,
                 c.base_amount, c.rate, c.amount, c.status, i.invoice_no, c.created_at
            FROM commissions c
            JOIN referral_partners p ON p.id = c.partner_id
            LEFT JOIN referrals r ON r.id = c.referral_id
            LEFT JOIN commission_invoices i ON i.id = c.invoice_id
           WHERE c.institution_id = ? AND DATE(c.created_at) BETWEEN ? AND ?
           ORDER BY c.created_at DESC`,
  },
  students: {
    filename: 'students.csv',
    sql: `SELECT admission_no, first_name, last_name, email, phone, class_name,
                 section, gender, status, parent_name, parent_phone, created_at
            FROM students
           WHERE institution_id = ? AND DATE(created_at) BETWEEN ? AND ?
           ORDER BY created_at DESC`,
  },
  certifications: {
    filename: 'certifications.csv',
    sql: `SELECT c.certificate_no, c.title, c.grade, c.status, c.verification_code,
                 CONCAT_WS(' ', s.first_name, s.last_name) AS student,
                 p.name AS program, c.issued_on, c.expires_on
            FROM certifications c
            LEFT JOIN students s ON s.id = c.student_id
            LEFT JOIN programs p ON p.id = c.program_id
           WHERE c.institution_id = ? AND DATE(c.created_at) BETWEEN ? AND ?
           ORDER BY c.created_at DESC`,
  },
};

router.get(
  '/:report',
  validate({
    params: z.object({ report: z.enum(Object.keys(REPORTS)) }),
    query: rangeQuery.extend({ format: z.enum(['json', 'csv']).default('json') }),
  }),
  asyncHandler(async (req, res) => {
    const { from, to } = resolveRange(req.query);
    const definition = REPORTS[req.params.report];

    const [rows] = await db.execute(definition.sql, [req.institutionId, from, to]);

    if (req.query.format === 'csv') {
      return sendCsv(res, definition.filename, rows);
    }
    return res.json({ report: req.params.report, range: { from, to }, rows });
  })
);

export default router;
