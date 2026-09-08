import { useCallback, useEffect, useState } from 'react';
import GlassCard from '../../components/Common/GlassCard';
import useCountUp from '../../hooks/useCountUp';
import api from '../../lib/api';

/** Shared activity-log + 7-day attendance-trend fetch, used by every role's dashboard. */
export function useDashboardFeeds(institutionId) {
  const [activityLog, setActivityLog] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [hasAnnouncement, setHasAnnouncement] = useState(false);

  const fetchActivityLog = useCallback(async () => {
    if (!institutionId) return;
    setActivityLoading(true);
    try {
      const { data } = await api.get('/dashboard/activity');
      setActivityLog(data.log || []);
      setHasAnnouncement(Boolean(data.hasAnnouncement));
    } catch (err) {
      console.error('activity_log fetch error:', err.response?.data?.error || err.message);
    } finally {
      setActivityLoading(false);
    }
  }, [institutionId]);

  const fetchAttendanceTrend = useCallback(async () => {
    if (!institutionId) return;
    setChartLoading(true);
    try {
      const { data } = await api.get('/dashboard/attendance-trend');
      setChartData(data || []);
    } catch (err) {
      console.error('attendance trend fetch error:', err.response?.data?.error || err.message);
    } finally {
      setChartLoading(false);
    }
  }, [institutionId]);

  useEffect(() => {
    fetchActivityLog();
    fetchAttendanceTrend();
  }, [fetchActivityLog, fetchAttendanceTrend]);

  const refresh = useCallback(async () => {
    await Promise.all([fetchActivityLog(), fetchAttendanceTrend()]);
  }, [fetchActivityLog, fetchAttendanceTrend]);

  return { activityLog, activityLoading, chartData, chartLoading, hasAnnouncement, refresh };
}

// ── Skeleton card shown while loading ─────────────────────────
export function SkeletonCard() {
  return (
    <GlassCard className="p-6 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          <div className="h-3 bg-white/10 rounded w-24" />
          <div className="h-8 bg-white/10 rounded w-16" />
          <div className="h-2 bg-white/10 rounded w-20" />
        </div>
        <div className="w-12 h-12 bg-white/10 rounded-lg" />
      </div>
    </GlassCard>
  );
}

// ── Individual stat card ───────────────────────────────────────
export function StatCard({
  icon: Icon,
  label,
  value,
  format = (v) => Math.round(v).toLocaleString('en-IN'),
  subtitle,
  accent = '#0E7C7B',
  color,
}) {
  const animated = useCountUp(value);
  return (
    <GlassCard
      className="p-6 border-l-4 hover:-translate-y-1 cursor-default"
      style={{ borderLeftColor: accent }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-500 text-sm font-semibold mb-2">{label}</p>
          <p className="text-3xl font-extrabold text-slate-950 tabular-nums">{format(animated)}</p>
          {subtitle && (
            <p className="text-xs mt-2 text-slate-500">{subtitle}</p>
          )}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </GlassCard>
  );
}

// ── Custom recharts tooltip ────────────────────────────────────
export function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900/90 border border-white/10 rounded-lg px-3 py-2 text-xs text-white shadow-lg">
      <p className="text-white/60 mb-1">{label}</p>
      <p>
        <span className="text-cyan-400 font-semibold">{payload[0].value}</span>
        <span className="text-white/40 ml-1">present</span>
      </p>
    </div>
  );
}

// ── Activity type → colour dot ─────────────────────────────────
const ACTION_COLORS = {
  create: 'bg-emerald-400',
  update: 'bg-blue-400',
  delete: 'bg-red-400',
  login: 'bg-purple-400',
  payment: 'bg-yellow-400',
};

export function activityDotColor(action = '') {
  const lower = action.toLowerCase();
  for (const [key, cls] of Object.entries(ACTION_COLORS)) {
    if (lower.includes(key)) return cls;
  }
  return 'bg-white/40';
}

export function formatTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Quick Actions grid, shared shell for every role's dashboard ──
export function QuickActionsGrid({ actions, navigate }) {
  return (
    <GlassCard className="p-6">
      <h2 className="text-xl font-bold text-slate-950 mb-4">Quick Actions</h2>
      <div className="grid grid-cols-2 gap-3">
        {actions.map(({ label, icon: Icon, path }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="flex flex-col items-center gap-2 p-4 rounded-lg border border-slate-200
                       hover:bg-[#EEF7F6] hover:border-[#0E7C7B]/30 transition-all
                       text-slate-500 hover:text-[#0E7C7B] text-xs font-semibold"
          >
            <Icon className="w-5 h-5" />
            <span className="text-center leading-tight">{label}</span>
          </button>
        ))}
      </div>
    </GlassCard>
  );
}

// ── Recent activity feed, shared shell ────────────────────────
export function ActivityFeed({ loading, log }) {
  return (
    <GlassCard className="p-6">
      <h2 className="text-xl font-bold text-slate-950 mb-4">Recent Activity</h2>
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 animate-pulse">
              <div className="w-2 h-2 rounded-full bg-white/10 flex-shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-3 bg-white/10 rounded w-3/4" />
                <div className="h-2 bg-white/10 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : log.length === 0 ? (
        <p className="text-white/30 text-sm text-center py-4">No activity recorded yet.</p>
      ) : (
        <div className="space-y-3">
          {log.map((entry) => (
            <div key={entry.id} className="flex items-start gap-4 pb-3 border-b border-white/5 last:border-0">
              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${activityDotColor(entry.action)}`} />
              <div className="flex-1 min-w-0">
                <p className="text-white/80 text-sm truncate">{entry.description || entry.action}</p>
                {entry.entity_type && <p className="text-white/30 text-xs capitalize">{entry.entity_type}</p>}
              </div>
              <span className="text-white/30 text-xs whitespace-nowrap flex-shrink-0">{formatTimeAgo(entry.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

export function greetingFor(profile) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return `${greeting}, ${profile?.first_name || 'User'}!`;
}

export function todayLong() {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
