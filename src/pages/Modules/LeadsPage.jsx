import { useCallback, useMemo, useState } from 'react';
import {
  MdContactPhone, MdAdd, MdPhone, MdEmail, MdEvent, MdTrendingUp,
  MdPersonAdd, MdNote, MdCheckCircle, MdWarning, MdOpenInNew,
} from 'react-icons/md';
import MainLayout from '../../components/Layout/MainLayout';
import PageHeader from '../../components/Common/PageHeader';
import StatCard from '../../components/Common/StatCard';
import Surface from '../../components/Common/Surface';
import DataTable from '../../components/Common/DataTable';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import Select from '../../components/Common/Select';
import Modal from '../../components/Common/Modal';
import Badge from '../../components/Common/Badge';
import { Reveal, Stagger, StaggerItem, motion } from '../../components/Common/Motion';
import { useResource, useEndpoint } from '../../hooks/useResource';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { formatDate } from '../../utils/helpers';

const STAGES = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
];

const SOURCES = ['website', 'walk_in', 'referral', 'campaign', 'social', 'phone', 'event', 'other'];
const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'whatsapp', 'note'];

const EMPTY_LEAD = {
  name: '', email: '', phone: '', city: '', source: 'website',
  program_id: '', interest: '', budget: '', next_follow_up_at: '', notes: '',
};

/** Pipeline column: a carved well the cards sit inside. */
function StageColumn({ stage, count, value, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(active ? '' : stage.key)}
      className="flex-1 min-w-[8.5rem] p-4 text-left transition-all"
      style={{
        borderRadius: 'var(--neu-radius)',
        background: 'var(--neu-bg)',
        boxShadow: active ? 'var(--neu-inset)' : 'var(--neu-e1)',
      }}
    >
      <p
        className="text-xs font-semibold uppercase tracking-wider mb-1"
        style={{ color: active ? 'var(--neu-primary)' : 'var(--neu-ink-muted)' }}
      >
        {stage.label}
      </p>
      <p className="text-2xl font-bold font-display mb-0" style={{ color: 'var(--neu-ink)' }}>
        {count}
      </p>
      {value > 0 && (
        <p className="text-xs mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
          ₹{Number(value).toLocaleString()}
        </p>
      )}
    </button>
  );
}

