import api from './api';

/**
 * Per-role feature access.
 *
 * Lets a tenant admin narrow what a role (teacher/student/parent/staff) can
 * see, within whatever the subscription plan already includes. Enforced on
 * both ends: the API rejects a restricted request, this just controls the
 * UI the admin uses to set it up.
 */
export async function fetchRoleFeatures() {
  const response = await api.get('/institutions/role-features');
  return response.data;
}

export async function saveRoleFeatures(roleFeatures) {
  const response = await api.put('/institutions/role-features', { roleFeatures });
  return response.data;
}
