/**
 * Biometric attendance — device registry, student/staff enrollment, and the
 * raw punch log. The actual ingestion endpoint devices push to lives in
 * biometricWebhook.js (public, device-key auth) — everything here is the
 * tenant-side management surface behind normal session auth.
 */
import express from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import db from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requireFeature } from '../middleware/feature.js';
import { requirePermission } from '../auth/permissions.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { findOwnedOrFail } from '../lib/query.js';
import { z, optionalText, idParam } from '../validation/common.js';
import { processPunchEvent, parseCsv, csvRowsToEvents } from '../lib/biometricProcessing.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('biometric_attendance'));

function generateApiKey() {
  return crypto.randomBytes(24).toString('hex');
}

// -------------------------------------------------------- devices
router.get(
  '/devices',
  requirePermission('attendance.read'),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      'SELECT * FROM biometric_devices WHERE institution_id = ? ORDER BY name',
      [req.institutionId]
    );
    res.json(rows);
  })
);

router.post(
  '/devices',
  requirePermission('attendance.write'),
  validate({
    body: z.object({
      device_code: z.string().trim().min(1).max(50),
      name: z.string().trim().min(1).max(255),
      location: optionalText(150),
    }),
  }),
  asyncHandler(async (req, res) => {
    const [existing] = await db.execute(
      'SELECT id FROM biometric_devices WHERE institution_id = ? AND device_code = ?',
      [req.institutionId, req.body.device_code]
    );
    if (existing.length > 0) throw ApiError.conflict('A device with this code already exists.');

    const id = uuidv4();
    const apiKey = generateApiKey();
    await db.execute(
      `INSERT INTO biometric_devices (id, institution_id, device_code, api_key, name, location)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, req.institutionId, req.body.device_code, apiKey, req.body.name, req.body.location]
    );
    const device = await findOwnedOrFail(db, 'biometric_devices', id, req.institutionId);
    res.status(201).json(device);
  })
);

router.post(
  '/devices/:id/rotate-key',
  requirePermission('attendance.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'biometric_devices', req.params.id, req.institutionId);
    const apiKey = generateApiKey();
    await db.execute('UPDATE biometric_devices SET api_key = ? WHERE id = ?', [apiKey, req.params.id]);
    const device = await findOwnedOrFail(db, 'biometric_devices', req.params.id, req.institutionId);
    res.json(device);
  })
);

router.delete(
  '/devices/:id',
  requirePermission('attendance.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'biometric_devices', req.params.id, req.institutionId);
    await db.execute('DELETE FROM biometric_devices WHERE id = ? AND institution_id = ?', [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

// -------------------------------------------------------- enrollments
router.get(
  '/enrollments',
  requirePermission('attendance.read'),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT e.*,
              COALESCE(s.first_name, t.first_name) AS first_name,
              COALESCE(s.last_name, t.last_name) AS last_name,
              s.class_name, t.employee_id
         FROM biometric_enrollments e
         LEFT JOIN students s ON e.person_type = 'student' AND s.id = e.person_id
         LEFT JOIN teachers t ON e.person_type = 'teacher' AND t.id = e.person_id
        WHERE e.institution_id = ?
        ORDER BY e.created_at DESC`,
      [req.institutionId]
    );
    res.json(rows);
  })
);

router.post(
  '/enrollments',
  requirePermission('attendance.write'),
  validate({
    body: z.object({
      person_type: z.enum(['student', 'teacher']),
      person_id: z.string().uuid(),
      biometric_uid: z.string().trim().min(1).max(50),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { person_type, person_id, biometric_uid } = req.body;
    const table = person_type === 'student' ? 'students' : 'teachers';
    await findOwnedOrFail(db, table, person_id, req.institutionId);

    const id = uuidv4();
    try {
      await db.execute(
        `INSERT INTO biometric_enrollments (id, institution_id, person_type, person_id, biometric_uid)
         VALUES (?, ?, ?, ?, ?)`,
        [id, req.institutionId, person_type, person_id, biometric_uid]
      );
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw ApiError.conflict('This biometric ID or person is already enrolled.');
      }
      throw error;
    }

    const [rows] = await db.execute('SELECT * FROM biometric_enrollments WHERE id = ?', [id]);
    res.status(201).json(rows[0]);
  })
);

router.delete(
  '/enrollments/:id',
  requirePermission('attendance.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'biometric_enrollments', req.params.id, req.institutionId);
    await db.execute('DELETE FROM biometric_enrollments WHERE id = ? AND institution_id = ?', [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

// -------------------------------------------------------- CSV import
// A device's own software (Realtime eTimeTrackLite and equivalents on
// other brands) exports attendance logs as CSV/Excel. This is the
// reliable path when the device isn't (or can't be) configured to push
// live — same matching/attendance logic as the webhook, just fed from a
// file instead of a real-time POST.
router.post(
  '/devices/:id/import-csv',
  requirePermission('attendance.write'),
  validate({ params: idParam }),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const device = await findOwnedOrFail(db, 'biometric_devices', req.params.id, req.institutionId);
    if (!req.file) throw ApiError.badRequest('Attach a CSV file under the "file" field.');

    const text = req.file.buffer.toString('utf8');
    const rows = parseCsv(text);
    const { events, error } = csvRowsToEvents(rows);
    if (error) throw ApiError.badRequest(error);
    if (events.length === 0) throw ApiError.badRequest('No usable rows found in this file.');

    let matched = 0;
    for (const event of events) {
      const wasMatched = await processPunchEvent(db, req.institutionId, device.id, { ...event, source: 'csv_import' });
      if (wasMatched) matched += 1;
    }

    await db.execute('UPDATE biometric_devices SET last_seen_at = NOW() WHERE id = ?', [device.id]);

    res.status(201).json({ received: events.length, matched, unmatched: events.length - matched });
  })
);

// -------------------------------------------------------- punch log
router.get(
  '/punches',
  requirePermission('attendance.read'),
  validate({ query: z.object({ matched: z.enum(['true', 'false']).optional() }) }),
  asyncHandler(async (req, res) => {
    const matchedFilter = req.query.matched === undefined ? null : req.query.matched === 'true';
    const [rows] = await db.execute(
      `SELECT p.*, d.name AS device_name,
              COALESCE(s.first_name, t.first_name) AS first_name,
              COALESCE(s.last_name, t.last_name) AS last_name
         FROM biometric_punches p
         JOIN biometric_devices d ON d.id = p.device_id
         LEFT JOIN students s ON p.person_type = 'student' AND s.id = p.person_id
         LEFT JOIN teachers t ON p.person_type = 'teacher' AND t.id = p.person_id
        WHERE p.institution_id = ? AND (? IS NULL OR p.matched = ?)
        ORDER BY p.punched_at DESC
        LIMIT 200`,
      [req.institutionId, matchedFilter, matchedFilter]
    );
    res.json(rows);
  })
);

export default router;
