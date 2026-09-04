/**
 * School calendar — holidays, exams, events, PTMs.
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
import { findOwnedOrFail, buildUpdate } from '../lib/query.js';
import { z, longText, isoDate, idParam, partialUpdate } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('calendar'));

const EVENT_TYPES = ['holiday', 'exam', 'event', 'ptm', 'other'];
const UPDATABLE = ['title', 'description', 'event_date', 'end_date', 'event_type'];

router.get(
  '/',
  requirePermission('students.read'),
  validate({ query: z.object({ from: isoDate, to: isoDate }) }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT * FROM calendar_events
        WHERE institution_id = ?
          AND (? IS NULL OR event_date >= ?)
          AND (? IS NULL OR event_date <= ?)
        ORDER BY event_date`,
      [req.institutionId, req.query.from || null, req.query.from || null, req.query.to || null, req.query.to || null]
    );
    res.json(rows);
  })
);

const eventSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: longText,
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  end_date: isoDate,
  event_type: z.enum(EVENT_TYPES).default('event'),
});

router.post(
  '/',
  requirePermission('students.write'),
  validate({ body: eventSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const id = uuidv4();
    await db.execute(
      `INSERT INTO calendar_events (id, institution_id, title, description, event_date, end_date, event_type, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.institutionId, body.title, body.description, body.event_date, body.end_date, body.event_type, req.auth?.profile?.id || null]
    );
    const event = await findOwnedOrFail(db, 'calendar_events', id, req.institutionId);
    res.status(201).json(event);
  })
);

router.put(
  '/:id',
  requirePermission('students.write'),
  validate({ params: idParam, body: partialUpdate(eventSchema) }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'calendar_events', req.params.id, req.institutionId);
    const update = buildUpdate(req.body, UPDATABLE);
    if (!update) throw ApiError.badRequest('No updatable fields provided');
    await db.execute(
      `UPDATE calendar_events SET ${update.sql} WHERE id = ? AND institution_id = ?`,
      [...update.params, req.params.id, req.institutionId]
    );
    const event = await findOwnedOrFail(db, 'calendar_events', req.params.id, req.institutionId);
    res.json(event);
  })
);

router.delete(
  '/:id',
  requirePermission('students.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'calendar_events', req.params.id, req.institutionId);
    await db.execute('DELETE FROM calendar_events WHERE id = ? AND institution_id = ?', [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

export default router;
