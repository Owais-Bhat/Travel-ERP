import { useCallback, useMemo, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, BarChart, Bar, Legend,
} from 'recharts';
import {
  MdAssessment, MdDownload, MdPeople, MdBusiness, MdContactPhone,
  MdCardGiftcard, MdHandshake, MdPayments, MdWorkspacePremium, MdEventSeat,
} from 'react-icons/md';
import MainLayout from '../../components/Layout/MainLayout';
import PageHeader from '../../components/Common/PageHeader';
import StatCard from '../../components/Common/StatCard';
import Surface from '../../components/Common/Surface';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import Select from '../../components/Common/Select';
import Tabs from '../../components/Common/Tabs';
import { Reveal, Stagger, StaggerItem } from '../../components/Common/Motion';
import { useEndpoint } from '../../hooks/useResource';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { API_BASE_URL } from '../../config';
import { getToken } from '../../lib/api';

const METRICS = [
  { key: 'admissions', label: 'Admissions' },
  { key: 'leads', label: 'Leads' },
  { key: 'fees', label: 'Fee collection' },
  { key: 'scholarships', label: 'Scholarships' },
];

const EXPORTS = [
  { key: 'admissions', label: 'Admissions', icon: MdBusiness },
  { key: 'leads', label: 'Leads', icon: MdContactPhone },
  { key: 'students', label: 'Students', icon: MdPeople },
  { key: 'scholarships', label: 'Scholarships', icon: MdCardGiftcard },
  { key: 'commissions', label: 'Commissions', icon: MdHandshake },
  { key: 'certifications', label: 'Certifications', icon: MdWorkspacePremium },
];

const today = () => new Date().toISOString().slice(0, 10);
const monthsAgo = (count) => {
  const date = new Date();
  date.setMonth(date.getMonth() - count);
  return date.toISOString().slice(0, 10);
};

