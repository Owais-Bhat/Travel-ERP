/**
 * Room / Facility Booking — a facility (lab, auditorium, ground) and a
 * calendar of time-slot bookings against it. Overlap is checked with a
 * `FOR UPDATE` lock, same pattern as transport.js's seat-capacity check.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db, { withTransaction } from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requireFeature } from '../middleware/feature.js';
import { requirePermission } from '../auth/permissions.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { findOwnedOrFail } from '../lib/query.js';
import { z, optionalText, idParam, isoDateTime } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('facility_booking'));

const facilitySchema = z.object({
  name: z.string().trim().min(1).max(200),
  facility_type: optionalText(50),
  capacity: z.coerce.number().int().min(0).max(10000).nullable().optional(),
  is_active: z.boolean().default(true),
});

const bookingSchema = z.object({
  facility_id: z.string().uuid(),
  purpose: optionalText(255),
  start_time: isoDateTime,
  end_time: isoDateTime,
});

router.get(
  '/',
  requirePermission('students.read'),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT * FROM facilities WHERE institution_id = ? ORDER BY name`,
      [req.institutionId]
    );
    res.json(rows);
  })
);

router.post(
  '/',
  requirePermission('students.write'),
  validate({ body: facilitySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const id = uuidv4();
    await db.execute(
      `INSERT INTO facilities (id, institution_id, name, facility_type, capacity, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, req.institutionId, body.name, body.facility_type, body.capacity ?? null, body.is_active ? 1 : 0]
    );
    const created = await findOwnedOrFail(db, 'facilities', id, req.institutionId);
    res.status(201).json(created);
  })
);

router.delete(
  '/:id',
  requirePermission('students.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'facilities', req.params.id, req.institutionId);
    await db.execute('DELETE FROM facilities WHERE id = ? AND institution_id = ?', [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

router.get(
  '/bookings',
  requirePermission('students.read'),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT b.*, f.name AS facility_name
         FROM facility_bookings b
         JOIN facilities f ON f.id = b.facility_id
        WHERE b.institution_id = ?
        ORDER BY b.start_time DESC
        LIMIT 200`,
      [req.institutionId]
    );
    res.json(rows);
  })
);

router.post(
  '/bookings',
  requirePermission('students.write'),
  validate({ body: bookingSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (new Date(body.end_time) <= new Date(body.start_time)) {
      throw ApiError.badRequest('end_time must be after start_time');
    }

    const booking = await withTransaction(async (connection) => {
      const [facilityRows] = await connection.execute(
        'SELECT * FROM facilities WHERE id = ? AND institution_id = ? FOR UPDATE',
        [body.facility_id, req.institutionId]
      );
      if (!facilityRows[0]) throw ApiError.notFound('Facility not found');

      const [clashRows] = await connection.execute(
        `SELECT id FROM facility_bookings
          WHERE facility_id = ? AND status != 'cancelled'
            AND start_time < ? AND end_time > ?`,
        [body.facility_id, body.end_time, body.start_time]
      );
      if (clashRows.length > 0) {
        throw ApiError.conflict('This facility is already booked for an overlapping time.');
      }

      const id = uuidv4();
      await connection.execute(
        `INSERT INTO facility_bookings (id, institution_id, facility_id, booked_by, purpose, start_time, end_time, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')`,
        [id, req.institutionId, body.facility_id, req.auth.profile.id, body.purpose, body.start_time, body.end_time]
      );

      const [created] = await connection.execute('SELECT * FROM facility_bookings WHERE id = ?', [id]);
      return created[0];
    });

    res.status(201).json(booking);
  })
);

router.delete(
  '/bookings/:id',
  requirePermission('students.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'facility_bookings', req.params.id, req.institutionId);
    await db.execute(
      `UPDATE facility_bookings SET status = 'cancelled' WHERE id = ? AND institution_id = ?`,
      [req.params.id, req.institutionId]
    );
    res.json({ success: true });
  })
);

export default router;
