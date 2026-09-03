import api from './api';

/**
 * Platform (super-admin) console API.
 *
 * Ported off Supabase Auth — the shared axios client already attaches the
 * JWT from localStorage, so there is no session lookup to do here.
 */
const unwrap = (promise) => promise.then((response) => response.data);

export const fetchAdminInstitutions = () => unwrap(api.get('/admin/institutions'));
export const fetchAdminFeatures = () => unwrap(api.get('/admin/features'));
export const fetchAdminUsage = () => unwrap(api.get('/admin/usage'));

export const fetchAdminAudit = (params = {}) =>
  unwrap(api.get('/admin/audit', { params }));

export const createAdminInstitution = (data) =>
  unwrap(api.post('/admin/institutions', data));

export const changeInstitutionPlan = (data) =>
  unwrap(api.post('/admin/change-plan', data));

export const updateInstitutionSubscription = (data) =>
  unwrap(api.post('/admin/subscription', data));

export const suspendInstitution = (data) =>
  unwrap(api.post('/admin/suspend-institution', data));

export const setInstitutionFeature = (data) =>
  unwrap(api.post('/admin/set-feature', data));

export const searchAdminDirectory = (q) =>
  unwrap(api.get('/admin/search', { params: { q } }));

export const fetchSystemHealth = () => unwrap(api.get('/admin/system-health'));

export const impersonateInstitution = (institutionId) =>
  unwrap(api.post(`/admin/institutions/${institutionId}/impersonate`));

// --- institution verification (EIMS) ---------------------------------
export const fetchVerificationQueue = (status) =>
  unwrap(api.get('/admin/verifications', { params: status ? { status } : {} }));

export const fetchVerificationDocuments = (institutionId) =>
  unwrap(api.get(`/admin/verifications/${institutionId}/documents`));

export const decideVerification = (institutionId, data) =>
  unwrap(api.post(`/admin/verifications/${institutionId}`, data));

export const reviewInstitutionDocument = (documentId, data) =>
  unwrap(api.post(`/admin/documents/${documentId}/review`, data));

/**
 * Provisioning a tenant used to be a Supabase invite; the MySQL backend
 * creates the admin account directly, so this delegates to the tenant-user
 * endpoint and returns the one-time temporary password.
 */
export const inviteInstitutionUser = (data) =>
  unwrap(api.post('/users/invite', data, {
    headers: data.institutionId ? { 'X-Institution-Id': data.institutionId } : undefined,
  }));
