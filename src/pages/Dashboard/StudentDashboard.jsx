import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { MdSchool, MdAttachMoney, MdEventNote, MdRefresh, MdCalendarMonth, MdMenuBook, MdAssessment, MdLightbulb } from 'react-icons/md';

import { useAppData } from '../../hooks/useAppData';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import {
  StatCard, SkeletonCard, ChartTooltip, QuickActionsGrid, ActivityFeed,
  useDashboardFeeds, greetingFor, todayLong,
} from './shared';

const quickActions = [
  { label: 'View Timetable', icon: MdCalendarMonth, path: '/timetable' },
  { label: 'View Homework', icon: MdMenuBook, path: '/homework' },
  { label: 'View Report Card', icon: MdAssessment, path: '/report-cards' },
  { label: 'Ask AI Tutor', icon: MdLightbulb, path: '/ai-tutor' },
];

export default function StudentDashboard({ profile }) {
  const navigate = useNavigate();
  const { dashboardData, loadDashboard, isLoading } = useAppData();
  const { activityLog, activityLoading, chartData, chartLoading, refresh } = useDashboardFeeds(profile?.institution_id);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadDashboard(), refresh()]);
    setRefreshing(false);
  };

  const statsLoading = isLoading && !dashboardData;

  return (
    <div className="p-5 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[#0E7C7B] text-xs font-extrabold uppercase tracking-[0.18em] mb-2">My Dashboard</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-950 mb-2">{greetingFor(profile)}</h1>
          <p className="text-slate-500 text-sm">{todayLong()}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleRefresh} loading={refreshing} className="flex items-center gap-2">
          <MdRefresh className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {statsLoading ? (
          <>
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </>
        ) : (
          <>
            <StatCard icon={MdSchool} label="My Attendance" value={dashboardData?.attendancePercentage ?? 0} format={(v) => `${Math.round(v)}%`} subtitle="today" accent="#16845D" color="bg-emerald-50 text-emerald-700" />
            <StatCard icon={MdAttachMoney} label="Fees Due" value={dashboardData?.totalFeesDue ?? 0} format={(v) => `Rs ${Math.round(v).toLocaleString('en-IN')}`} subtitle={`Rs ${(dashboardData?.totalFeesCollected ?? 0).toLocaleString('en-IN')} paid`} accent="#E0644A" color="bg-orange-50 text-[#E0644A]" />
            <StatCard icon={MdEventNote} label="Upcoming Exams" value={dashboardData?.activeExams ?? 0} subtitle="for my class" accent="#6F5BD7" color="bg-violet-50 text-[#6F5BD7]" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GlassCard className="lg:col-span-2 p-6">
          <h2 className="text-xl font-bold text-slate-950 mb-4">My Attendance — Last 7 Days</h2>
          {chartLoading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-teal-700/20 border-t-teal-700 rounded-full animate-spin" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No attendance data available yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="present" fill="#0E7C7B" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </GlassCard>

        <QuickActionsGrid actions={quickActions} navigate={navigate} />
      </div>

      <ActivityFeed loading={activityLoading} log={activityLog} />
    </div>
  );
}
