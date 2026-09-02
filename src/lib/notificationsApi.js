import api from './api';

/**
 * In-app notifications.
 *
 * Ported off Supabase Realtime. Postgres LISTEN/NOTIFY has no MySQL
 * equivalent, so `pollNotifications` replaces the realtime channel: it asks
 * only for rows newer than the last cursor, which is one indexed lookup per
 * poll rather than a full refetch.
 */
const PAGE_SIZE = 20;

export async function fetchNotifications(limit = PAGE_SIZE) {
  const response = await api.get('/notifications', { params: { limit } });
  return response.data;
}

export async function markNotificationRead(id) {
  const response = await api.post(`/notifications/${id}/read`);
  return response.data;
}

export async function markAllNotificationsRead() {
  const response = await api.post('/notifications/read-all');
  return response.data;
}

export async function deleteNotification(id) {
  const response = await api.delete(`/notifications/${id}`);
  return response.data;
}

/** Fan a notification out to a role, or to specific profile ids. */
export async function notifyInstitution({ title, body, type = 'info', link, role = 'all', profileIds }) {
  const response = await api.post('/notifications/broadcast', { title, body, type, link, role, profileIds });
  return response.data;
}

/**
 * Poll for anything newer than `since`.
 *
 * Starts an interval and returns a stop function, so callers keep the same
 * subscribe/unsubscribe shape the realtime channel had.
 */
export function pollNotifications(onBatch, { intervalMs = 30000, since = null } = {}) {
  let cursor = since;
  let stopped = false;
  let timer = null;

  const tick = async () => {
    if (stopped) return;
    try {
      const response = await api.get('/notifications', {
        params: { limit: PAGE_SIZE, ...(cursor ? { since: cursor } : {}) },
      });
      const { notifications = [], unread = 0 } = response.data || {};
      if (notifications.length > 0) {
        cursor = notifications[0].created_at;
        onBatch(notifications, unread);
      }
    } catch {
      // Offline or the session expired — the next tick will retry.
    }
  };

  // Pause while the tab is hidden; no point polling a screen nobody sees.
  const onVisibility = () => {
    if (document.visibilityState === 'visible') tick();
  };

  timer = setInterval(tick, intervalMs);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
