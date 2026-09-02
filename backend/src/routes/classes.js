import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requirePermission } from '../auth/permissions.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { findOwnedOrFail, buildUpdate } from '../lib/query.js';
import { z, optionalText, idParam, optionalUuid, partialUpdate } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);

const UPDATABLE = ['name', 'section', 'teacher_id', 'capacity'];

const classSchema = z.object({
  name: z.string().trim().min(1).max(100),
  section: optionalText(20),
  teacher_id: optionalUuid,
  capacity: z.coerce.number().int().min(0).max(10000).nullable().optional(),
});

router.get(
  '/',
  requirePermission('students.read', 'programs.read', 'attendance.read'),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT c.*, CONCAT_WS(' ', t.first_name, t.last_name) AS teacher_name,
              (SELECT COUNT(*) FROM students s
                WHERE s.institution_id = c.institution_id
                  AND s.class_name = c.name
                  AND (c.section IS NULL OR s.section = c.section)) AS student_count
         FROM classes c
         LEFT JOIN teachers t ON t.id = c.teacher_id
        WHERE c.institution_id = ?
        ORDER BY c.name, c.section`,
      [req.institutionId]
    );
    res.json(rows);
  })
);

router.post(
  '/',
  requirePermission('programs.write'),
  validate({ body: classSchema }),
  asyncHandler(async (req, res) => {
    const id = uuidv4();
    const body = req.body;

    if (body.teacher_id) {
      const [teachers] = await db.execute(
        'SELECT id FROM teachers WHERE id = ? AND institution_id = ?',
        [body.teacher_id, req.institutionId]
      );
      if (teachers.length === 0) throw ApiError.badRequest('That teacher is not in this institution.');
    }

    await db.execute(
      'INSERT INTO classes (id, institution_id, name, section, teacher_id, capacity) VALUES (?, ?, ?, ?, ?, ?)',
      [id, req.institutionId, body.name, body.section, body.teacher_id || null, body.capacity ?? null]
    );

    const created = await findOwnedOrFail(db, 'classes', id, req.institutionId);
    res.status(201).json(created);
  })
);

router.put(
  '/:id',
  requirePermission('programs.write'),
  validate({ params: idParam, body: partialUpdate(classSchema) }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'classes', req.params.id, req.institutionId);

    const update = buildUpdate(req.body, UPDATABLE);
    if (!update) throw ApiError.badRequest('No updatable fields provided');

    await db.execute(
      `UPDATE classes SET ${update.sql} WHERE id = ? AND institution_id = ?`,
      [...update.params, req.params.id, req.institutionId]
    );

    const updated = await findOwnedOrFail(db, 'classes', req.params.id, req.institutionId);
    res.json(updated);
  })
);

router.delete(
  '/:id',
  requirePermission('programs.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'classes', req.params.id, req.institutionId);
    await db.execute('DELETE FROM classes WHERE id = ? AND institution_id = ?', [
      req.params.id, req.institutionId,
    ]);
    res.json({ success: true });
  })
);

export default router;
