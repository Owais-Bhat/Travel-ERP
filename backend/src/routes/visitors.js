/**
 * Visitor & Gate Pass Management — front-desk check-in/check-out log.
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
import { z, optionalText, idParam, phone } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('visitor_management'));

const visitorSchema = z.object({
  visitor_name: z.string().trim().min(1).max(200),
  phone,
  purpose: optionalText(255),
  whom_to_meet: optionalText(200),
});

router.get(
  '/',
  requirePermission('students.read'),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT * FROM visitors WHERE institution_id = ? ORDER BY check_in DESC LIMIT 200`,
      [req.institutionId]
    );
    res.json(rows);
  })
);

router.post(
  '/',
  requirePermission('students.write'),
  validate({ body: visitorSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const id = uuidv4();
    await db.execute(
      `INSERT INTO visitors (id, institution_id, visitor_name, phone, purpose, whom_to_meet, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'checked_in', ?)`,
      [id, req.institutionId, body.visitor_name, body.phone, body.purpose, body.whom_to_meet, req.auth.profile.id]
    );
    const created = await findOwnedOrFail(db, 'visitors', id, req.institutionId);
    res.status(201).json(created);
  })
);

router.patch(
  '/:id/check-out',
  requirePermission('students.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const existing = await findOwnedOrFail(db, 'visitors', req.params.id, req.institutionId);
    if (existing.status === 'checked_out') throw ApiError.conflict('Visitor already checked out.');

    await db.execute(
      `UPDATE visitors SET status = 'checked_out', check_out = NOW() WHERE id = ? AND institution_id = ?`,
      [req.params.id, req.institutionId]
    );
    const updated = await findOwnedOrFail(db, 'visitors', req.params.id, req.institutionId);
    res.json(updated);
  })
);

export default router;
