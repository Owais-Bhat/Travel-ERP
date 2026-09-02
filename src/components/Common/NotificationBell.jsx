import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MdNotifications, MdCheckCircle, MdError, MdWarning, MdInfo, MdDoneAll, MdCampaign,
} from 'react-icons/md';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  pollNotifications,
} from '../../lib/notificationsApi';
import { useAuth } from '../../hooks/useAuth';
import { motion, AnimatePresence, spring } from './Motion';

const TYPE_TONES = {
  success: { icon: MdCheckCircle, color: 'var(--neu-success)' },
  error: { icon: MdError, color: 'var(--neu-danger)' },
  warning: { icon: MdWarning, color: 'var(--neu-amber)' },
  announcement: { icon: MdCampaign, color: 'var(--neu-coral)' },
  info: { icon: MdInfo, color: 'var(--neu-primary)' },
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const unreadCount = items.filter((item) => !item.read_at).length;

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const { notifications = [] } = await fetchNotifications();
      setItems(notifications);
    } catch {
      // Not signed in yet, or the API is unreachable — leave the list empty.
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  // Polling stands in for the Supabase realtime channel the app used to use.
  useEffect(() => {
    if (!profile?.id) return undefined;
    return pollNotifications((batch) => {
      setItems((previous) => {
        const known = new Set(previous.map((item) => item.id));
        const fresh = batch.filter((item) => !known.has(item.id));
        return fresh.length ? [...fresh, ...previous].slice(0, 30) : previous;
      });
    });
  }, [profile?.id]);

  const handleItemClick = async (notification) => {
    setOpen(false);
    if (!notification.read_at) {
      setItems((previous) => previous.map((item) => (
        item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item
      )));
      markNotificationRead(notification.id).catch(() => {});
    }
    if (notification.link) navigate(notification.link);
  };

  const handleMarkAllRead = async () => {
    const now = new Date().toISOString();
    setItems((previous) => previous.map((item) => ({ ...item, read_at: item.read_at || now })));
    try {
      await markAllNotificationsRead();
    } catch {
      load();
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((value) => !value); if (!open) load(); }}
        className="neu-btn neu-btn-ghost neu-btn-icon relative"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      >
        <MdNotifications className="w-5 h-5" />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={spring}
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-extrabold"
            style={{ background: 'var(--neu-coral)', color: '#fff' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              className="absolute right-0 mt-3 w-[22rem] max-w-[calc(100vw-2rem)] z-50 neu-card !p-0 overflow-hidden"
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={spring}
            >
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: '1px solid var(--neu-line)' }}
              >
                <p className="text-sm font-bold mb-0" style={{ color: 'var(--neu-ink)' }}>
                  Notifications
                </p>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="flex items-center gap-1 text-xs font-semibold"
                    style={{ color: 'var(--neu-primary)' }}
                  >
                    <MdDoneAll className="w-4 h-4" /> Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto">
                {loading && items.length === 0 ? (
                  <div className="py-10 flex justify-center"><div className="neu-spinner" /></div>
                ) : items.length === 0 ? (
                  <div className="py-10 text-center px-6">
                    <MdNotifications
                      className="w-8 h-8 mx-auto mb-2"
                      style={{ color: 'var(--neu-ink-muted)', opacity: 0.5 }}
                    />
                    <p className="text-sm mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
                      Nothing new right now.
                    </p>
                  </div>
                ) : (
                  items.map((notification) => {
                    const tone = TYPE_TONES[notification.type] || TYPE_TONES.info;
                    const Icon = tone.icon;
                    return (
                      <button
                        key={notification.id}
                        onClick={() => handleItemClick(notification)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors"
                        style={{
                          borderBottom: '1px solid var(--neu-line)',
                          background: notification.read_at
                            ? 'transparent'
                            : 'color-mix(in srgb, var(--neu-bg-deep) 55%, transparent)',
                        }}
                      >
                        <span
                          className="p-1.5 rounded-xl shrink-0"
                          style={{ color: tone.color, boxShadow: 'var(--neu-inset-subtle)' }}
                        >
                          <Icon className="w-4 h-4" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span
                            className="block text-sm truncate"
                            style={{
                              color: notification.read_at ? 'var(--neu-ink-soft)' : 'var(--neu-ink)',
                              fontWeight: notification.read_at ? 500 : 700,
                            }}
                          >
                            {notification.title}
                          </span>
                          {notification.body && (
                            <span
                              className="block text-xs line-clamp-2"
                              style={{ color: 'var(--neu-ink-muted)' }}
                            >
                              {notification.body}
                            </span>
                          )}
                          <span className="block text-[11px] mt-0.5" style={{ color: 'var(--neu-ink-muted)' }}>
                            {timeAgo(notification.created_at)}
                          </span>
                        </span>
                        {!notification.read_at && (
                          <span
                            className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                            style={{ background: 'var(--neu-primary)' }}
                          />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
