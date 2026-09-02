import express from 'express';
import db from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { FEATURE_CATALOG } from '../saas/features.js';
import { z } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);

const FEATURE_KEYS = FEATURE_CATALOG.map((feature) => feature.key);

const trackSchema = z.object({
  featureKey: z.string().min(1).max(60),
  eventType: z.enum(['view', 'action', 'export', 'create', 'update', 'delete']).default('view'),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

router.post(
  '/track',
  requireInstitution,
  validate({ body: trackSchema }),
  asyncHandler(async (req, res) => {
    const { featureKey, eventType, metadata } = req.body;

    if (!FEATURE_KEYS.includes(featureKey)) {
      throw ApiError.badRequest('Unknown feature key', { code: 'unknown_feature' });
    }

    const [result] = await db.execute(
      `INSERT INTO feature_usage_events (institution_id, user_id, feature_key, event_type, metadata)
       VALUES (?, ?, ?, ?, ?)`,
      [
        req.institutionId,
        req.auth.profile.user_id,
        featureKey,
        eventType,
        JSON.stringify(metadata || {}),
      ]
    );

    res.status(201).json({ ok: true, id: result.insertId ?? null });
  })
);

/** Usage summary for the caller's own tenant (the admin console has its own cross-tenant view). */
router.get(
  '/summary',
  requireInstitution,
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT feature_key,
              COUNT(*)          AS events,
              MAX(created_at)   AS last_seen_at
         FROM feature_usage_events
        WHERE institution_id = ?
          AND created_at >= (NOW() - INTERVAL 30 DAY)
        GROUP BY feature_key
        ORDER BY events DESC`,
      [req.institutionId]
    );

    const used = new Set(rows.map((row) => row.feature_key));
    res.json({
      windowDays: 30,
      features: rows,
      unusedFeatures: FEATURE_KEYS.filter((key) => !used.has(key)),
    });
  })
);

export default router;
