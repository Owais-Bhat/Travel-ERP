/**
 * Staff Leave Management — self-service apply, admin approve/reject.
 *
 * Any authenticated staff/teacher/admin can file their own request. Only
 * institution_admin/principal/staff (front-office) can review everyone
 * else's — reusing the same role check pattern admissions.js uses for its
 * status-change gate, rather than adding new granular permission keys.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requireFeature } from '../middleware/feature.js';
import { recordAuditEvent } from '../lib/audit.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { findOwnedOrFail } from '../lib/query.js';
import { z, longText, isoDate, idParam } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('staff_leave'));

const LEAVE_TYPES = ['casual', 'sick', 'earned', 'unpaid', 'other'];
const REVIEWER_ROLES = ['super_admin', 'admin', 'institution_admin', 'principal', 'staff'];

const leaveSchema = z.object({
  leave_type: z.enum(LEAVE_TYPES).default('casual'),
  start_date: isoDate,
  end_date: isoDate,
  reason: longText,
}).refine((body) => body.start_date && body.end_date, {
  message: 'start_date and end_date are required',
});

function isReviewer(role) {
  return REVIEWER_ROLES.includes(role);
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const role = req.auth.profile.role;
    const mine = req.query.mine === 'true' || !isReviewer(role);

    const [rows] = await db.execute(
      mine
        ? `SELECT l.*, p.first_name, p.last_name, p.role
             FROM leave_requests l
             JOIN user_profiles p ON p.id = l.profile_id
            WHERE l.institution_id = ? AND l.profile_id = ?
            ORDER BY l.created_at DESC`
        : `SELECT l.*, p.first_name, p.last_name, p.role
             FROM leave_requests l
             JOIN user_profiles p ON p.id = l.profile_id
            WHERE l.institution_id = ?
            ORDER BY l.created_at DESC`,
      mine ? [req.institutionId, req.auth.profile.id] : [req.institutionId]
    );
    res.json(rows);
  })
);

router.post(
  '/',
  validate({ body: leaveSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (new Date(body.end_date) < new Date(body.start_date)) {
      throw ApiError.badRequest('end_date cannot be before start_date');
    }

    const id = uuidv4();
    await db.execute(
      `INSERT INTO leave_requests (id, institution_id, profile_id, leave_type, start_date, end_date, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [id, req.institutionId, req.auth.profile.id, body.leave_type, body.start_date, body.end_date, body.reason]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'leave.requested',
      description: `${body.leave_type} leave requested (${body.start_date} to ${body.end_date})`,
      entityType: 'leave_request',
      entityId: id,
      severity: 'info',
    });

    const created = await findOwnedOrFail(db, 'leave_requests', id, req.institutionId);
    res.status(201).json(created);
  })
);

router.patch(
  '/:id/review',
  validate({ params: idParam, body: z.object({ status: z.enum(['approved', 'rejected']), review_note: longText }) }),
  asyncHandler(async (req, res) => {
    if (!isReviewer(req.auth.profile.role)) {
      throw ApiError.forbidden('Only institution admins or front-office staff can review leave requests.');
    }

    const existing = await findOwnedOrFail(db, 'leave_requests', req.params.id, req.institutionId);
    if (existing.status !== 'pending') {
      throw ApiError.conflict('This request has already been reviewed.');
    }

    await db.execute(
      `UPDATE leave_requests SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_note = ?
        WHERE id = ? AND institution_id = ?`,
      [req.body.status, req.auth.profile.id, req.body.review_note, req.params.id, req.institutionId]
    );

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: `leave.${req.body.status}`,
      description: `Leave request ${req.body.status}`,
      entityType: 'leave_request',
      entityId: req.params.id,
      severity: req.body.status === 'approved' ? 'success' : 'warning',
    });

    const updated = await findOwnedOrFail(db, 'leave_requests', req.params.id, req.institutionId);
    res.json(updated);
  })
);

router.delete(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const existing = await findOwnedOrFail(db, 'leave_requests', req.params.id, req.institutionId);
    if (existing.profile_id !== req.auth.profile.id && !isReviewer(req.auth.profile.role)) {
      throw ApiError.forbidden('You can only withdraw your own leave request.');
    }
    if (existing.status !== 'pending') {
      throw ApiError.conflict('Only a pending request can be withdrawn.');
    }
    await db.execute('DELETE FROM leave_requests WHERE id = ? AND institution_id = ?', [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

export default router;
