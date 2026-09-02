import api, { getToken } from './api';

/**
 * Feature-usage telemetry.
 *
 * Fire-and-forget: a failed beacon must never surface to the user or block
 * a page render, so every error is swallowed.
 */
export async function trackFeatureUsage(featureKey, eventType = 'view', metadata = {}) {
  if (!featureKey || !getToken()) return null;

  try {
    const response = await api.post('/usage/track', { featureKey, eventType, metadata });
    return response.data;
  } catch {
    return null;
  }
}

export async function fetchUsageSummary() {
  const response = await api.get('/usage/summary');
  return response.data;
}
