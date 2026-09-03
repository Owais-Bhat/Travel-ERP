/**
 * Hostel — hostels, rooms and student room allocations.
 *
 * A room's occupancy is derived from active allocations rather than stored,
 * so it can never drift out of sync the way a cached counter could.
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
import { findOwnedOrFail, buildUpdate } from '../lib/query.js';
import { z, optionalText, idParam, phone, partialUpdate } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('hostel'));

const HOSTEL_UPDATABLE = ['name', 'warden_name', 'warden_phone', 'address'];
const ROOM_UPDATABLE = ['room_number', 'room_type', 'capacity'];

const hostelSchema = z.object({
  name: z.string().trim().min(1).max(255),
  warden_name: optionalText(200),
  warden_phone: phone,
  address: optionalText(1000),
});

router.get(
  '/hostels',
  requirePermission('students.read'),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT h.*,
              (SELECT COUNT(*) FROM hostel_rooms r WHERE r.hostel_id = h.id) AS room_count,
              (SELECT COUNT(*) FROM hostel_allocations a
                 JOIN hostel_rooms r2 ON r2.id = a.room_id
                WHERE r2.hostel_id = h.id AND a.status = 'active') AS occupied_count
         FROM hostels h
        WHERE h.institution_id = ?
        ORDER BY h.name`,
      [req.institutionId]
    );
    res.json(rows);
  })
);

router.post(
  '/hostels',
  requirePermission('students.write'),
  validate({ body: hostelSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const id = uuidv4();
    await db.execute(
      `INSERT INTO hostels (id, institution_id, name, warden_name, warden_phone, address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, req.institutionId, body.name, body.warden_name, body.warden_phone, body.address]
    );
    const hostel = await findOwnedOrFail(db, 'hostels', id, req.institutionId);
    res.status(201).json(hostel);
  })
);

router.put(
  '/hostels/:id',
  requirePermission('students.write'),
  validate({ params: idParam, body: partialUpdate(hostelSchema) }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'hostels', req.params.id, req.institutionId);
    const update = buildUpdate(req.body, HOSTEL_UPDATABLE);
    if (!update) throw ApiError.badRequest('No updatable fields provided');
    await db.execute(
      `UPDATE hostels SET ${update.sql} WHERE id = ? AND institution_id = ?`,
      [...update.params, req.params.id, req.institutionId]
    );
    const hostel = await findOwnedOrFail(db, 'hostels', req.params.id, req.institutionId);
    res.json(hostel);
  })
);

router.delete(
  '/hostels/:id',
  requirePermission('students.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'hostels', req.params.id, req.institutionId);
    await db.execute('DELETE FROM hostels WHERE id = ? AND institution_id = ?', [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

// -------------------------------------------------------- rooms
const roomSchema = z.object({
  hostel_id: z.string().uuid(),
  room_number: z.string().trim().min(1).max(50),
  room_type: optionalText(50),
  capacity: z.coerce.number().int().min(1).max(50).default(1),
});

router.get(
  '/rooms',
  requirePermission('students.read'),
  validate({ query: z.object({ hostel_id: z.string().uuid().optional() }) }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT r.*,
              (SELECT COUNT(*) FROM hostel_allocations a WHERE a.room_id = r.id AND a.status = 'active') AS occupied_count
         FROM hostel_rooms r
        WHERE r.institution_id = ? AND (? IS NULL OR r.hostel_id = ?)
        ORDER BY r.room_number`,
      [req.institutionId, req.query.hostel_id || null, req.query.hostel_id || null]
    );
    res.json(rows);
  })
);

router.post(
  '/rooms',
  requirePermission('students.write'),
  validate({ body: roomSchema }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'hostels', req.body.hostel_id, req.institutionId);
    const id = uuidv4();
    await db.execute(
      `INSERT INTO hostel_rooms (id, institution_id, hostel_id, room_number, room_type, capacity)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, req.institutionId, req.body.hostel_id, req.body.room_number, req.body.room_type, req.body.capacity]
    );
    const room = await findOwnedOrFail(db, 'hostel_rooms', id, req.institutionId);
    res.status(201).json(room);
  })
);

router.put(
  '/rooms/:id',
  requirePermission('students.write'),
  validate({ params: idParam, body: partialUpdate(roomSchema.omit({ hostel_id: true })) }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'hostel_rooms', req.params.id, req.institutionId);
    const update = buildUpdate(req.body, ROOM_UPDATABLE);
    if (!update) throw ApiError.badRequest('No updatable fields provided');
    await db.execute(
      `UPDATE hostel_rooms SET ${update.sql} WHERE id = ? AND institution_id = ?`,
      [...update.params, req.params.id, req.institutionId]
    );
    const room = await findOwnedOrFail(db, 'hostel_rooms', req.params.id, req.institutionId);
    res.json(room);
  })
);

router.delete(
  '/rooms/:id',
  requirePermission('students.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'hostel_rooms', req.params.id, req.institutionId);
    const [[{ activeCount }]] = await db.execute(
      `SELECT COUNT(*) AS activeCount FROM hostel_allocations WHERE room_id = ? AND status = 'active'`,
      [req.params.id]
    );
    if (Number(activeCount) > 0) {
      throw ApiError.conflict('Cannot delete a room with students currently allocated.');
    }
    await db.execute('DELETE FROM hostel_rooms WHERE id = ? AND institution_id = ?', [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

// -------------------------------------------------------- allocations
router.get(
  '/allocations',
  requirePermission('students.read'),
  validate({ query: z.object({ status: z.enum(['active', 'vacated']).optional() }) }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT a.*, r.room_number, r.room_type, h.name AS hostel_name,
              s.first_name, s.last_name, s.admission_no, s.class_name
         FROM hostel_allocations a
         JOIN hostel_rooms r ON r.id = a.room_id
         JOIN hostels h ON h.id = r.hostel_id
         JOIN students s ON s.id = a.student_id
        WHERE a.institution_id = ? AND (? IS NULL OR a.status = ?)
        ORDER BY a.status = 'active' DESC, a.allocated_at DESC`,
      [req.institutionId, req.query.status || null, req.query.status || null]
    );
    res.json(rows);
  })
);

router.post(
  '/allocations',
  requirePermission('students.write'),
  validate({ body: z.object({ room_id: z.string().uuid(), student_id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const institutionId = req.institutionId;

    const allocation = await withTransaction(async (connection) => {
      const [roomRows] = await connection.execute(
        'SELECT * FROM hostel_rooms WHERE id = ? AND institution_id = ? FOR UPDATE',
        [req.body.room_id, institutionId]
      );
      const room = roomRows[0];
      if (!room) throw ApiError.notFound('Room not found');

      const [studentRows] = await connection.execute(
        'SELECT id FROM students WHERE id = ? AND institution_id = ?',
        [req.body.student_id, institutionId]
      );
      if (studentRows.length === 0) throw ApiError.notFound('Student not found in this institution');

      const [[{ occupied }]] = await connection.execute(
        `SELECT COUNT(*) AS occupied FROM hostel_allocations WHERE room_id = ? AND status = 'active'`,
        [room.id]
      );
      if (Number(occupied) >= room.capacity) {
        throw ApiError.conflict(`Room ${room.room_number} is full (${room.capacity} capacity).`);
      }

      // One active room per student — reallocating vacates the old one.
      await connection.execute(
        `UPDATE hostel_allocations SET status = 'vacated', vacated_at = CURDATE()
          WHERE student_id = ? AND status = 'active'`,
        [req.body.student_id]
      );

      const id = uuidv4();
      await connection.execute(
        `INSERT INTO hostel_allocations (id, institution_id, room_id, student_id, allocated_at, status)
         VALUES (?, ?, ?, ?, CURDATE(), 'active')`,
        [id, institutionId, room.id, req.body.student_id]
      );

      const [created] = await connection.execute('SELECT * FROM hostel_allocations WHERE id = ?', [id]);
      return created[0];
    });

    res.status(201).json(allocation);
  })
);

router.post(
  '/allocations/:id/vacate',
  requirePermission('students.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const allocation = await findOwnedOrFail(db, 'hostel_allocations', req.params.id, req.institutionId);
    if (allocation.status === 'vacated') throw ApiError.conflict('This allocation is already vacated.');

    await db.execute(
      `UPDATE hostel_allocations SET status = 'vacated', vacated_at = CURDATE() WHERE id = ?`,
      [req.params.id]
    );
    const updated = await findOwnedOrFail(db, 'hostel_allocations', req.params.id, req.institutionId);
    res.json(updated);
  })
);

export default router;
