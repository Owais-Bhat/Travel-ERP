/**
 * Per-tenant, per-role feature gating.
 *
 * Two layers stack: the institution's subscription plan sets the ceiling
 * (what the tenant paid for), and the tenant admin can optionally narrow
 * a role further within that ceiling (`settings.role_features`). Until now
 * this was UI-only — `FeatureGate` hid the route, but nothing stopped a
 * restricted user from calling the API directly. This is the enforcement.
 *
 * Must run after `requireAuthenticatedProfile` and `requireInstitution`.
 */
import db from '../lib/db.js';
import { ApiError } from '../lib/errors.js';
import { isFeatureEnabledForRole, RESTRICTABLE_ROLES } from '../saas/features.js';

function readSettings(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function requireFeature(featureKey) {
  return async (req, res, next) => {
    try {
      const role = req.auth?.profile?.role;

      // Platform accounts and tenant admins are never restricted — the
      // admin is the one who sets these restrictions on everyone else.
      if (!RESTRICTABLE_ROLES.includes(role)) return next();

      const [rows] = await db.execute(
        'SELECT subscription_plan, settings FROM institutions WHERE id = ?',
        [req.institutionId]
      );
      const institution = rows[0];
      if (!institution) return next(ApiError.forbidden('Institution not found'));

      const enabled = isFeatureEnabledForRole(
        { ...institution, settings: readSettings(institution.settings) },
        role,
        featureKey
      );

      if (!enabled) {
        return next(ApiError.forbidden(
          'This feature is not available to your role. Ask your institution admin for access.',
          { code: 'feature_restricted' }
        ));
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export default requireFeature;
