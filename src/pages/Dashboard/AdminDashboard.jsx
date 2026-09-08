import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  MdPeople, MdSchool, MdAttachMoney, MdEventNote, MdRefresh,
  MdPersonAdd, MdChecklist, MdSummarize, MdMessage, MdCheckCircle, MdRadioButtonUnchecked,
} from 'react-icons/md';

import { useAppData } from '../../hooks/useAppData';
import api from '../../lib/api';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import {
  StatCard, SkeletonCard, ChartTooltip, QuickActionsGrid, ActivityFeed,
  useDashboardFeeds, greetingFor, todayLong,
} from './shared';

const quickActions = [
  { label: 'Add Student', icon: MdPersonAdd, path: '/students' },
  { label: 'View Attendance', icon: MdChecklist, path: '/attendance' },
  { label: 'Generate Report', icon: MdSummarize, path: '/performance-analysis' },
  { label: 'Message Parents', icon: MdMessage, path: '/communication' },
];

export default function AdminDashboard({ profile }) {
  const navigate = useNavigate();
  const { dashboardData, loadDashboard, loadInstitution, institution, isLoading } = useAppData();
  const { activityLog, activityLoading, chartData, chartLoading, hasAnnouncement, refresh } = useDashboardFeeds(profile?.institution_id);

  const [refreshing, setRefreshing] = useState(false);
  const [checklistDismissed, setChecklistDismissed] = useState(false);

  const canManageOnboarding = ['institution_admin', 'principal'].includes(profile?.role);
  const onboardingDismissed = Boolean(institution?.settings?.onboarding?.checklist_dismissed_at) || checklistDismissed;
  const onboardingTasks = [
    {
      key: 'institution', label: 'Confirm institution profile', description: 'Add contact email and phone in settings.',
      done: Boolean(institution?.email && institution?.phone), path: '/settings',
    },
    {
      key: 'students', label: 'Add first students', description: 'Create student records for the tenant.',
      done: (dashboardData?.totalStudents || 0) > 0, path: '/students',
    },
    {
      key: 'attendance', label: 'Mark first attendance', description: 'Start daily attendance tracking.',
      done: (dashboardData?.presentToday || 0) > 0, path: '/attendance',
    },
    {
      key: 'fees', label: 'Record first payment', description: 'Validate fee collection workflow.',
      done: (dashboardData?.totalFeesCollected || 0) > 0, path: '/fees',
    },
    {
      key: 'communication', label: 'Send first announcement', description: 'Test communication with the school community.',
      done: hasAnnouncement, path: '/communication',
    },
  ];
  const completedOnboardingTasks = onboardingTasks.filter((task) => task.done).length;
  const showOnboardingChecklist = canManageOnboarding && !onboardingDismissed && completedOnboardingTasks < onboardingTasks.length;

  const dismissOnboardingChecklist = async () => {
    if (!profile?.institution_id || !institution) return;
    setChecklistDismissed(true);
    const nextSettings = {
      ...(institution.settings || {}),
      onboarding: { ...(institution.settings?.onboarding || {}), checklist_dismissed_at: new Date().toISOString() },
    };
    try {
      await api.put('/institutions/settings', { settings: nextSettings });
      loadInstitution();
    } catch (err) {
      console.error('dismiss checklist failed:', err.response?.data?.error || err.message);
    }
  };

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
          <p className="text-[#0E7C7B] text-xs font-extrabold uppercase tracking-[0.18em] mb-2">Command Center</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-950 mb-2">{greetingFor(profile)}</h1>
          <p className="text-slate-500 text-sm">{todayLong()}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleRefresh} loading={refreshing} className="flex items-center gap-2">
          <MdRefresh className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {showOnboardingChecklist && (
        <GlassCard className="p-6 border border-[#0E7C7B]/20 bg-[#EEF7F6]/70">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-5">
            <div>
              <p className="text-[#0E7C7B] text-xs font-extrabold uppercase tracking-[0.18em] mb-2">First Login Setup</p>
              <h2 className="text-xl font-bold text-slate-950 mb-1">Launch checklist</h2>
              <p className="text-sm text-slate-500 mb-0">{completedOnboardingTasks} of {onboardingTasks.length} setup tasks completed.</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={dismissOnboardingChecklist}>Dismiss</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            {onboardingTasks.map((task) => {
              const Icon = task.done ? MdCheckCircle : MdRadioButtonUnchecked;
              return (
                <button
                  key={task.key}
                  type="button"
                  onClick={() => navigate(task.path)}
                  className={`text-left rounded-xl border p-4 transition-all ${task.done ? 'border-emerald-200 bg-white/80' : 'border-slate-200 bg-white hover:border-[#0E7C7B]/30'}`}
                >
                  <Icon className={`w-5 h-5 mb-3 ${task.done ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <p className="font-bold text-slate-950 text-sm mb-1">{task.label}</p>
                  <p className="text-xs text-slate-500 mb-0">{task.description}</p>
                </button>
              );
            })}
          </div>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsLoading ? (
          <>
            <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
          </>
        ) : (
          <>
            <StatCard icon={MdPeople} label="Total Students" value={dashboardData?.totalStudents ?? 0} subtitle="enrolled" accent="#4059AD" color="bg-[#EEF4FF] text-[#4059AD]" />
            <StatCard icon={MdSchool} label="Attendance Today" value={dashboardData?.attendancePercentage ?? 0} format={(v) => `${Math.round(v)}%`} subtitle={`${dashboardData?.presentToday ?? 0} present`} accent="#16845D" color="bg-emerald-50 text-emerald-700" />
            <StatCard icon={MdAttachMoney} label="Fees Collected" value={dashboardData?.totalFeesCollected ?? 0} format={(v) => `Rs ${Math.round(v).toLocaleString('en-IN')}`} subtitle={`Rs ${(dashboardData?.totalFeesDue ?? 0).toLocaleString('en-IN')} pending`} accent="#E0644A" color="bg-orange-50 text-[#E0644A]" />
            <StatCard icon={MdEventNote} label="Active Exams" value={dashboardData?.activeExams ?? 0} subtitle="currently running" accent="#6F5BD7" color="bg-violet-50 text-[#6F5BD7]" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GlassCard className="lg:col-span-2 p-6">
          <h2 className="text-xl font-bold text-slate-950 mb-4">Attendance — Last 7 Days</h2>
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