/** Recharts needs concrete colours, so read the live theme tokens. */
function themeColor(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name);
  return value?.trim() || fallback;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="px-3 py-2 text-xs"
      style={{
        borderRadius: 'var(--neu-radius-sm)',
        background: 'var(--neu-bg)',
        boxShadow: 'var(--neu-e2)',
        color: 'var(--neu-ink)',
      }}
    >
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="mb-0" style={{ color: entry.color }}>
          {entry.name}: {Number(entry.value).toLocaleString()}
        </p>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const notification = useNotification();

  const [range, setRange] = useState({ from: monthsAgo(12), to: today() });
  const [metric, setMetric] = useState('admissions');
  const [downloading, setDownloading] = useState('');

  const rangeParams = useMemo(() => ({ from: range.from, to: range.to }), [range]);
  const overview = useEndpoint('/reports/overview', { params: rangeParams });
  const trends = useEndpoint('/reports/trends', { params: { ...rangeParams, metric } });

  const colors = useMemo(() => ({
    primary: themeColor('--neu-primary', '#4059ad'),
    teal: themeColor('--neu-teal', '#0e7c7b'),
    coral: themeColor('--neu-coral', '#e0644a'),
    line: themeColor('--neu-line', 'rgba(146,158,182,0.28)'),
    muted: themeColor('--neu-ink-muted', '#7c889e'),
  }), []);

  const series = trends.data?.series || [];

  const download = useCallback(async (report) => {
    setDownloading(report);
    try {
      // Streamed as a blob so the CSV keeps its filename and encoding.
      const response = await api.get(`/reports/${report}`, {
        params: { ...rangeParams, format: 'csv' },
        responseType: 'blob',
      });

      const url = URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${report}-${range.from}-to-${range.to}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      notification.success(`${report} exported`);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Export failed');
    } finally {
      setDownloading('');
    }
  }, [rangeParams, range, notification]);

  const data = overview.data || {};

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 space-y-6 scene">
        <PageHeader
          title="Reports & Analytics"
          subtitle="One view across admissions, CRM, money and credentials"
          icon={MdAssessment}
          actions={
            <div className="flex flex-wrap items-end gap-2">
              <Input
                label="From"
                type="date"
                wrapperClass="mb-0"
                value={range.from}
                onChange={(event) => setRange((r) => ({ ...r, from: event.target.value }))}
              />
              <Input
                label="To"
                type="date"
                wrapperClass="mb-0"
                value={range.to}
                onChange={(event) => setRange((r) => ({ ...r, to: event.target.value }))}
              />
            </div>
          }
        />

        {overview.error && (
          <div className="neu-alert neu-alert-error"><span>{overview.error}</span></div>
        )}

        <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StaggerItem>
            <StatCard
              label="Active students"
              value={Number(data.students?.active) || 0}
              icon={MdPeople}
              hint={`${Number(data.students?.total) || 0} on record`}
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label="Applications"
              value={Number(data.admissions?.total) || 0}
              icon={MdBusiness}
              tone="violet"
              hint={`${Number(data.admissions?.approval_rate) || 0}% approved`}
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label="Fees collected"
              value={Number(data.fees?.collected) || 0}
              prefix="₹"
              tone="success"
              icon={MdPayments}
              hint={`of ₹${Number(data.fees?.billed || 0).toLocaleString()} billed`}
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label="Lead conversion"
              value={Number(data.leads?.conversion_rate) || 0}
              suffix="%"
              decimals={1}
              tone="teal"
              icon={MdContactPhone}
              hint={`${Number(data.leads?.won) || 0} of ${Number(data.leads?.total) || 0}`}
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label="Scholarships awarded"
              value={Number(data.scholarships?.awarded_total) || 0}
              prefix="₹"
              tone="amber"
              icon={MdCardGiftcard}
              hint={`${Number(data.scholarships?.approved) || 0} approved`}
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label="Referral conversions"
              value={Number(data.referrals?.converted) || 0}
              icon={MdHandshake}
              hint={`${Number(data.referrals?.total) || 0} referrals`}
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label="Seat fill rate"
              value={Number(data.programs?.fill_rate) || 0}
              suffix="%"
              decimals={1}
              tone="coral"
              icon={MdEventSeat}
              hint={`${Number(data.programs?.seats_filled) || 0} of ${Number(data.programs?.seats_total) || 0}`}
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label="Certificates issued"
              value={Number(data.certifications?.total) || 0}
              tone="violet"
              icon={MdWorkspacePremium}
            />
          </StaggerItem>
        </Stagger>

        {/* Trend */}
        <Reveal>
          <Surface variant="raised">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <p className="font-semibold mb-0" style={{ color: 'var(--neu-ink)' }}>Monthly trend</p>
                <p className="text-xs mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
                  {range.from} to {range.to}
                </p>
              </div>
              <Tabs
                id="metric-tabs"
                value={metric}
                onChange={setMetric}
                tabs={METRICS.map((entry) => ({ key: entry.key, label: entry.label }))}
              />
            </div>

            <div style={{ width: '100%', height: 300 }}>
              {trends.loading ? (
                <div className="neu-skeleton h-full" />
              ) : series.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-sm mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
                    No data in this range yet.
                  </p>
                </div>
              ) : metric === 'fees' ? (
                <ResponsiveContainer>
                  <BarChart data={series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.line} vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: colors.muted }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: colors.muted }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: colors.line }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="billed" name="Billed" fill={colors.line} radius={[6, 6, 0, 0]} />
                    <Bar dataKey="amount" name="Collected" fill={colors.primary} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer>
                  <AreaChart data={series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={colors.primary} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={colors.primary} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.line} vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: colors.muted }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: colors.muted }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="total"
                      name="Total"
                      stroke={colors.primary}
                      strokeWidth={2.5}
                      fill="url(#trendFill)"
                    />
                    {series[0]?.approved !== undefined && (
                      <Area type="monotone" dataKey="approved" name="Approved" stroke={colors.teal} strokeWidth={2} fill="transparent" />
                    )}
                    {series[0]?.won !== undefined && (
                      <Area type="monotone" dataKey="won" name="Won" stroke={colors.teal} strokeWidth={2} fill="transparent" />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Surface>
        </Reveal>

        {/* Exports */}
        <Reveal delay={0.05}>
          <Surface variant="raised">
            <p className="font-semibold mb-1" style={{ color: 'var(--neu-ink)' }}>Export</p>
            <p className="text-sm mb-4" style={{ color: 'var(--neu-ink-muted)' }}>
              CSV for the selected date range, ready for a spreadsheet.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {EXPORTS.map((report) => (
                <button
                  key={report.key}
                  type="button"
                  onClick={() => download(report.key)}
                  disabled={downloading === report.key}
                  className="flex items-center gap-3 p-4 text-left neu-interactive"
                  style={{
                    borderRadius: 'var(--neu-radius)',
                    background: 'var(--neu-bg)',
                    boxShadow: 'var(--neu-e1)',
                  }}
                >
                  <span
                    className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ boxShadow: 'var(--neu-inset-subtle)', color: 'var(--neu-primary)' }}
                  >
                    {downloading === report.key
                      ? <span className="neu-spinner" />
                      : <report.icon className="w-5 h-5" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold" style={{ color: 'var(--neu-ink)' }}>
                      {report.label}
                    </span>
                    <span className="block text-xs" style={{ color: 'var(--neu-ink-muted)' }}>
                      Download CSV
                    </span>
                  </span>
                  <MdDownload className="w-4 h-4 ml-auto shrink-0" style={{ color: 'var(--neu-ink-muted)' }} />
                </button>
              ))}
            </div>
          </Surface>
        </Reveal>
      </div>
    </MainLayout>
  );
}
