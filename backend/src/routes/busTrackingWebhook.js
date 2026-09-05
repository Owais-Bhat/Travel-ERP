/**
 * Live GPS Bus Tracking — public ping endpoint, no user session.
 *
 * A driver's phone (a plain browser page opened from a link, or any GPS
 * app that can POST JSON) pushes its coordinates here, authenticated by
 * the route's own `tracking_token` — same public-device pattern as
 * biometricWebhook.js authenticating a device by its own api_key rather
 * than a JWT.
 */
import express from 'express';
import db from '../lib/db.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { z } from '../validation/common.js';

const router = express.Router();

const pingSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

router.post(
  '/:token',
  validate({ params: z.object({ token: z.string().uuid() }), body: pingSchema }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute('SELECT id FROM transport_routes WHERE tracking_token = ?', [req.params.token]);
    if (!rows[0]) throw ApiError.unauthorized('Unknown tracking token.');

    await db.execute(
      'UPDATE transport_routes SET last_lat = ?, last_lng = ?, last_ping_at = NOW() WHERE id = ?',
      [req.body.lat, req.body.lng, rows[0].id]
    );
    res.json({ success: true });
  })
);

export default router;
