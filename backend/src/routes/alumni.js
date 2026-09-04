/**
 * Alumni Network — a simple directory of pass-out students.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requireFeature } from '../middleware/feature.js';
import { requirePermission } from '../auth/permissions.js';
import { asyncHandler } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { parsePagination, buildWhere, paginatedQuery, findOwnedOrFail, buildUpdate } from '../lib/query.js';
import { z, optionalText, email, phone, idParam, listQuery, partialUpdate } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('alumni'));

const UPDATABLE = ['first_name', 'last_name', 'batch_year', 'class_name', 'email', 'phone', 'occupation', 'company', 'linkedin_url', 'notes'];

const alumniSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: optionalText(100),
  batch_year: z.coerce.number().int().min(1950).max(2100).nullable().optional(),
  class_name: optionalText(50),
  email,
  phone,
  occupation: optionalText(200),
  company: optionalText(200),
  linkedin_url: optionalText(500),
  notes: optionalText(2000),
});

router.get(
  '/',
  requirePermission('students.read'),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const { clause, params } = buildWhere({
      equals: { institution_id: req.institutionId },
      search: req.query.search,
      searchColumns: ['first_name', 'last_name', 'company', 'occupation'],
    });

    const result = await paginatedQuery(db, {
      select: '*',
      from: '`alumni`',
      where: clause,
      params,
      orderBy: '`batch_year` DESC, `first_name` ASC',
      page, pageSize, offset,
    });
    res.json(result);
  })
);

router.post(
  '/',
  requirePermission('students.write'),
  validate({ body: alumniSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const id = uuidv4();
    await db.execute(
      `INSERT INTO alumni (id, institution_id, first_name, last_name, batch_year, class_name, email, phone, occupation, company, linkedin_url, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.institutionId, body.first_name, body.last_name, body.batch_year ?? null, body.class_name, body.email, body.phone, body.occupation, body.company, body.linkedin_url, body.notes]
    );
    const created = await findOwnedOrFail(db, 'alumni', id, req.institutionId);
    res.status(201).json(created);
  })
);

router.put(
  '/:id',
  requirePermission('students.write'),
  validate({ params: idParam, body: partialUpdate(alumniSchema) }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'alumni', req.params.id, req.institutionId);
    const update = buildUpdate(req.body, UPDATABLE);
    if (update) {
      await db.execute(
        `UPDATE alumni SET ${update.sql} WHERE id = ? AND institution_id = ?`,
        [...update.params, req.params.id, req.institutionId]
      );
    }
    const updated = await findOwnedOrFail(db, 'alumni', req.params.id, req.institutionId);
    res.json(updated);
  })
);

router.delete(
  '/:id',
  requirePermission('students.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'alumni', req.params.id, req.institutionId);
    await db.execute('DELETE FROM alumni WHERE id = ? AND institution_id = ?', [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

export default router;
