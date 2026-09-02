import api from './api';

/**
 * Tenant user management.
 *
 * A super admin acts inside a tenant by naming it; the backend's tenant
 * middleware reads that from the X-Institution-Id header.
 */
const scoped = (institutionId) =>
  (institutionId ? { headers: { 'X-Institution-Id': institutionId } } : {});

export async function fetchInstitutionUsers(institutionId) {
  const response = await api.get('/users', scoped(institutionId));
  return response.data;
}

/** Returns `{ profile, email, temporaryPassword }` — the password is shown once. */
export async function inviteInstitutionUser({ institutionId, ...data }) {
  const response = await api.post('/users/invite', data, scoped(institutionId));
  return response.data;
}

export async function updateInstitutionUser(profileId, { institutionId, ...data }) {
  const response = await api.patch(`/users/${profileId}`, data, scoped(institutionId));
  return response.data;
}

export async function resetInstitutionUserPassword(profileId, institutionId) {
  const response = await api.post(`/users/${profileId}/reset-password`, {}, scoped(institutionId));
  return response.data;
}
