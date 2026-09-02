/**
 * Document vault — student/applicant documents and institution verification
 * evidence. Handles upload, listing, verification and deletion.
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import db from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requireFeature } from '../middleware/feature.js';
import { requirePermission } from '../auth/permissions.js';
import { recordAuditEvent } from '../lib/audit.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { upload, publicUrlFor, removeStoredFile, uploadErrorHandler, uploadsRoot } from '../lib/uploads.js';
import { parsePagination, parseSort, buildWhere, paginatedQuery } from '../lib/query.js';
import { z, optionalText, longText, listQuery, idParam } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('documents'));

const STUDENT_DOC_TYPES = [
  'photo', 'id_proof', 'address_proof', 'birth_certificate', 'transfer_certificate',
  'marksheet', 'degree', 'income_certificate', 'caste_certificate', 'medical', 'other',
];
const INSTITUTION_DOC_TYPES = [
  'registration', 'accreditation', 'affiliation', 'tax', 'address_proof', 'authorised_signatory', 'other',
];
const DOC_STATUSES = ['pending', 'verified', 'rejected'];

// ==================================================================
// Student / applicant documents
// ==================================================================
router.get(
  '/students',
  requirePermission('documents.read'),
  validate({
    query: listQuery.extend({
      studentId: z.string().uuid().optional(),
      admissionId: z.string().uuid().optional(),
      status: z.enum(DOC_STATUSES).optional(),
      docType: z.string().max(60).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const sort = parseSort(req.query, ['created_at', 'name', 'status', 'doc_type'], 'created_at');

    const { clause, params } = buildWhere({
      alias: 'd',
      equals: {
        institution_id: req.institutionId,
        student_id: req.query.studentId,
        admission_id: req.query.admissionId,
        status: req.query.status,
        doc_type: req.query.docType,
      },
      search: req.query.search,
      searchColumns: ['name'],
    });

    const result = await paginatedQuery(db, {
      select: `d.*, CONCAT_WS(' ', s.first_name, s.last_name) AS student_name,
               a.applicant_name`,
      from: `student_documents d
             LEFT JOIN students s ON s.id = d.student_id
             LEFT JOIN admissions a ON a.id = d.admission_id`,
      where: clause,
      params,
      orderBy: `d.${sort.sql}`,
      page,
      pageSize,
      offset,
    });

    res.json(result);
  })
);

const studentUploadSchema = z.object({
  student_id: z.string().uuid().optional(),
  admission_id: z.string().uuid().optional(),
  doc_type: z.enum(STUDENT_DOC_TYPES),
  name: optionalText(255),
  notes: longText,
}).refine((value) => value.student_id || value.admission_id, {
  message: 'Either student_id or admission_id is required',
});

router.post(
  '/students',
  requirePermission('documents.write'),
  upload.single('file'),
  uploadErrorHandler,
  validate({ body: studentUploadSchema }),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No file uploaded. Send it as multipart/form-data field "file".');

    const body = req.body;
    const id = uuidv4();

    try {
      // Verify the owner belongs to this tenant before storing the reference.
      if (body.student_id) {
        const [rows] = await db.execute(
          'SELECT id FROM students WHERE id = ? AND institution_id = ?',
          [body.student_id, req.institutionId]
        );
        if (rows.length === 0) throw ApiError.notFound('Student not found in this institution');
      }
      if (body.admission_id) {
        const [rows] = await db.execute(
          'SELECT id FROM admissions WHERE id = ? AND institution_id = ?',
          [body.admission_id, req.institutionId]
        );
        if (rows.length === 0) throw ApiError.notFound('Application not found in this institution');
      }

      await db.execute(
        `INSERT INTO student_documents
           (id, institution_id, student_id, admission_id, doc_type, name, file_url,
            mime_type, size_bytes, notes, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, req.institutionId, body.student_id || null, body.admission_id || null,
          body.doc_type, body.name || req.file.originalname,
          publicUrlFor(req.file, req.institutionId), req.file.mimetype, req.file.size,
          body.notes || null, req.auth.profile.id,
        ]
      );
    } catch (error) {
      // Do not leave an orphaned file behind when the row could not be written.
      await removeStoredFile(req.file);
      throw error;
    }

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'document.uploaded',
      description: `Uploaded ${body.doc_type} document`,
      entityType: 'student_document',
      entityId: id,
    });

    const [rows] = await db.execute('SELECT * FROM student_documents WHERE id = ?', [id]);
    res.status(201).json({ document: rows[0] });
  })
);

router.post(
  '/students/:id/verify',
  requirePermission('documents.verify'),
  validate({ params: idParam, body: z.object({ status: z.enum(DOC_STATUSES), notes: longText }) }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      'SELECT * FROM student_documents WHERE id = ? AND institution_id = ?',
      [req.params.id, req.institutionId]
    );
    const document = rows[0];
    if (!document) throw ApiError.notFound('Document not found');

    await db.execute(
      `UPDATE student_documents
          SET status = ?, notes = COALESCE(?, notes), verified_by = ?, verified_at = NOW()
        WHERE id = ?`,
      [req.body.status, req.body.notes || null, req.auth.profile.id, req.params.id]
    );

    // An application counts as document-verified once nothing is left pending
    // or rejected against it.
    if (document.admission_id) {
      const [[pending]] = await db.execute(
        `SELECT COUNT(*) AS outstanding FROM student_documents
          WHERE admission_id = ? AND status <> 'verified'`,
        [document.admission_id]
      );
      await db.execute(
        'UPDATE admissions SET documents_verified = ? WHERE id = ? AND institution_id = ?',
        [Number(pending.outstanding) === 0 ? 1 : 0, document.admission_id, req.institutionId]
      );
    }

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'document.reviewed',
      description: `Marked "${document.name}" as ${req.body.status}`,
      entityType: 'student_document',
      entityId: req.params.id,
      severity: req.body.status === 'rejected' ? 'warning' : 'success',
    });

    const [updated] = await db.execute('SELECT * FROM student_documents WHERE id = ?', [req.params.id]);
    res.json({ document: updated[0] });
  })
);

router.delete(
  '/students/:id',
  requirePermission('documents.verify'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      'SELECT * FROM student_documents WHERE id = ? AND institution_id = ?',
      [req.params.id, req.institutionId]
    );
    const document = rows[0];
    if (!document) throw ApiError.notFound('Document not found');

    await db.execute('DELETE FROM student_documents WHERE id = ?', [req.params.id]);
    await deleteStoredFileFor(document.file_url, req.institutionId);

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'document.deleted',
      description: `Deleted "${document.name}"`,
      entityType: 'student_document',
      entityId: req.params.id,
      severity: 'warning',
    });

    res.json({ success: true });
  })
);

// ==================================================================
// Institution verification documents
// ==================================================================
router.get(
  '/institution',
  requirePermission('institution.manage'),
  asyncHandler(async (req, res) => {
    const [documents] = await db.execute(
      'SELECT * FROM institution_documents WHERE institution_id = ? ORDER BY created_at DESC',
      [req.institutionId]
    );
    const [rows] = await db.execute(
      'SELECT verification_status, verification_notes, verified_at, is_published FROM institutions WHERE id = ?',
      [req.institutionId]
    );
    res.json({ documents, verification: rows[0] || null });
  })
);

router.post(
  '/institution',
  requirePermission('institution.manage'),
  upload.single('file'),
  uploadErrorHandler,
  validate({
    body: z.object({
      doc_type: z.enum(INSTITUTION_DOC_TYPES),
      name: optionalText(255),
      notes: longText,
    }),
  }),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No file uploaded. Send it as multipart/form-data field "file".');

    const id = uuidv4();
    try {
      await db.execute(
        `INSERT INTO institution_documents
           (id, institution_id, doc_type, name, file_url, mime_type, size_bytes, notes, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, req.institutionId, req.body.doc_type, req.body.name || req.file.originalname,
          publicUrlFor(req.file, req.institutionId), req.file.mimetype, req.file.size,
          req.body.notes || null, req.auth.profile.id,
        ]
      );

      // Submitting evidence moves a pending institution into the review queue.
      await db.execute(
        `UPDATE institutions SET verification_status = 'under_review'
          WHERE id = ? AND verification_status = 'pending'`,
        [req.institutionId]
      );
    } catch (error) {
      await removeStoredFile(req.file);
      throw error;
    }

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'institution_document.uploaded',
      description: `Submitted ${req.body.doc_type} for verification`,
      entityType: 'institution_document',
      entityId: id,
    });

    const [rows] = await db.execute('SELECT * FROM institution_documents WHERE id = ?', [id]);
    res.status(201).json({ document: rows[0] });
  })
);

/**
 * Remove a stored upload, refusing anything that resolves outside the
 * tenant's own upload directory.
 */
async function deleteStoredFileFor(fileUrl, institutionId) {
  if (!fileUrl) return;
  const filename = path.basename(fileUrl);
  const tenant = String(institutionId).replace(/[^a-zA-Z0-9-]/g, '');
  const target = path.resolve(uploadsRoot, tenant, filename);
  const tenantDir = path.resolve(uploadsRoot, tenant);

  if (!target.startsWith(tenantDir + path.sep)) return;
  try {
    await fs.promises.unlink(target);
  } catch {
    // Already gone.
  }
}

export default router;
