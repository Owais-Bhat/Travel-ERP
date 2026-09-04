/**
 * Biometric device webhook — public endpoint, no user session.
 *
 * A fingerprint/face scanner (or the vendor's push-to-URL middleware) can't
 * hold a user JWT, so it authenticates with its own device_code + api_key
 * instead. Every punch is logged to biometric_punches regardless of match;
 * a matched punch also derives same-day attendance for a student (existing
 * `attendance` table) or staff member (`staff_attendance`) — biometric
 * confirms presence, so a punch always upgrades the day to 'present'.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../lib/db.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { z } from '../validation/common.js';

const router = express.Router();

const eventSchema = z.object({
  biometric_uid: z.string().trim().min(1).max(50),
  timestamp: z.string().min(10).max(40),
  type: z.enum(['in', 'out', 'unknown']).default('unknown'),
});

const webhookSchema = z.object({
  device_code: z.string().trim().min(1).max(50),
  api_key: z.string().trim().min(1).max(64),
  events: z.array(eventSchema).min(1).max(500),
});

router.post(
  '/',
  validate({ body: webhookSchema }),
  asyncHandler(async (req, res) => {
    const { device_code, api_key, events } = req.body;

    const [deviceRows] = await db.execute(
      'SELECT * FROM biometric_devices WHERE device_code = ? AND api_key = ? AND is_active = 1',
      [device_code, api_key]
    );
    const device = deviceRows[0];
    if (!device) throw ApiError.unauthorized('Unknown device or invalid API key.');

    const institutionId = device.institution_id;
    await db.execute('UPDATE biometric_devices SET last_seen_at = NOW() WHERE id = ?', [device.id]);

    let matched = 0;
    for (const event of events) {
      const [enrollmentRows] = await db.execute(
        'SELECT * FROM biometric_enrollments WHERE institution_id = ? AND biometric_uid = ?',
        [institutionId, event.biometric_uid]
      );
      const enrollment = enrollmentRows[0];

      const punchId = uuidv4();
      await db.execute(
        `INSERT INTO biometric_punches
           (id, institution_id, device_id, biometric_uid, punched_at, event_type, person_type, person_id, matched)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          punchId, institutionId, device.id, event.biometric_uid,
          new Date(event.timestamp), event.type,
          enrollment?.person_type || null, enrollment?.person_id || null,
          enrollment ? 1 : 0,
        ]
      );

      if (!enrollment) continue;
      matched += 1;
      const punchDate = new Date(event.timestamp).toISOString().slice(0, 10);

      if (enrollment.person_type === 'student') {
        const [[student]] = await db.execute(
          'SELECT class_name FROM students WHERE id = ? AND institution_id = ?',
          [enrollment.person_id, institutionId]
        );
        if (student) {
          await db.execute(
            `INSERT INTO attendance (id, institution_id, student_id, class_name, date, status)
             VALUES (?, ?, ?, ?, ?, 'present')
             ON DUPLICATE KEY UPDATE status = 'present'`,
            [uuidv4(), institutionId, enrollment.person_id, student.class_name, punchDate]
          );
        }
      } else if (enrollment.person_type === 'teacher') {
        await db.execute(
          `INSERT INTO staff_attendance (id, institution_id, teacher_id, date, status, first_punch_at, last_punch_at, source)
           VALUES (?, ?, ?, ?, 'present', ?, ?, 'biometric')
           ON DUPLICATE KEY UPDATE
             last_punch_at = GREATEST(COALESCE(last_punch_at, VALUES(last_punch_at)), VALUES(last_punch_at)),
             first_punch_at = LEAST(COALESCE(first_punch_at, VALUES(first_punch_at)), VALUES(first_punch_at))`,
          [uuidv4(), institutionId, enrollment.person_id, punchDate, event.timestamp, event.timestamp]
        );
      }
    }

    res.status(201).json({ received: events.length, matched, unmatched: events.length - matched });
  })
);

export default router;