export default function LeadsPage() {
  const notification = useNotification();

  const [stageFilter, setStageFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const filters = useMemo(() => ({
    ...(stageFilter ? { stage: stageFilter } : {}),
    ...(sourceFilter ? { source: sourceFilter } : {}),
    ...(overdueOnly ? { overdue: true } : {}),
  }), [stageFilter, sourceFilter, overdueOnly]);

  const leads = useResource('/leads', { params: filters });
  const summary = useEndpoint('/leads/summary');
  const programs = useEndpoint('/programs', { params: { pageSize: 100 } });

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_LEAD);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activityForm, setActivityForm] = useState({ type: 'call', subject: '', body: '', next_follow_up_at: '' });
  const [busy, setBusy] = useState(false);

  const programOptions = useMemo(() => (
    (programs.data?.data || []).map((program) => ({ value: program.id, label: program.name }))
  ), [programs.data]);

  const refreshAll = useCallback(() => {
    leads.reload();
    summary.reload();
  }, [leads, summary]);

  // ── create ────────────────────────────────────────────────────────
  const handleCreate = async () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Name is required';
    if (!form.email && !form.phone) errors.phone = 'An email or a phone number is required';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await api.post('/leads', {
        ...form,
        program_id: form.program_id || null,
        budget: form.budget === '' ? null : Number(form.budget),
      });
      notification.success('Lead captured');
      setCreateOpen(false);
      setForm(EMPTY_LEAD);
      refreshAll();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to create lead');
    } finally {
      setSaving(false);
    }
  };

  // ── detail ────────────────────────────────────────────────────────
  const openDetail = async (lead) => {
    setDetail({ lead, activities: [] });
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/leads/${lead.id}`);
      setDetail(data);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load lead');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const moveStage = async (stage) => {
    if (!detail?.lead) return;
    const lostReason = stage === 'lost'
      ? window.prompt('Why was this lead lost?')
      : null;
    if (stage === 'lost' && !lostReason) return;

    setBusy(true);
    try {
      const { data } = await api.post(`/leads/${detail.lead.id}/stage`, {
        stage,
        ...(lostReason ? { lost_reason: lostReason } : {}),
      });
      setDetail((prev) => ({ ...prev, lead: data.lead }));
      notification.success(`Moved to ${stage}`);
      refreshAll();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to update stage');
    } finally {
      setBusy(false);
    }
  };

  const logActivity = async () => {
    if (!activityForm.subject.trim() && !activityForm.body.trim()) {
      notification.error('Add a subject or a note');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/leads/${detail.lead.id}/activities`, activityForm);
      const { data } = await api.get(`/leads/${detail.lead.id}`);
      setDetail(data);
      setActivityForm({ type: 'call', subject: '', body: '', next_follow_up_at: '' });
      notification.success('Activity logged');
      leads.reload();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to log activity');
    } finally {
      setBusy(false);
    }
  };

  const convertLead = async () => {
    if (!window.confirm('Convert this lead into an admission application?')) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/leads/${detail.lead.id}/convert`, {});
      notification.success(`Application ${data.admission.application_no} created`);
      setDetail(null);
      refreshAll();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to convert lead');
    } finally {
      setBusy(false);
    }
  };

  // ── columns ───────────────────────────────────────────────────────
  const columns = [
    {
      key: 'name',
      label: 'Lead',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-semibold mb-0 truncate" style={{ color: 'var(--neu-ink)' }}>{row.name}</p>
          <p className="text-xs mb-0 truncate" style={{ color: 'var(--neu-ink-muted)' }}>
            {row.email || row.phone || '—'}
          </p>
        </div>
      ),
    },
    { key: 'program_name', label: 'Interest', render: (row) => row.program_name || row.interest || '—' },
    { key: 'source', label: 'Source', render: (row) => <Badge status={row.source} dot={false} /> },
    { key: 'stage', label: 'Stage', render: (row) => <Badge status={row.stage} /> },
    {
      key: 'score',
      label: 'Score',
      align: 'right',
      render: (row) => (
        <div className="flex items-center gap-2 justify-end">
          <div className="neu-progress w-16">
            <div className="neu-progress-fill" style={{ width: `${row.score}%` }} />
          </div>
          <span className="text-xs tabular-nums" style={{ color: 'var(--neu-ink-muted)' }}>{row.score}</span>
        </div>
      ),
    },
    {
      key: 'next_follow_up_at',
      label: 'Follow-up',
      render: (row) => {
        if (!row.next_follow_up_at) return '—';
        const overdue = row.next_follow_up_at < new Date().toISOString().slice(0, 10)
          && !['won', 'lost'].includes(row.stage);
        return (
          <span
            className="inline-flex items-center gap-1 text-xs"
            style={{ color: overdue ? 'var(--neu-danger)' : 'var(--neu-ink-soft)' }}
          >
            {overdue && <MdWarning className="w-3.5 h-3.5" />}
            {formatDate(row.next_follow_up_at)}
          </span>
        );
      },
    },
    { key: 'assigned_to_name', label: 'Owner', hideOnMobile: true, render: (row) => row.assigned_to_name || 'Unassigned' },
  ];

  const byStage = summary.data?.byStage || {};
  const totals = summary.data?.totals || {};

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 space-y-6 scene">
        <PageHeader
          title="Lead CRM"
          subtitle="Capture enquiries, work the pipeline and convert them into applications"
          icon={MdContactPhone}
          actions={
            <Button variant="primary" icon={MdAdd} onClick={() => { setForm(EMPTY_LEAD); setFormErrors({}); setCreateOpen(true); }}>
              New lead
            </Button>
          }
        />

        {/* Summary */}
        <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StaggerItem>
            <StatCard label="Total leads" value={Number(totals.total) || 0} icon={MdContactPhone} />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label="Conversion"
              value={Number(totals.conversion_rate) || 0}
              suffix="%"
              decimals={1}
              tone="success"
              icon={MdTrendingUp}
              hint={`${Number(totals.won) || 0} won`}
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label="Avg. score"
              value={Number(totals.average_score) || 0}
              decimals={0}
              tone="violet"
              icon={MdCheckCircle}
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label="Overdue follow-ups"
              value={Number(totals.overdue_follow_ups) || 0}
              tone={Number(totals.overdue_follow_ups) > 0 ? 'danger' : 'teal'}
              icon={MdEvent}
            />
          </StaggerItem>
        </Stagger>

        {/* Pipeline */}
        <Reveal>
          <Surface variant="flat" className="!p-4">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--neu-ink-muted)' }}>
              Pipeline — click a stage to filter
            </p>
            <div className="flex flex-wrap gap-3">
              {STAGES.map((stage) => (
                <StageColumn
                  key={stage.key}
                  stage={stage}
                  count={byStage[stage.key]?.total ?? 0}
                  value={byStage[stage.key]?.pipeline_value ?? 0}
                  active={stageFilter === stage.key}
                  onSelect={setStageFilter}
                />
              ))}
            </div>
          </Surface>
        </Reveal>

        {/* Table */}
        <Reveal delay={0.05}>
          <DataTable
            columns={columns}
            rows={leads.rows}
            loading={leads.loading}
            error={leads.error}
            search={leads.search}
            onSearchChange={leads.setSearch}
            searchPlaceholder="Search by name, email or phone…"
            onRowClick={openDetail}
            pagination={leads.pagination}
            onPageChange={leads.setPage}
            toolbar={
              <div className="flex flex-wrap gap-2 items-center">
                <Select
                  wrapperClass="mb-0 w-40"
                  value={sourceFilter}
                  onChange={(event) => setSourceFilter(event.target.value)}
                  placeholder="All sources"
                  options={SOURCES.map((source) => ({
                    value: source,
                    label: source.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
                  }))}
                />
                <Button
                  size="sm"
                  variant={overdueOnly ? 'primary' : 'secondary'}
                  icon={MdWarning}
                  onClick={() => setOverdueOnly((value) => !value)}
                >
                  Overdue
                </Button>
              </div>
            }
            empty={{
              icon: MdContactPhone,
              title: 'No leads yet',
              description: 'Capture your first enquiry and it will show up here with a score and a follow-up date.',
              action: <Button variant="primary" icon={MdAdd} onClick={() => setCreateOpen(true)}>New lead</Button>,
            }}
          />
        </Reveal>
      </div>

      {/* Create */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Capture a lead"
        maxWidth="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={handleCreate}>Save lead</Button>
          </>
        }
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <Input
            label="Full name"
            required
            value={form.name}
            error={formErrors.name}
            onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
            placeholder="Applicant or parent name"
          />
          <Input
            label="Phone"
            value={form.phone}
            error={formErrors.phone}
            leftIcon={MdPhone}
            onChange={(event) => setForm((f) => ({ ...f, phone: event.target.value }))}
            placeholder="+91 98765 43210"
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            leftIcon={MdEmail}
            onChange={(event) => setForm((f) => ({ ...f, email: event.target.value }))}
            placeholder="name@example.com"
          />
          <Input
            label="City"
            value={form.city}
            onChange={(event) => setForm((f) => ({ ...f, city: event.target.value }))}
          />
          <Select
            label="Source"
            wrapperClass="mb-0"
            value={form.source}
            onChange={(event) => setForm((f) => ({ ...f, source: event.target.value }))}
            options={SOURCES.map((source) => ({
              value: source,
              label: source.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
            }))}
          />
          <Select
            label="Program of interest"
            wrapperClass="mb-0"
            value={form.program_id}
            onChange={(event) => setForm((f) => ({ ...f, program_id: event.target.value }))}
            placeholder="Not sure yet"
            options={programOptions}
          />
          <Input
            label="Budget"
            type="number"
            value={form.budget}
            onChange={(event) => setForm((f) => ({ ...f, budget: event.target.value }))}
            placeholder="0"
            hint="Feeds the pipeline value"
          />
          <Input
            label="Next follow-up"
            type="date"
            value={form.next_follow_up_at}
            onChange={(event) => setForm((f) => ({ ...f, next_follow_up_at: event.target.value }))}
          />
          <div className="sm:col-span-2">
            <label className="neu-label" htmlFor="lead-notes">Notes</label>
            <textarea
              id="lead-notes"
              className="neu-textarea"
              value={form.notes}
              onChange={(event) => setForm((f) => ({ ...f, notes: event.target.value }))}
              placeholder="What did they ask about?"
            />
          </div>
        </div>
      </Modal>

      {/* Detail */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.lead?.name || 'Lead'}
        maxWidth="max-w-3xl"
        footer={
          detail?.lead && (
            <>
              <Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>
              {detail.lead.stage !== 'won' && (
                <Button variant="primary" icon={MdPersonAdd} loading={busy} onClick={convertLead}>
                  Convert to application
                </Button>
              )}
            </>
          )
        }
      >
        {detailLoading && !detail?.activities?.length ? (
          <div className="py-10 flex justify-center"><div className="neu-spinner" /></div>
        ) : detail?.lead ? (
          <div className="space-y-5">
            <div className="grid sm:grid-cols-3 gap-3">
              <Surface variant="inset" className="!p-3">
                <p className="text-xs mb-1" style={{ color: 'var(--neu-ink-muted)' }}>Contact</p>
                <p className="text-sm mb-0" style={{ color: 'var(--neu-ink)' }}>{detail.lead.phone || '—'}</p>
                <p className="text-xs mb-0 truncate" style={{ color: 'var(--neu-ink-muted)' }}>{detail.lead.email || '—'}</p>
              </Surface>
              <Surface variant="inset" className="!p-3">
                <p className="text-xs mb-1" style={{ color: 'var(--neu-ink-muted)' }}>Score</p>
                <p className="text-xl font-bold font-display mb-0" style={{ color: 'var(--neu-ink)' }}>
                  {detail.lead.score}
                </p>
              </Surface>
              <Surface variant="inset" className="!p-3">
                <p className="text-xs mb-1" style={{ color: 'var(--neu-ink-muted)' }}>Follow-up</p>
                <p className="text-sm mb-0" style={{ color: 'var(--neu-ink)' }}>
                  {detail.lead.next_follow_up_at ? formatDate(detail.lead.next_follow_up_at) : 'Not set'}
                </p>
              </Surface>
            </div>

            {/* Stage control */}
            <div>
              <p className="neu-label">Stage</p>
              <div className="flex flex-wrap gap-2">
                {STAGES.map((stage) => {
                  const active = detail.lead.stage === stage.key;
                  return (
                    <button
                      key={stage.key}
                      type="button"
                      disabled={busy || detail.lead.stage === 'won'}
                      onClick={() => moveStage(stage.key)}
                      className="neu-btn neu-btn-sm"
                      style={active ? {
                        boxShadow: 'var(--neu-inset)',
                        color: 'var(--neu-primary)',
                        fontWeight: 700,
                      } : undefined}
                    >
                      {stage.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {detail.lead.converted_admission_id && (
              <div className="neu-alert neu-alert-success">
                <MdOpenInNew className="w-5 h-5 shrink-0" style={{ color: 'var(--neu-success)' }} />
                <span>Converted into an admission application.</span>
              </div>
            )}

            {/* Log activity */}
            <Surface variant="flat" className="!p-4 space-y-3">
              <p className="text-sm font-semibold mb-0" style={{ color: 'var(--neu-ink)' }}>Log an activity</p>
              <div className="grid sm:grid-cols-3 gap-3">
                <Select
                  wrapperClass="mb-0"
                  value={activityForm.type}
                  onChange={(event) => setActivityForm((f) => ({ ...f, type: event.target.value }))}
                  options={ACTIVITY_TYPES.map((type) => ({
                    value: type,
                    label: type.replace(/^./, (c) => c.toUpperCase()),
                  }))}
                />
                <Input
                  wrapperClass="sm:col-span-2"
                  value={activityForm.subject}
                  onChange={(event) => setActivityForm((f) => ({ ...f, subject: event.target.value }))}
                  placeholder="Subject — e.g. Called about fee structure"
                />
              </div>
              <textarea
                className="neu-textarea"
                rows={2}
                value={activityForm.body}
                onChange={(event) => setActivityForm((f) => ({ ...f, body: event.target.value }))}
                placeholder="What happened?"
              />
              <div className="flex flex-wrap items-end gap-3">
                <Input
                  label="Next follow-up"
                  type="date"
                  wrapperClass="mb-0"
                  value={activityForm.next_follow_up_at}
                  onChange={(event) => setActivityForm((f) => ({ ...f, next_follow_up_at: event.target.value }))}
                />
                <Button variant="primary" size="sm" icon={MdNote} loading={busy} onClick={logActivity}>
                  Log activity
                </Button>
              </div>
            </Surface>

            {/* Timeline */}
            <div>
              <p className="neu-label">Timeline</p>
              {detail.activities?.length ? (
                <div className="space-y-2">
                  {detail.activities.map((activity, index) => (
                    <motion.div
                      key={activity.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(index, 8) * 0.03 }}
                      className="flex gap-3 p-3"
                      style={{ borderRadius: 'var(--neu-radius-sm)', boxShadow: 'var(--neu-inset-subtle)' }}
                    >
                      <span className="shrink-0 mt-0.5">
                        <Badge tone="info" dot={false}>{activity.type.replace(/_/g, ' ')}</Badge>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium mb-0" style={{ color: 'var(--neu-ink)' }}>
                          {activity.subject || '—'}
                        </p>
                        {activity.body && (
                          <p className="text-xs mb-1" style={{ color: 'var(--neu-ink-soft)' }}>{activity.body}</p>
                        )}
                        <p className="text-[11px] mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
                          {formatDate(activity.occurred_at)}
                          {activity.performed_by_name ? ` · ${activity.performed_by_name}` : ''}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--neu-ink-muted)' }}>
                  No activity logged yet.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </MainLayout>
  );
}
