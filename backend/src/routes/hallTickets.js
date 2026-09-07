/**
 * Hall Ticket / Admit Card — printable exam eligibility slip. Generation
 * itself is the enforcement point: a student with pending fees gets a 403
 * instead of a ticket, no separate override.
 */
import express from 'express';
import db from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requireFeature } from '../middleware/feature.js';
import { requirePermission } from '../auth/permissions.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { findOwnedOrFail } from '../lib/query.js';
import { z } from '../validation/common.js';
import { getFeeClearance } from '../lib/feeClearance.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('hall_tickets'));

router.get(
  '/:examId/:studentId',
  requirePermission('exams.read'),
  validate({ params: z.object({ examId: z.string().uuid(), studentId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const exam = await findOwnedOrFail(db, 'exams', req.params.examId, req.institutionId);
    const student = await findOwnedOrFail(db, 'students', req.params.studentId, req.institutionId);

    const clearance = await getFeeClearance(db, req.institutionId, student.id);
    if (!clearance.cleared) {
      throw ApiError.forbidden(
        `Hall ticket blocked: ${clearance.pending_count} pending fee payment(s) totalling ${clearance.pending_amount}.`,
        { code: 'fee_not_cleared', details: clearance }
      );
    }

    res.json({ exam, student, clearance });
  })
);

export default router;
