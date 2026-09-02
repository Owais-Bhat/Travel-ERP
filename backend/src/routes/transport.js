/**
 * Transport — routes, stops and student assignments.
 *
 * Ported off Supabase. Assignment is capacity-checked and a student can
 * only be on one route at a time.
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
router.use(requireFeature('transport'));

const UPDATABLE = ['route_name', 'driver_name', 'driver_phone', 'vehicle_no', 'capacity', 'stops', 'is_active'];

/**
 * A stop is either a bare name (what the transport screen sends today) or a
 * richer object with a time and coordinates. Both normalise to the object
 * form before they are stored, so readers only deal with one shape.
 */
const stopSchema = z.preprocess(
  (value) => (typeof value === 'string' ? { name: value } : value),
  z.object({
    name: z.string().trim().min(1).max(255),
    time: optionalText(20),
    lat: z.coerce.number().min(-90).max(90).nullable().optional(),
    lng: z.coerce.number().min(-180).max(180).nullable().optional(),
  })
);

const routeSchema = z.object({
  route_name: z.string().trim().min(1).max(255),
  driver_name: optionalText(200),
  driver_phone: phone,
  vehicle_no: optionalText(50),
  capacity: z.coerce.number().int().min(0).max(500).nullable().optional(),
  stops: z.array(stopSchema).max(100).optional(),
  is_active: z.boolean().default(true),
});

/** mysql2 parses JSON columns; tolerate a string for older rows. */
function withStops(row) {
  if (!row) return row;
  let stops = row.stops;
  if (typeof stops === 'string') {
    try { stops = JSON.parse(stops); } catch { stops = []; }
  }
  return { ...row, stops: Array.isArray(stops) ? stops : [] };
}

router.get(
  '/routes',
  requirePermission('students.read'),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT r.*,
              (SELECT COUNT(*) FROM student_routes sr WHERE sr.route_id = r.id) AS assigned_count
         FROM transport_routes r
        WHERE r.institution_id = ?
        ORDER BY r.route_name`,
      [req.institutionId]
    );
    res.json(rows.map(withStops));
  })
);

router.get(
  '/routes/:id',
  requirePermission('students.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const route = await findOwnedOrFail(db, 'transport_routes', req.params.id, req.institutionId);
    const [students] = await db.execute(
      `SELECT sr.id AS assignment_id, sr.pickup_stop, s.id, s.first_name, s.last_name,
              s.admission_no, s.class_name, s.section, s.parent_phone
         FROM student_routes sr
         JOIN students s ON s.id = sr.student_id
        WHERE sr.route_id = ?
        ORDER BY s.first_name, s.last_name`,
      [req.params.id]
    );
    res.json({ route: withStops(route), students });
  })
);

router.post(
  '/routes',
  requirePermission('students.write'),
  validate({ body: routeSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const id = uuidv4();

    await db.execute(
      `INSERT INTO transport_routes
         (id, institution_id, route_name, driver_name, driver_phone, vehicle_no, capacity, stops, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, req.institutionId, body.route_name, body.driver_name, body.driver_phone,
        body.vehicle_no, body.capacity ?? null,
        body.stops ? JSON.stringify(body.stops) : null,
        body.is_active ? 1 : 0,
      ]
    );

    const route = await findOwnedOrFail(db, 'transport_routes', id, req.institutionId);
    res.status(201).json(withStops(route));
  })
);

router.put(
  '/routes/:id',
  requirePermission('students.write'),
  validate({ params: idParam, body: partialUpdate(routeSchema) }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'transport_routes', req.params.id, req.institutionId);

    const payload = { ...req.body };
    if (payload.stops !== undefined) payload.stops = JSON.stringify(payload.stops);
    if (payload.is_active !== undefined) payload.is_active = payload.is_active ? 1 : 0;

    const update = buildUpdate(payload, UPDATABLE);
    if (!update) throw ApiError.badRequest('No updatable fields provided');

    await db.execute(
      `UPDATE transport_routes SET ${update.sql} WHERE id = ? AND institution_id = ?`,
      [...update.params, req.params.id, req.institutionId]
    );

    const route = await findOwnedOrFail(db, 'transport_routes', req.params.id, req.institutionId);
    res.json(withStops(route));
  })
);

router.delete(
  '/routes/:id',
  requirePermission('students.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'transport_routes', req.params.id, req.institutionId);
    await db.execute('DELETE FROM transport_routes WHERE id = ? AND institution_id = ?', [
      req.params.id, req.institutionId,
    ]);
    res.json({ success: true });
  })
);

// -------------------------------------------------------- assignments
router.post(
  '/routes/:id/students',
  requirePermission('students.write'),
  validate({
    params: idParam,
    body: z.object({ student_id: z.string().uuid(), pickup_stop: optionalText(255) }),
  }),
  asyncHandler(async (req, res) => {
    const institutionId = req.institutionId;

    const assignment = await withTransaction(async (connection) => {
      const [routeRows] = await connection.execute(
        'SELECT * FROM transport_routes WHERE id = ? AND institution_id = ? FOR UPDATE',
        [req.params.id, institutionId]
      );
      const route = routeRows[0];
      if (!route) throw ApiError.notFound('Route not found');

      const [studentRows] = await connection.execute(
        'SELECT id FROM students WHERE id = ? AND institution_id = ?',
        [req.body.student_id, institutionId]
      );
      if (studentRows.length === 0) throw ApiError.notFound('Student not found in this institution');

      const [[seats]] = await connection.execute(
        'SELECT COUNT(*) AS taken FROM student_routes WHERE route_id = ?',
        [route.id]
      );
      if (route.capacity && Number(seats.taken) >= Number(route.capacity)) {
        throw ApiError.conflict(`"${route.route_name}" is full (${route.capacity} seats).`);
      }

      // One route per student — moving them replaces the old assignment.
      await connection.execute('DELETE FROM student_routes WHERE student_id = ?', [req.body.student_id]);

      const id = uuidv4();
      await connection.execute(
        'INSERT INTO student_routes (id, route_id, student_id, pickup_stop) VALUES (?, ?, ?, ?)',
        [id, route.id, req.body.student_id, req.body.pickup_stop]
      );

      const [created] = await connection.execute('SELECT * FROM student_routes WHERE id = ?', [id]);
      return created[0];
    });

    res.status(201).json(assignment);
  })
);

router.delete(
  '/assignments/:id',
  requirePermission('students.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT sr.id FROM student_routes sr
         JOIN transport_routes r ON r.id = sr.route_id
        WHERE sr.id = ? AND r.institution_id = ?`,
      [req.params.id, req.institutionId]
    );
    if (rows.length === 0) throw ApiError.notFound('Assignment not found');

    await db.execute('DELETE FROM student_routes WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  })
);

/** Students in this tenant with no route yet. */
router.get(
  '/unassigned',
  requirePermission('students.read'),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT s.id, s.first_name, s.last_name, s.admission_no, s.class_name, s.section
         FROM students s
         LEFT JOIN student_routes sr ON sr.student_id = s.id
        WHERE s.institution_id = ? AND sr.id IS NULL AND s.status = 'active'
        ORDER BY s.first_name, s.last_name
        LIMIT 500`,
      [req.institutionId]
    );
    res.json(rows);
  })
);

export default router;
