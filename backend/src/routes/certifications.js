/**
 * Certifications — issuing, revoking and publicly verifying credentials.
 *
 * `GET /api/certifications/verify/:code` is deliberately unauthenticated:
 * a certificate is only useful if an employer can check it without an
 * account. It returns the minimum needed to confirm authenticity.
 */
import express from 'express';
import crypto from 'node:crypto';
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
import { z, optionalText, isoDate, listQuery, idParam, optionalUuid, partialUpdate } from '../validation/common.js';

const router = express.Router();

const STATUSES = ['issued', 'revoked', 'expired'];

/** 12-char code, unambiguous when read off a printed certificate. */
function generateVerificationCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(12);
  const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

// ------------------------------------------------------ public verification
router.get(
  '/verify/:code',
  validate({ params: z.object({ code: z.string().trim().min(6).max(60) }) }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT c.title, c.certificate_no, c.grade, c.issued_on, c.expires_on, c.status,
              c.verification_code,
              CONCAT_WS(' ', s.first_name, s.last_name) AS student_name,
              p.name AS program_name,
              i.name AS institution_name, i.verification_status AS institution_verification
         FROM certifications c
         LEFT JOIN students s     ON s.id = c.student_id
         LEFT JOIN programs p     ON p.id = c.program_id
         JOIN institutions i      ON i.id = c.institution_id
        WHERE c.verification_code = ?
        LIMIT 1`,
      [req.params.code.trim().toUpperCase()]
    );

    const certificate = rows[0];
    if (!certificate) {
      // Same shape either way so the endpoint cannot be used to enumerate codes.
      return res.status(404).json({ valid: false, reason: 'No certificate matches that code.' });
    }

    const expired = certificate.expires_on && certificate.expires_on < new Date().toISOString().slice(0, 10);
    return res.json({
      valid: certificate.status === 'issued' && !expired,
      status: expired && certificate.status === 'issued' ? 'expired' : certificate.status,
      certificate,
    });
  })
);

// Everything below requires a session.
router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('certifications'));

const certificationSchema = z.object({
  student_id: optionalUuid,
  program_id: optionalUuid,
  title: z.string().trim().min(1).max(255),
  certificate_no: optionalText(80),
  grade: optionalText(20),
  issued_on: isoDate,
  expires_on: isoDate,
  file_url: optionalText(500),
});

const UPDATABLE = ['title', 'certificate_no', 'grade', 'issued_on', 'expires_on', 'file_url', 'program_id', 'status'];

router.get(
  '/',
  requirePermission('certifications.read'),
  validate({
    query: listQuery.extend({
      status: z.enum(STATUSES).optional(),
      studentId: z.string().uuid().optional(),
      programId: z.string().uuid().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const sort = parseSort(req.query, ['created_at', 'issued_on', 'title', 'status'], 'created_at');

    const { clause, params } = buildWhere({
      alias: 'c',
      equals: {
        institution_id: req.institutionId,
        status: req.query.status,
        student_id: req.query.studentId,
        program_id: req.query.programId,
      },
      search: req.query.search,
      searchColumns: ['title', 'certificate_no', 'verification_code'],
    });

    const result = await paginatedQuery(db, {
      select: `c.*, CONCAT_WS(' ', s.first_name, s.last_name) AS student_name, p.name AS program_name`,
      from: `certifications c
             LEFT JOIN students s ON s.id = c.student_id
             LEFT JOIN programs p ON p.id = c.program_id`,
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
  '/',
  requirePermission('certifications.write'),
  validate({ body: certificationSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;

    if (body.student_id) {
      const [rows] = await db.execute(
        'SELECT id FROM students WHERE id = ? AND institution_id = ?',
        [body.student_id, req.institutionId]
      );
      if (rows.length === 0) throw ApiError.notFound('Student not found in this institution');
    }

    const id = uuidv4();
    const certificateNo = body.certificate_no || await nextSequenceNo(db, {
      table: 'certifications',
      column: 'certificate_no',
      institutionId: req.institutionId,
      prefix: 'CERT',
    });

    // Retry on the (astronomically unlikely) code collision.
    let verificationCode = generateVerificationCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const [existing] = await db.execute(
        'SELECT id FROM certifications WHERE verification_code = ?',
        [verificationCode]
      );
      if (existing.length === 0) break;
      verificationCode = generateVerificationCode();
    }

    await db.execute(
      `INSERT INTO certifications
         (id, institution_id, student_id, program_id, title, certificate_no, grade,
          issued_on, expires_on, file_url, issued_by, verification_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURDATE()), ?, ?, ?, ?)`,
      [
        id, req.institutionId, body.student_id || null, body.program_id || null,
        body.title, certificateNo, body.grade, body.issued_on, body.expires_on,
        body.file_url, req.auth.profile.id, verificationCode,
      ]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'certification.issued',
      description: `Issued "${body.title}" (${certificateNo})`,
      entityType: 'certification',
      entityId: id,
      severity: 'success',
    });

    const certification = await findOwnedOrFail(db, 'certifications', id, req.institutionId);
    res.status(201).json({ certification });
  })
);

router.put(
  '/:id',
  requirePermission('certifications.write'),
  validate({ params: idParam, body: partialUpdate(certificationSchema).extend({ status: z.enum(STATUSES).optional() }) }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'certifications', req.params.id, req.institutionId);
    const update = buildUpdate(req.body, UPDATABLE);
    if (!update) throw ApiError.badRequest('No updatable fields provided');

    await db.execute(
      `UPDATE certifications SET ${update.sql} WHERE id = ? AND institution_id = ?`,
      [...update.params, req.params.id, req.institutionId]
    );

    const certification = await findOwnedOrFail(db, 'certifications', req.params.id, req.institutionId);
    res.json({ certification });
  })
);

router.post(
  '/:id/revoke',
  requirePermission('certifications.write'),
  validate({ params: idParam, body: z.object({ reason: optionalText(500) }) }),
  asyncHandler(async (req, res) => {
    const certification = await findOwnedOrFail(db, 'certifications', req.params.id, req.institutionId);
    if (certification.status === 'revoked') throw ApiError.conflict('This certificate is already revoked.');

    await db.execute(
      `UPDATE certifications SET status = 'revoked' WHERE id = ? AND institution_id = ?`,
      [req.params.id, req.institutionId]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'certification.revoked',
      description: `Revoked "${certification.title}" (${certification.certificate_no})`,
      entityType: 'certification',
      entityId: req.params.id,
      severity: 'warning',
      metadata: { reason: req.body.reason || null },
    });

    const updated = await findOwnedOrFail(db, 'certifications', req.params.id, req.institutionId);
    res.json({ certification: updated });
  })
);

router.get(
  '/summary',
  requirePermission('certifications.read'),
  asyncHandler(async (req, res) => {
    const [[totals]] = await db.execute(
      `SELECT COUNT(*) AS total,
              SUM(status = 'issued')  AS issued,
              SUM(status = 'revoked') AS revoked,
              SUM(expires_on IS NOT NULL AND expires_on < CURDATE()) AS expired
         FROM certifications WHERE institution_id = ?`,
      [req.institutionId]
    );

    const [byProgram] = await db.execute(
      `SELECT COALESCE(p.name, 'Unassigned') AS program_name, COUNT(*) AS total
         FROM certifications c
         LEFT JOIN programs p ON p.id = c.program_id
        WHERE c.institution_id = ?
        GROUP BY p.name ORDER BY total DESC LIMIT 10`,
      [req.institutionId]
    );

    res.json({ totals, byProgram });
  })
);

export default router;
