import { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import { useAppData } from '../../hooks/useAppData';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import {
  MdCheckCircle,
  MdCancel,
  MdSchedule,
  MdSave,
  MdFilterList,
  MdCalendarToday,
  MdWarning,
  MdPeople,
} from 'react-icons/md';

// Format date as YYYY-MM-DD
const toDateStr = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const TODAY = toDateStr(new Date());

// Get last N days as YYYY-MM-DD array, most-recent first
const getLastNDays = (n) => {
  const days = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(toDateStr(d));
  }
  return days;
};

function AttStatusBadge({ status }) {
  const map = {
    present: {
      cls: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
      icon: <MdCheckCircle className="w-3 h-3 inline mr-1" />,
      label: 'Present',
    },
    absent: {
      cls: 'bg-red-500/15 text-red-300 border border-red-500/30',
      icon: <MdCancel className="w-3 h-3 inline mr-1" />,
      label: 'Absent',
    },
    late: {
      cls: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
      icon: <MdSchedule className="w-3 h-3 inline mr-1" />,
      label: 'Late',
    },
  };
  const item = map[status];
  if (!item) return <span className="text-white/30 text-xs">—</span>;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.cls}`}>
      {item.icon}{item.label}
    </span>
  );
}

function ToggleGroup({ value, onChange }) {
  const options = [
    { key: 'present', label: 'P', title: 'Present', active: 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50', idle: 'hover:bg-emerald-500/10 text-white/40 hover:text-emerald-300' },
    { key: 'absent', label: 'A', title: 'Absent', active: 'bg-red-500/30 text-red-300 border-red-500/50', idle: 'hover:bg-red-500/10 text-white/40 hover:text-red-300' },
    { key: 'late', label: 'L', title: 'Late', active: 'bg-amber-500/30 text-amber-300 border-amber-500/50', idle: 'hover:bg-amber-500/10 text-white/40 hover:text-amber-300' },
  ];
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={o.key}
          title={o.title}
          onClick={() => onChange(o.key)}
          className={`w-8 h-8 rounded text-xs font-bold border transition ${
            value === o.key ? o.active : `border-white/10 ${o.idle}`
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function AttendancePage() {
  const { students, loadStudents } = useAppData();
  const { profile } = useAuth();
  const notification = useNotification();

  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [classFilter, setClassFilter] = useState('');

  // Attendance records loaded for selected date { [student_id]: {status, id} }
  const [attendanceMap, setAttendanceMap] = useState({});
  // Working copy for bulk marking { [student_id]: status }
  const [markingMap, setMarkingMap] = useState({});

  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState(null);

  // Monthly overview: { [date]: { present, total } }
  const [monthlyData, setMonthlyData] = useState({});
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  // Load students once
  useEffect(() => {
    const load = async () => {
      setLoadingStudents(true);
      try {
        await loadStudents(profile?.institution_id);
      } catch (err) {
        setPageError(err.message || 'Failed to load students');
      } finally {
        setLoadingStudents(false);
      }
    };
    if (profile?.institution_id) load();
  }, [profile?.institution_id]);

  // Load attendance for selected date
  const loadAttendanceForDate = useCallback(async (date) => {
    if (!profile?.institution_id) return;
    setLoadingAttendance(true);
    try {
      const { data } = await api.get('/attendance', { params: { date } });
      const map = {};
      (data || []).forEach((rec) => {
        map[rec.student_id] = { status: rec.status, id: rec.id };
      });
      setAttendanceMap(map);
      // Pre-fill marking map from saved data
      const marking = {};
      (students || []).forEach((s) => {
        marking[s.id] = map[s.id]?.status || 'present';
      });
      setMarkingMap(marking);
    } catch (err) {
      notification.error(err.message || 'Failed to load attendance');
    } finally {
      setLoadingAttendance(false);
    }
  }, [profile?.institution_id, students]);

  useEffect(() => {
    if (!loadingStudents) {
      loadAttendanceForDate(selectedDate);
    }
  }, [selectedDate, loadingStudents]);

  // Load monthly overview (last 30 days)
  const loadMonthlyOverview = useCallback(async () => {
    if (!profile?.institution_id) return;
    setLoadingMonthly(true);
    try {
      const thirtyDaysAgo = toDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      const { data } = await api.get('/attendance/range', { params: { from: thirtyDaysAgo, to: TODAY } });
      // The endpoint returns one row per (date, status) with a count, rather
      // than one row per student — a 30-day range is thousands of records.
      const grouped = {};
      (data || []).forEach((rec) => {
        const count = Number(rec.total) || 0;
        if (!grouped[rec.date]) grouped[rec.date] = { present: 0, total: 0 };
        grouped[rec.date].total += count;
        if (rec.status === 'present') grouped[rec.date].present += count;
      });
      setMonthlyData(grouped);
    } catch (err) {
      // Non-critical — silently fail for overview
      console.error('Monthly overview load failed:', err.message);
    } finally {
      setLoadingMonthly(false);
    }
  }, [profile?.institution_id]);

  useEffect(() => {
    if (profile?.institution_id) loadMonthlyOverview();
  }, [profile?.institution_id]);

  const handleSaveAttendance = async () => {
    if (!profile?.institution_id || !profile?.id) {
      notification.error('Missing profile information');
      return;
    }
    setSaving(true);
    try {
      const filtered = displayedStudents;
      if (filtered.length === 0) {
        notification.error('No students to mark attendance for');
        return;
      }
      const records = filtered.map((s) => ({
        student_id: s.id,
        class_name: s.class_name,
        date: selectedDate,
        status: markingMap[s.id] || 'present',
      }));
      await api.post('/attendance/mark', { records });
      notification.success(`Attendance saved for ${records.length} student(s) on ${selectedDate}`);
      await loadAttendanceForDate(selectedDate);
      await loadMonthlyOverview();
    } catch (err) {
      notification.error(err.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  // Derived: unique class names
  const classOptions = [...new Set((students || []).map((s) => s.class_name).filter(Boolean))].sort();

  const displayedStudents = (students || []).filter(
    (s) => !classFilter || s.class_name === classFilter
  );

  // Summary counts from markingMap (for displayed students)
  const summary = displayedStudents.reduce(
    (acc, s) => {
      const status = markingMap[s.id] || 'present';
      acc[status] = (acc[status] || 0) + 1;
      acc.total += 1;
      return acc;
    },
    { present: 0, absent: 0, late: 0, total: 0 }
  );
  const attendancePct =
    summary.total > 0 ? Math.round((summary.present / summary.total) * 100) : 0;

  // Last 30 days for mini-calendar
  const last30Days = getLastNDays(30).reverse();

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Attendance</h1>
            <p className="text-white/50 text-sm mt-1">Mark and track daily attendance</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <MdCalendarToday className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="date"
                className="input-glass pl-9 py-2 text-sm"
                value={selectedDate}
                max={TODAY}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
            <Button
              variant="primary"
              loading={saving}
              disabled={loadingStudents || loadingAttendance || displayedStudents.length === 0}
              onClick={handleSaveAttendance}
            >
              <MdSave className="inline mr-1.5 w-4 h-4" /> Save Attendance
            </Button>
          </div>
        </div>

        {pageError && (
          <GlassCard className="p-4 border border-red-500/30">
            <div className="flex items-center gap-3 text-red-400">
              <MdWarning className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{pageError}</p>
            </div>
          </GlassCard>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <GlassCard className="p-4">
            <p className="text-white/50 text-xs mb-1 uppercase tracking-wider">Present</p>
            <p className="text-2xl font-bold text-emerald-400">{summary.present}</p>
          </GlassCard>
          <GlassCard className="p-4">
            <p className="text-white/50 text-xs mb-1 uppercase tracking-wider">Absent</p>
            <p className="text-2xl font-bold text-red-400">{summary.absent}</p>
          </GlassCard>
          <GlassCard className="p-4">
            <p className="text-white/50 text-xs mb-1 uppercase tracking-wider">Late</p>
            <p className="text-2xl font-bold text-amber-400">{summary.late}</p>
          </GlassCard>
          <GlassCard className="p-4">
            <p className="text-white/50 text-xs mb-1 uppercase tracking-wider">Attendance %</p>
            <p className={`text-2xl font-bold ${
              attendancePct >= 75 ? 'text-emerald-400' : attendancePct >= 50 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {attendancePct}%
            </p>
          </GlassCard>
        </div>

        {/* Class filter + bulk actions */}
        <GlassCard className="p-4">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-3">
              <MdFilterList className="w-4 h-4 text-white/40" />
              <select
                className="input-glass py-2 text-sm min-w-[140px]"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
              >
                <option value="">All Classes</option>
                {classOptions.map((c) => (
                  <option key={c} value={c}>Class {c}</option>
                ))}
              </select>
              <span className="text-white/40 text-xs">
                {displayedStudents.length} student(s)
              </span>
            </div>
            <div className="flex gap-2">
              <button
                className="text-xs px-3 py-1.5 rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition"
                onClick={() => {
                  const m = { ...markingMap };
                  displayedStudents.forEach((s) => { m[s.id] = 'present'; });
                  setMarkingMap(m);
                }}
              >
                Mark All Present
              </button>
              <button
                className="text-xs px-3 py-1.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition"
                onClick={() => {
                  const m = { ...markingMap };
                  displayedStudents.forEach((s) => { m[s.id] = 'absent'; });
                  setMarkingMap(m);
                }}
              >
                Mark All Absent
              </button>
            </div>
          </div>
        </GlassCard>

        {/* Attendance Table */}
        <GlassCard className="p-0 overflow-hidden">
          {loadingStudents || loadingAttendance ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center space-y-3">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white/70 rounded-full animate-spin mx-auto" />
                <p className="text-white/50 text-sm">
                  {loadingStudents ? 'Loading students...' : 'Loading attendance...'}
                </p>
              </div>
            </div>
          ) : displayedStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <MdPeople className="w-10 h-10 text-white/20" />
              <p className="text-white/40 text-sm">
                {classFilter ? `No students in class ${classFilter}` : 'No students found'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/3">
                    <th className="text-left py-3 px-4 text-white/50 font-medium">#</th>
                    <th className="text-left py-3 px-4 text-white/50 font-medium">Student</th>
                    <th className="text-left py-3 px-4 text-white/50 font-medium">Adm. No</th>
                    <th className="text-left py-3 px-4 text-white/50 font-medium">Class</th>
                    <th className="text-left py-3 px-4 text-white/50 font-medium">Saved Status</th>
                    <th className="text-left py-3 px-4 text-white/50 font-medium">Mark</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedStudents.map((student, idx) => {
                    const savedStatus = attendanceMap[student.id]?.status;
                    const currentMark = markingMap[student.id] || 'present';
                    return (
                      <tr
                        key={student.id}
                        className="border-b border-white/5 hover:bg-white/3 transition-colors"
                      >
                        <td className="py-3 px-4 text-white/30 text-xs">{idx + 1}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 flex items-center justify-center text-xs font-bold text-white/60 flex-shrink-0">
                              {(student.first_name?.[0] || '').toUpperCase()}
                            </div>
                            <p className="text-white font-medium">
                              {student.first_name} {student.last_name}
                            </p>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-white/50 font-mono text-xs">
                          {student.admission_no || '—'}
                        </td>
                        <td className="py-3 px-4 text-white/70">
                          {student.class_name ? `Class ${student.class_name}` : '—'}
                          {student.section ? ` ${student.section}` : ''}
                        </td>
                        <td className="py-3 px-4">
                          {savedStatus
                            ? <AttStatusBadge status={savedStatus} />
                            : <span className="text-white/25 text-xs italic">Not marked</span>}
                        </td>
                        <td className="py-3 px-4">
                          <ToggleGroup
                            value={currentMark}
                            onChange={(status) =>
                              setMarkingMap((prev) => ({ ...prev, [student.id]: status }))
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

        {/* Monthly Overview — last 30 days */}
        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">Last 30 Days Overview</h2>
            {loadingMonthly && (
              <div className="w-4 h-4 border border-white/20 border-t-white/50 rounded-full animate-spin" />
            )}
          </div>
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
            {last30Days.map((date) => {
              const day = monthlyData[date];
              const pct = day && day.total > 0
                ? Math.round((day.present / day.total) * 100)
                : null;
              const isToday = date === TODAY;
              const isSelected = date === selectedDate;
              let bg = 'bg-white/5';
              if (pct !== null) {
                if (pct >= 90) bg = 'bg-emerald-500/30';
                else if (pct >= 75) bg = 'bg-emerald-500/15';
                else if (pct >= 50) bg = 'bg-amber-500/20';
                else bg = 'bg-red-500/20';
              }
              return (
                <button
                  key={date}
                  title={`${date}${pct !== null ? ` — ${pct}% present` : ' — no data'}`}
                  onClick={() => setSelectedDate(date)}
                  className={`relative p-1.5 rounded text-center transition hover:ring-1 hover:ring-white/20 ${bg} ${
                    isSelected ? 'ring-1 ring-blue-400/60' : ''
                  } ${isToday ? 'ring-1 ring-white/30' : ''}`}
                >
                  <p className="text-white/60 text-xs font-medium">
                    {new Date(date + 'T00:00:00').getDate()}
                  </p>
                  {pct !== null ? (
                    <p className={`text-xs font-bold ${
                      pct >= 75 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {pct}%
                    </p>
                  ) : (
                    <p className="text-white/20 text-xs">—</p>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/10">
            <div className="flex items-center gap-1.5 text-xs text-white/50">
              <div className="w-3 h-3 rounded bg-emerald-500/30" /> &ge;90%
            </div>
            <div className="flex items-center gap-1.5 text-xs text-white/50">
              <div className="w-3 h-3 rounded bg-emerald-500/15" /> 75–89%
            </div>
            <div className="flex items-center gap-1.5 text-xs text-white/50">
              <div className="w-3 h-3 rounded bg-amber-500/20" /> 50–74%
            </div>
            <div className="flex items-center gap-1.5 text-xs text-white/50">
              <div className="w-3 h-3 rounded bg-red-500/20" /> &lt;50%
            </div>
            <div className="flex items-center gap-1.5 text-xs text-white/50">
              <div className="w-3 h-3 rounded bg-white/5" /> No data
            </div>
          </div>
        </GlassCard>
      </div>
    </MainLayout>
  );
}
