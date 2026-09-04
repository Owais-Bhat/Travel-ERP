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
import db from '../lib/db.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { z } from '../validation/common.js';
import { processPunchEvent } from '../lib/biometricProcessing.js';

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
      const wasMatched = await processPunchEvent(db, institutionId, device.id, event);
      if (wasMatched) matched += 1;
    }

    res.status(201).json({ received: events.length, matched, unmatched: events.length - matched });
  })
);

export default router;
