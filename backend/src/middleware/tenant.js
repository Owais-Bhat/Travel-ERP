/**
 * Tenant isolation.
 *
 * MySQL has no row-level security, so every tenant-scoped query must filter
 * by institution_id. This middleware resolves that id once and puts it on
 * `req.institutionId`, and refuses the request when it is missing — which is
 * safer than a route silently querying with `undefined`.
 */
import { ApiError } from '../lib/errors.js';

export function requireInstitution(req, res, next) {
  const profile = req.auth?.profile;
  if (!profile) return next(ApiError.unauthorized());

  // A super admin may act inside a tenant by passing ?institutionId= or the
  // X-Institution-Id header; everyone else is pinned to their own tenant.
  if (profile.role === 'super_admin') {
    const override = req.query?.institutionId || req.headers['x-institution-id'];
    const institutionId = override || profile.institution_id;
    if (!institutionId) {
      return next(ApiError.badRequest(
        'Super admin requests must name a tenant via ?institutionId= or the X-Institution-Id header.'
      ));
    }
    req.institutionId = String(institutionId);
    return next();
  }

  if (!profile.institution_id) {
    return next(ApiError.forbidden('Your account is not linked to an institution.'));
  }

  req.institutionId = profile.institution_id;
  return next();
}

export default requireInstitution;
