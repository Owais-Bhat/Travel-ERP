/**
 * Multi-Branch/Campus Management.
 *
 * Scope note: a branch is a full institutions row (parent_institution_id
 * pointing back at the parent), so every existing tenant-scoped table
 * already isolates its data automatically — no changes needed anywhere
 * else. What this route gives a parent's institution_admin is a central
 * registry: see the branches under your institution, add a new one, pull
 * quick headcounts. It does NOT provide a login/operate-as-branch flow
 * (a branch has no admin user of its own yet) — that's a bigger feature
 * (separate branch admin accounts, cross-branch reporting) left for a
 * later pass if the user asks for it.
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
import { z, optionalText, requiredEmail, phone } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('multi_branch'));

const branchSchema = z.object({
  name: z.string().trim().min(1).max(255),
  address: optionalText(500),
  phone,
  email: requiredEmail,
});

router.get(
  '/',
  requirePermission('institution.manage'),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT b.id, b.name, b.address, b.phone, b.email, b.subscription_plan, b.subscription_status, b.created_at,
              (SELECT COUNT(*) FROM students st WHERE st.institution_id = b.id) AS student_count,
              (SELECT COUNT(*) FROM teachers t WHERE t.institution_id = b.id) AS teacher_count
         FROM institutions b
        WHERE b.parent_institution_id = ?
        ORDER BY b.created_at DESC`,
      [req.institutionId]
    );
    res.json(rows);
  })
);

router.post(
  '/',
  requirePermission('institution.manage'),
  validate({ body: branchSchema }),
  asyncHandler(async (req, res) => {
    const [[parent]] = await db.execute('SELECT subscription_plan, settings FROM institutions WHERE id = ?', [req.institutionId]);
    if (!parent) throw ApiError.notFound('Parent institution not found');

    const body = req.body;
    const id = uuidv4();
    await db.execute(
      `INSERT INTO institutions (id, parent_institution_id, name, address, phone, email, subscription_plan, subscription_status, settings)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [id, req.institutionId, body.name, body.address, body.phone, body.email.toLowerCase(), parent.subscription_plan, JSON.stringify({ modules: {}, suspended: false })]
    );

    const [[created]] = await db.execute('SELECT id, name, address, phone, email, subscription_plan, subscription_status, created_at FROM institutions WHERE id = ?', [id]);
    res.status(201).json(created);
  })
);

// No hard-delete route: nothing in this codebase hard-deletes an
// institutions row (even the super-admin console only suspends one), so a
// branch — which is just another institutions row — follows the same rule.

export default router;
