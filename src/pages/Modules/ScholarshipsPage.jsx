import { useCallback, useMemo, useState } from 'react';
import {
  MdCardGiftcard, MdAdd, MdSchool, MdPayments, MdCheckCircle,
  MdAccountBalanceWallet, MdGavel, MdInsights,
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
import Tabs from '../../components/Common/Tabs';
import { Reveal, Stagger, StaggerItem } from '../../components/Common/Motion';
import { useResource, useEndpoint } from '../../hooks/useResource';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { formatDate } from '../../utils/helpers';

const SCHEME_TYPES = ['merit', 'need', 'sports', 'minority', 'staff', 'alumni', 'other'];
const APPLICATION_STATUSES = ['submitted', 'under_review', 'approved', 'rejected', 'disbursed', 'withdrawn'];
const PAYOUT_METHODS = ['fee_adjustment', 'bank_transfer', 'upi', 'cheque', 'cash'];

const EMPTY_SCHEME = {
  name: '', code: '', type: 'merit', award_type: 'percentage', award_value: '',
  max_awards: '', budget_total: '', min_percentage: '', max_family_income: '',
  opens_at: '', closes_at: '', description: '', eligibility_notes: '',
};

const EMPTY_APPLICATION = {
  scheme_id: '', applicant_name: '', email: '', phone: '',
  academic_percentage: '', family_income: '', category: '',
  requested_amount: '', statement: '',
};

const money = (value) => `₹${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function ScholarshipsPage() {
  const notification = useNotification();
  const [tab, setTab] = useState('applications');

  const [statusFilter, setStatusFilter] = useState('');
  const [schemeFilter, setSchemeFilter] = useState('');

  const applicationParams = useMemo(() => ({
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(schemeFilter ? { schemeId: schemeFilter } : {}),
  }), [statusFilter, schemeFilter]);

  const applications = useResource('/scholarships/applications', { params: applicationParams, auto: tab === 'applications' });
  const schemes = useResource('/scholarships/schemes', { auto: tab === 'schemes' });
  const cashback = useResource('/scholarships/cashback', { auto: tab === 'cashback' });
  const summary = useEndpoint('/scholarships/summary');
  const schemeOptions = useEndpoint('/scholarships/schemes', { params: { pageSize: 100 } });

  const [schemeModal, setSchemeModal] = useState(false);
  const [schemeForm, setSchemeForm] = useState(EMPTY_SCHEME);
  const [applicationModal, setApplicationModal] = useState(false);
  const [applicationForm, setApplicationForm] = useState(EMPTY_APPLICATION);
  const [saving, setSaving] = useState(false);

  const [review, setReview] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [awardAmount, setAwardAmount] = useState('');
  const [payout, setPayout] = useState({ payout_method: 'fee_adjustment', reference_no: '', amount: '' });
  const [busy, setBusy] = useState(false);

  const schemeSelectOptions = useMemo(() => (
    (schemeOptions.data?.data || []).map((scheme) => ({
      value: scheme.id,
      label: `${scheme.name} (${scheme.award_type === 'percentage' ? `${scheme.award_value}%` : money(scheme.award_value)})`,
    }))
  ), [schemeOptions.data]);

  const refreshAll = useCallback(() => {
    summary.reload();
    schemeOptions.reload();
    if (tab === 'applications') applications.reload();
    if (tab === 'schemes') schemes.reload();
    if (tab === 'cashback') cashback.reload();
  }, [tab, summary, schemeOptions, applications, schemes, cashback]);

  // ── scheme ────────────────────────────────────────────────────────
  const saveScheme = async () => {
    if (!schemeForm.name.trim()) {
      notification.error('Scheme name is required');
      return;
    }
    setSaving(true);
    try {
      await api.post('/scholarships/schemes', {
        ...schemeForm,
        award_value: Number(schemeForm.award_value) || 0,
        max_awards: Number(schemeForm.max_awards) || 0,
        budget_total: Number(schemeForm.budget_total) || 0,
        min_percentage: schemeForm.min_percentage === '' ? null : Number(schemeForm.min_percentage),
        max_family_income: schemeForm.max_family_income === '' ? null : Number(schemeForm.max_family_income),
      });
      notification.success('Scheme created');
      setSchemeModal(false);
      setSchemeForm(EMPTY_SCHEME);
      refreshAll();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to create scheme');
    } finally {
      setSaving(false);
    }
  };

  // ── application ───────────────────────────────────────────────────
  const saveApplication = async () => {
    if (!applicationForm.scheme_id || !applicationForm.applicant_name.trim()) {
      notification.error('Scheme and applicant name are required');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/scholarships/applications', {
        ...applicationForm,
        academic_percentage: applicationForm.academic_percentage === '' ? null : Number(applicationForm.academic_percentage),
        family_income: applicationForm.family_income === '' ? null : Number(applicationForm.family_income),
        requested_amount: Number(applicationForm.requested_amount) || 0,
      });
      notification.success(
        data.evaluation?.eligible
          ? `Application submitted — eligibility score ${data.evaluation.score}`
          : 'Application submitted, but the applicant does not meet the criteria'
      );
      setApplicationModal(false);
      setApplicationForm(EMPTY_APPLICATION);
      refreshAll();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to submit application');
    } finally {
      setSaving(false);
    }
  };

  const openReview = async (application) => {
    setReview({ application, scheme: null, evaluation: null, cashback: [] });
    setReviewNotes(application.review_notes || '');
    setAwardAmount(application.awarded_amount ? String(application.awarded_amount) : '');
    try {
      const { data } = await api.get(`/scholarships/applications/${application.id}`);
      setReview(data);
      setPayout((p) => ({ ...p, amount: String(data.application.awarded_amount || '') }));
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load application');
    }
  };

  const decide = async (status) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/scholarships/applications/${review.application.id}/decision`, {
        status,
        review_notes: reviewNotes || null,
        ...(status === 'approved' && awardAmount !== '' ? { awarded_amount: Number(awardAmount) } : {}),
      });
      setReview((prev) => ({ ...prev, application: data.application }));
      setPayout((p) => ({ ...p, amount: String(data.application.awarded_amount || '') }));
      notification.success(`Application ${status}`);
      refreshAll();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Decision failed');
    } finally {
      setBusy(false);
    }
  };

  const disburse = async () => {
    setBusy(true);
    try {
      await api.post(`/scholarships/applications/${review.application.id}/disburse`, {
        payout_method: payout.payout_method,
        reference_no: payout.reference_no || null,
        ...(payout.amount !== '' ? { amount: Number(payout.amount) } : {}),
      });
      notification.success('Scholarship disbursed');
      setReview(null);
      refreshAll();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Disbursement failed');
    } finally {
      setBusy(false);
    }
  };

  // ── columns ───────────────────────────────────────────────────────
  const applicationColumns = [
    {
      key: 'applicant_name',
      label: 'Applicant',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-semibold mb-0 truncate" style={{ color: 'var(--neu-ink)' }}>{row.applicant_name}</p>
          <p className="text-xs mb-0" style={{ color: 'var(--neu-ink-muted)' }}>{row.application_no}</p>
        </div>
      ),
    },
    { key: 'scheme_name', label: 'Scheme' },
    {
      key: 'eligibility_score',
      label: 'Eligibility',
      align: 'right',
      render: (row) => (
        <div className="flex items-center gap-2 justify-end">
          <div className="neu-progress w-16">
            <div className="neu-progress-fill" style={{ width: `${Math.min(100, Number(row.eligibility_score))}%` }} />
          </div>
          <span className="text-xs tabular-nums" style={{ color: 'var(--neu-ink-muted)' }}>
            {Number(row.eligibility_score).toFixed(0)}
          </span>
        </div>
      ),
    },
    { key: 'awarded_amount', label: 'Award', align: 'right', render: (row) => money(row.awarded_amount) },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
    { key: 'created_at', label: 'Applied', hideOnMobile: true, render: (row) => formatDate(row.created_at) },
  ];

  const schemeColumns = [
    {
      key: 'name',
      label: 'Scheme',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-semibold mb-0 truncate" style={{ color: 'var(--neu-ink)' }}>{row.name}</p>
          <p className="text-xs mb-0" style={{ color: 'var(--neu-ink-muted)' }}>{row.code || '—'}</p>
        </div>
      ),
    },
    { key: 'type', label: 'Type', render: (row) => <Badge tone="violet" dot={false}>{row.type}</Badge> },
    {
      key: 'award_value',
      label: 'Award',
      render: (row) => (row.award_type === 'percentage' ? `${row.award_value}%` : money(row.award_value)),
    },
    {
      key: 'awards_granted',
      label: 'Awarded',
      align: 'right',
      render: (row) => `${row.awards_granted}${Number(row.max_awards) > 0 ? ` / ${row.max_awards}` : ''}`,
    },
    {
      key: 'budget',
      label: 'Budget used',
      align: 'right',
      render: (row) => (
        <span style={{ color: 'var(--neu-ink-soft)' }}>
          {money(row.budget_committed)}{Number(row.budget_total) > 0 ? ` / ${money(row.budget_total)}` : ''}
        </span>
      ),
    },
    { key: 'application_count', label: 'Applications', align: 'right', hideOnMobile: true },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
  ];

  const cashbackColumns = [
    { key: 'student_name', label: 'Student', render: (row) => row.student_name || row.applicant_name || '—' },
    { key: 'amount', label: 'Amount', align: 'right', render: (row) => money(row.amount) },
    { key: 'payout_method', label: 'Method', render: (row) => (row.payout_method || '—').replace(/_/g, ' ') },
    { key: 'reference_no', label: 'Reference', hideOnMobile: true, render: (row) => row.reference_no || '—' },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
    { key: 'paid_at', label: 'Paid', hideOnMobile: true, render: (row) => (row.paid_at ? formatDate(row.paid_at) : '—') },
  ];

  const stats = summary.data || {};
  const active = { applications, schemes, cashback }[tab];

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 space-y-6 scene">
        <PageHeader
          title="Scholarships & Cashback"
          subtitle="Fund students on merit or need, then track the money out the door"
          icon={MdCardGiftcard}
          actions={
            <>
              <Button variant="secondary" icon={MdSchool} onClick={() => { setSchemeForm(EMPTY_SCHEME); setSchemeModal(true); }}>
                New scheme
              </Button>
              <Button variant="primary" icon={MdAdd} onClick={() => { setApplicationForm(EMPTY_APPLICATION); setApplicationModal(true); }}>
                New application
              </Button>
            </>
          }
        />

        <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StaggerItem>
            <StatCard
              label="Open schemes"
              value={Number(stats.schemes?.open) || 0}
              icon={MdSchool}
              hint={`${Number(stats.schemes?.total) || 0} total`}
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label="Awaiting review"
              value={(Number(stats.applications?.submitted) || 0) + (Number(stats.applications?.under_review) || 0)}
              tone="amber"
              icon={MdGavel}
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label="Awarded"
              value={Number(stats.applications?.awarded_total) || 0}
              prefix="₹"
              tone="success"
              icon={MdCheckCircle}
              hint={`${Number(stats.applications?.approved) || 0} approved`}
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label="Cashback paid"
              value={Number(stats.cashback?.paid_total) || 0}
              prefix="₹"
              tone="teal"
              icon={MdAccountBalanceWallet}
            />
          </StaggerItem>
        </Stagger>

        <Reveal>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'applications', label: 'Applications', icon: MdGavel },
              { key: 'schemes', label: 'Schemes', icon: MdSchool },
              { key: 'cashback', label: 'Cashback ledger', icon: MdPayments },
            ]}
          />
        </Reveal>

        <Reveal delay={0.05}>
          {tab === 'applications' && (
            <DataTable
              columns={applicationColumns}
              rows={applications.rows}
              loading={applications.loading}
              error={applications.error}
              search={applications.search}
              onSearchChange={applications.setSearch}
              searchPlaceholder="Search applicants…"
              onRowClick={openReview}
              pagination={applications.pagination}
              onPageChange={applications.setPage}
              toolbar={
                <div className="flex flex-wrap gap-2">
                  <Select
                    wrapperClass="mb-0 w-40"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    placeholder="All statuses"
                    options={APPLICATION_STATUSES.map((status) => ({
                      value: status,
                      label: status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
                    }))}
                  />
                  <Select
                    wrapperClass="mb-0 w-52"
                    value={schemeFilter}
                    onChange={(event) => setSchemeFilter(event.target.value)}
                    placeholder="All schemes"
                    options={schemeSelectOptions}
                  />
                </div>
              }
              empty={{
                icon: MdCardGiftcard,
                title: 'No applications yet',
                description: 'Create a scheme first, then applications against it appear here scored and ready to review.',
              }}
            />
          )}

          {tab === 'schemes' && (
            <DataTable
              columns={schemeColumns}
              rows={schemes.rows}
              loading={schemes.loading}
              error={schemes.error}
              search={schemes.search}
              onSearchChange={schemes.setSearch}
              searchPlaceholder="Search schemes…"
              pagination={schemes.pagination}
              onPageChange={schemes.setPage}
              empty={{
                icon: MdSchool,
                title: 'No schemes yet',
                description: 'A scheme defines the award, the budget and who qualifies.',
                action: <Button variant="primary" icon={MdAdd} onClick={() => setSchemeModal(true)}>New scheme</Button>,
              }}
            />
          )}

          {tab === 'cashback' && (
            <DataTable
              columns={cashbackColumns}
              rows={cashback.rows}
              loading={cashback.loading}
              error={cashback.error}
              search={cashback.search}
              onSearchChange={cashback.setSearch}
              searchPlaceholder="Search by reference…"
              pagination={cashback.pagination}
              onPageChange={cashback.setPage}
              empty={{
                icon: MdPayments,
                title: 'Nothing disbursed yet',
                description: 'Approved scholarships show up here once you release the money.',
              }}
            />
          )}
        </Reveal>
      </div>

      {/* New scheme */}
      <Modal
        open={schemeModal}
        onClose={() => setSchemeModal(false)}
        title="New scholarship scheme"
        maxWidth="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSchemeModal(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={saveScheme}>Create scheme</Button>
          </>
        }
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <Input
            label="Scheme name"
            required
            value={schemeForm.name}
            onChange={(event) => setSchemeForm((f) => ({ ...f, name: event.target.value }))}
            placeholder="Merit Scholarship 2026"
          />
          <Input
            label="Code"
            value={schemeForm.code}
            onChange={(event) => setSchemeForm((f) => ({ ...f, code: event.target.value }))}
            placeholder="MERIT-26"
          />
          <Select
            label="Type"
            wrapperClass="mb-0"
            value={schemeForm.type}
            onChange={(event) => setSchemeForm((f) => ({ ...f, type: event.target.value }))}
            options={SCHEME_TYPES.map((type) => ({ value: type, label: type.replace(/^./, (c) => c.toUpperCase()) }))}
          />
          <Select
            label="Award type"
            wrapperClass="mb-0"
            value={schemeForm.award_type}
            onChange={(event) => setSchemeForm((f) => ({ ...f, award_type: event.target.value }))}
            options={[
              { value: 'percentage', label: 'Percentage of tuition' },
              { value: 'fixed', label: 'Fixed amount' },
            ]}
          />
          <Input
            label={schemeForm.award_type === 'percentage' ? 'Award (%)' : 'Award (₹)'}
            type="number"
            value={schemeForm.award_value}
            onChange={(event) => setSchemeForm((f) => ({ ...f, award_value: event.target.value }))}
          />
          <Input
            label="Maximum awards"
            type="number"
            value={schemeForm.max_awards}
            onChange={(event) => setSchemeForm((f) => ({ ...f, max_awards: event.target.value }))}
            hint="0 for unlimited"
          />
          <Input
            label="Total budget (₹)"
            type="number"
            value={schemeForm.budget_total}
            onChange={(event) => setSchemeForm((f) => ({ ...f, budget_total: event.target.value }))}
            hint="0 for uncapped"
          />
          <Input
            label="Minimum academic %"
            type="number"
            value={schemeForm.min_percentage}
            onChange={(event) => setSchemeForm((f) => ({ ...f, min_percentage: event.target.value }))}
            hint="Applicants below this are ineligible"
          />
          <Input
            label="Maximum family income (₹)"
            type="number"
            value={schemeForm.max_family_income}
            onChange={(event) => setSchemeForm((f) => ({ ...f, max_family_income: event.target.value }))}
            hint="Also scales the need score"
          />
          <Input
            label="Opens"
            type="date"
            value={schemeForm.opens_at}
            onChange={(event) => setSchemeForm((f) => ({ ...f, opens_at: event.target.value }))}
          />
          <Input
            label="Closes"
            type="date"
            value={schemeForm.closes_at}
            onChange={(event) => setSchemeForm((f) => ({ ...f, closes_at: event.target.value }))}
          />
          <div className="sm:col-span-2">
            <label className="neu-label" htmlFor="scheme-eligibility">Eligibility notes</label>
            <textarea
              id="scheme-eligibility"
              className="neu-textarea"
              rows={3}
              value={schemeForm.eligibility_notes}
              onChange={(event) => setSchemeForm((f) => ({ ...f, eligibility_notes: event.target.value }))}
              placeholder="Anything the automatic score cannot capture"
            />
          </div>
        </div>
      </Modal>

      {/* New application */}
      <Modal
        open={applicationModal}
        onClose={() => setApplicationModal(false)}
        title="New scholarship application"
        maxWidth="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setApplicationModal(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={saveApplication}>Submit</Button>
          </>
        }
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <Select
            label="Scheme"
            required
            wrapperClass="mb-0 sm:col-span-2"
            value={applicationForm.scheme_id}
            onChange={(event) => setApplicationForm((f) => ({ ...f, scheme_id: event.target.value }))}
            placeholder="Choose a scheme"
            options={schemeSelectOptions}
          />
          <Input
            label="Applicant name"
            required
            value={applicationForm.applicant_name}
            onChange={(event) => setApplicationForm((f) => ({ ...f, applicant_name: event.target.value }))}
          />
          <Input
            label="Category"
            value={applicationForm.category}
            onChange={(event) => setApplicationForm((f) => ({ ...f, category: event.target.value }))}
            placeholder="General / OBC / SC / ST"
          />
          <Input
            label="Email"
            type="email"
            value={applicationForm.email}
            onChange={(event) => setApplicationForm((f) => ({ ...f, email: event.target.value }))}
          />
          <Input
            label="Phone"
            value={applicationForm.phone}
            onChange={(event) => setApplicationForm((f) => ({ ...f, phone: event.target.value }))}
          />
          <Input
            label="Academic %"
            type="number"
            value={applicationForm.academic_percentage}
            onChange={(event) => setApplicationForm((f) => ({ ...f, academic_percentage: event.target.value }))}
            hint="Biggest factor in the score"
          />
          <Input
            label="Family income (₹/year)"
            type="number"
            value={applicationForm.family_income}
            onChange={(event) => setApplicationForm((f) => ({ ...f, family_income: event.target.value }))}
            hint="Lower income scores higher on need"
          />
          <Input
            label="Requested amount (₹)"
            type="number"
            value={applicationForm.requested_amount}
            onChange={(event) => setApplicationForm((f) => ({ ...f, requested_amount: event.target.value }))}
          />
          <div className="sm:col-span-2">
            <label className="neu-label" htmlFor="application-statement">Statement</label>
            <textarea
              id="application-statement"
              className="neu-textarea"
              rows={3}
              value={applicationForm.statement}
              onChange={(event) => setApplicationForm((f) => ({ ...f, statement: event.target.value }))}
              placeholder="Why does the applicant need this scholarship?"
            />
          </div>
        </div>
      </Modal>

      {/* Review */}
      <Modal
        open={Boolean(review)}
        onClose={() => setReview(null)}
        title={review?.application?.applicant_name || 'Application'}
        maxWidth="max-w-2xl"
        footer={
          review?.application && (
            <>
              <Button variant="secondary" onClick={() => setReview(null)}>Close</Button>
              {review.application.status !== 'disbursed' && (
                <>
                  <Button variant="danger" loading={busy} onClick={() => decide('rejected')}>Reject</Button>
                  <Button variant="primary" loading={busy} onClick={() => decide('approved')}>Approve</Button>
                </>
              )}
            </>
          )
        }
      >
        {review?.application && (
          <div className="space-y-5">
            <div className="grid sm:grid-cols-3 gap-3">
              <Surface variant="inset" className="!p-3">
                <p className="text-xs mb-1" style={{ color: 'var(--neu-ink-muted)' }}>Eligibility score</p>
                <p className="text-xl font-bold font-display mb-0" style={{ color: 'var(--neu-ink)' }}>
                  {Number(review.application.eligibility_score).toFixed(0)}
                </p>
              </Surface>
              <Surface variant="inset" className="!p-3">
                <p className="text-xs mb-1" style={{ color: 'var(--neu-ink-muted)' }}>Academic</p>
                <p className="text-xl font-bold font-display mb-0" style={{ color: 'var(--neu-ink)' }}>
                  {review.application.academic_percentage ?? '—'}%
                </p>
              </Surface>
              <Surface variant="inset" className="!p-3">
                <p className="text-xs mb-1" style={{ color: 'var(--neu-ink-muted)' }}>Family income</p>
                <p className="text-xl font-bold font-display mb-0" style={{ color: 'var(--neu-ink)' }}>
                  {review.application.family_income ? money(review.application.family_income) : '—'}
                </p>
              </Surface>
            </div>

            {review.evaluation && (
              <div className={`neu-alert ${review.evaluation.eligible ? 'neu-alert-info' : 'neu-alert-error'}`}>
                <MdInsights className="w-5 h-5 shrink-0" />
                <span>
                  {review.evaluation.eligible
                    ? review.evaluation.reasons.join(' · ')
                    : `Not eligible: ${review.evaluation.reasons.join('; ')}`}
                </span>
              </div>
            )}

            {review.application.statement && (
              <div>
                <p className="neu-label">Statement</p>
                <p className="text-sm mb-0" style={{ color: 'var(--neu-ink-soft)' }}>
                  {review.application.statement}
                </p>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                label="Award amount (₹)"
                type="number"
                value={awardAmount}
                onChange={(event) => setAwardAmount(event.target.value)}
                hint="Leave blank to use the scheme default"
                wrapperClass="mb-0"
              />
              <div>
                <label className="neu-label" htmlFor="review-notes">Review notes</label>
                <textarea
                  id="review-notes"
                  className="neu-textarea"
                  rows={2}
                  value={reviewNotes}
                  onChange={(event) => setReviewNotes(event.target.value)}
                />
              </div>
            </div>

            {review.application.status === 'approved' && (
              <Surface variant="flat" className="!p-4 space-y-3">
                <p className="text-sm font-semibold mb-0" style={{ color: 'var(--neu-ink)' }}>Disburse</p>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Select
                    wrapperClass="mb-0"
                    value={payout.payout_method}
                    onChange={(event) => setPayout((p) => ({ ...p, payout_method: event.target.value }))}
                    options={PAYOUT_METHODS.map((method) => ({
                      value: method,
                      label: method.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
                    }))}
                  />
                  <Input
                    wrapperClass="mb-0"
                    type="number"
                    value={payout.amount}
                    onChange={(event) => setPayout((p) => ({ ...p, amount: event.target.value }))}
                    placeholder="Amount"
                  />
                  <Input
                    wrapperClass="mb-0"
                    value={payout.reference_no}
                    onChange={(event) => setPayout((p) => ({ ...p, reference_no: event.target.value }))}
                    placeholder="Reference no."
                  />
                </div>
                <Button variant="primary" size="sm" icon={MdPayments} loading={busy} onClick={disburse}>
                  Release funds
                </Button>
              </Surface>
            )}

            {review.cashback?.length > 0 && (
              <div>
                <p className="neu-label">Disbursements</p>
                {review.cashback.map((transaction) => (
                  <div key={transaction.id} className="flex justify-between text-sm py-1">
                    <span style={{ color: 'var(--neu-ink-soft)' }}>
                      {money(transaction.amount)} · {(transaction.payout_method || '').replace(/_/g, ' ')}
                    </span>
                    <Badge status={transaction.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </MainLayout>
  );
}
