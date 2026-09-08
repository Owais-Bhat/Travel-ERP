import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { MdPeople, MdSchool, MdEventNote, MdRefresh, MdChecklist, MdMenuBook, MdGrade } from 'react-icons/md';

import { useAppData } from '../../hooks/useAppData';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import {
  StatCard, SkeletonCard, ChartTooltip, QuickActionsGrid, ActivityFeed,
  useDashboardFeeds, greetingFor, todayLong,
} from './shared';

const quickActions = [
  { label: 'Mark Attendance', icon: MdChecklist, path: '/attendance' },
  { label: 'My Classes', icon: MdPeople, path: '/students' },
  { label: 'Create Homework', icon: MdMenuBook, path: '/homework' },
  { label: 'Enter Exam Marks', icon: MdGrade, path: '/exams' },
];

export default function TeacherDashboard({ profile }) {
  const navigate = useNavigate();
  const { dashboardData, loadDashboard, isLoading } = useAppData();
  const { activityLog, activityLoading, chartData, chartLoading, refresh } = useDashboardFeeds(profile?.institution_id);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadDashboard(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
          <p className="text-[#0E7C7B] text-xs font-extrabold uppercase tracking-[0.18em] mb-2">Teacher Workspace</p>
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
            <StatCard icon={MdPeople} label="Students in My Classes" value={dashboardData?.totalStudents ?? 0} subtitle="across my sections" accent="#4059AD" color="bg-[#EEF4FF] text-[#4059AD]" />
            <StatCard icon={MdSchool} label="Today's Attendance" value={dashboardData?.attendancePercentage ?? 0} format={(v) => `${Math.round(v)}%`} subtitle={`${dashboardData?.presentToday ?? 0} present`} accent="#16845D" color="bg-emerald-50 text-emerald-700" />
            <StatCard icon={MdEventNote} label="Upcoming Exams" value={dashboardData?.activeExams ?? 0} subtitle="for my classes" accent="#6F5BD7" color="bg-violet-50 text-[#6F5BD7]" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GlassCard className="lg:col-span-2 p-6">
          <h2 className="text-xl font-bold text-slate-950 mb-4">My Classes — Attendance, Last 7 Days</h2>
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
