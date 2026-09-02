import { useCallback, useMemo, useState } from 'react';
import {
  MdHandshake, MdAdd, MdPeopleAlt, MdReceiptLong, MdPaid,
  MdContentCopy, MdCheck, MdTrendingUp, MdVerified,
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

const PARTNER_TYPES = ['agent', 'consultant', 'student', 'staff', 'alumni', 'affiliate'];
const REFERRAL_STATUSES = ['pending', 'contacted', 'qualified', 'converted', 'rejected', 'expired'];

const EMPTY_PARTNER = {
  name: '', type: 'agent', email: '', phone: '', company: '', city: '',
  commission_type: 'percentage', commission_rate: '', referral_code: '', notes: '',
};

const EMPTY_REFERRAL = {
  partner_id: '', referee_name: '', referee_email: '', referee_phone: '',
  program_id: '', expires_at: '', notes: '',
};

const money = (value) => `₹${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function ReferralsPage() {
  const notification = useNotification();
  const [tab, setTab] = useState('referrals');

  const [statusFilter, setStatusFilter] = useState('');
  const referralParams = useMemo(() => (statusFilter ? { status: statusFilter } : {}), [statusFilter]);

  const referrals = useResource('/referrals', { params: referralParams, auto: tab === 'referrals' });
  const partners = useResource('/referrals/partners', { auto: tab === 'partners' });
  const commissions = useResource('/referrals/commissions', { auto: tab === 'commissions' });
  const invoices = useResource('/referrals/invoices', { auto: tab === 'invoices' });
  const summary = useEndpoint('/referrals/summary');
  const partnerOptions = useEndpoint('/referrals/partners', { params: { pageSize: 100 } });
  const programOptions = useEndpoint('/programs', { params: { pageSize: 100 } });

  const [partnerModal, setPartnerModal] = useState(false);
  const [partnerForm, setPartnerForm] = useState(EMPTY_PARTNER);
  const [referralModal, setReferralModal] = useState(false);
  const [referralForm, setReferralForm] = useState(EMPTY_REFERRAL);
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ partner_id: '', period_start: '', period_end: '', tax_rate: '18', due_at: '' });
  const [saving, setSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState('');

  const partnerSelect = useMemo(() => (
    (partnerOptions.data?.data || []).map((partner) => ({
      value: partner.id,
      label: `${partner.name} · ${partner.commission_type === 'percentage' ? `${partner.commission_rate}%` : money(partner.commission_rate)}`,
    }))
  ), [partnerOptions.data]);

  const programSelect = useMemo(() => (
    (programOptions.data?.data || []).map((program) => ({ value: program.id, label: program.name }))
  ), [programOptions.data]);

  const refreshAll = useCallback(() => {
    summary.reload();
    partnerOptions.reload();
    if (tab === 'referrals') referrals.reload();
    if (tab === 'partners') partners.reload();
    if (tab === 'commissions') commissions.reload();
    if (tab === 'invoices') invoices.reload();
  }, [tab, summary, partnerOptions, referrals, partners, commissions, invoices]);

  const copyCode = async (code) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(''), 1800);
  };

  // ── actions ───────────────────────────────────────────────────────
  const savePartner = async () => {
    if (!partnerForm.name.trim()) {
      notification.error('Partner name is required');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/referrals/partners', {
        ...partnerForm,
        referral_code: partnerForm.referral_code || undefined,
        commission_rate: Number(partnerForm.commission_rate) || 0,
      });
      notification.success(`Partner added — code ${data.partner.referral_code}`);
      setPartnerModal(false);
      setPartnerForm(EMPTY_PARTNER);
      refreshAll();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to add partner');
    } finally {
      setSaving(false);
    }
  };

  const saveReferral = async () => {
    if (!referralForm.partner_id || !referralForm.referee_name.trim()) {
      notification.error('Partner and referee name are required');
      return;
    }
    setSaving(true);
    try {
      await api.post('/referrals', {
        ...referralForm,
        program_id: referralForm.program_id || null,
      });
      notification.success('Referral logged');
      setReferralModal(false);
      setReferralForm(EMPTY_REFERRAL);
      refreshAll();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to log referral');
    } finally {
      setSaving(false);
    }
  };

  const setReferralStatus = async (referral, status) => {
    try {
      const { data } = await api.post(`/referrals/${referral.id}/status`, { status });
      notification.success(
        data.commission
          ? `Converted — commission of ${money(data.commission.amount)} accrued`
          : `Marked ${status}`
      );
      refreshAll();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to update referral');
    }
  };

  const approveCommission = async (commission, approved) => {
    try {
      await api.post(`/referrals/commissions/${commission.id}/approve`, { approved });
      notification.success(approved ? 'Commission approved' : 'Commission rejected');
      refreshAll();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to update commission');
    }
  };

  const createInvoice = async () => {
    if (!invoiceForm.partner_id) {
      notification.error('Choose a partner');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/referrals/invoices', {
        ...invoiceForm,
        tax_rate: Number(invoiceForm.tax_rate) || 0,
      });
      notification.success(`Invoice ${data.invoice.invoice_no} created for ${money(data.invoice.total)}`);
      setInvoiceModal(false);
      setInvoiceForm({ partner_id: '', period_start: '', period_end: '', tax_rate: '18', due_at: '' });
      setTab('invoices');
      refreshAll();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to create invoice');
    } finally {
      setSaving(false);
    }
  };

  const setInvoiceStatus = async (invoice, status) => {
    try {
      await api.post(`/referrals/invoices/${invoice.id}/status`, { status });
      notification.success(`Invoice marked ${status}`);
      refreshAll();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to update invoice');
    }
  };

  // ── columns ───────────────────────────────────────────────────────
  const referralColumns = [
    {
      key: 'referee_name',
      label: 'Referee',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-semibold mb-0 truncate" style={{ color: 'var(--neu-ink)' }}>{row.referee_name}</p>
          <p className="text-xs mb-0 truncate" style={{ color: 'var(--neu-ink-muted)' }}>
            {row.referee_email || row.referee_phone || '—'}
          </p>
        </div>
      ),
    },
    { key: 'partner_name', label: 'Partner' },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
    { key: 'created_at', label: 'Referred', hideOnMobile: true, render: (row) => formatDate(row.created_at) },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        row.status === 'converted' ? (
          <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--neu-success)' }}>
            <MdVerified className="w-4 h-4" /> Converted
          </span>
        ) : (
          <Button size="xs" variant="primary" onClick={() => setReferralStatus(row, 'converted')}>
            Convert
          </Button>
        )
      ),
    },
  ];

  const partnerColumns = [
    {
      key: 'name',
      label: 'Partner',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-semibold mb-0 truncate" style={{ color: 'var(--neu-ink)' }}>{row.name}</p>
          <p className="text-xs mb-0 truncate" style={{ color: 'var(--neu-ink-muted)' }}>
            {row.company || row.email || '—'}
          </p>
        </div>
      ),
    },
    { key: 'type', label: 'Type', render: (row) => <Badge tone="violet" dot={false}>{row.type}</Badge> },
    {
      key: 'referral_code',
      label: 'Code',
      render: (row) => (
        <button
          type="button"
          onClick={() => copyCode(row.referral_code)}
          className="neu-btn neu-btn-xs"
          title="Copy referral code"
        >
          {copiedCode === row.referral_code ? <MdCheck className="w-3.5 h-3.5" /> : <MdContentCopy className="w-3.5 h-3.5" />}
          {row.referral_code}
        </button>
      ),
    },
    {
      key: 'commission_rate',
      label: 'Rate',
      render: (row) => (row.commission_type === 'percentage' ? `${row.commission_rate}%` : money(row.commission_rate)),
    },
    { key: 'total_converted', label: 'Converted', align: 'right' },
    { key: 'total_earned', label: 'Earned', align: 'right', render: (row) => money(row.total_earned) },
    {
      key: 'outstanding_amount',
      label: 'Outstanding',
      align: 'right',
      hideOnMobile: true,
      render: (row) => money(row.outstanding_amount),
    },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
  ];

  const commissionColumns = [
    { key: 'partner_name', label: 'Partner' },
    { key: 'referee_name', label: 'Referee', render: (row) => row.referee_name || '—' },
    { key: 'base_amount', label: 'Base', align: 'right', render: (row) => money(row.base_amount) },
    { key: 'rate', label: 'Rate', align: 'right', render: (row) => `${row.rate}` },
    { key: 'amount', label: 'Commission', align: 'right', render: (row) => money(row.amount) },
    { key: 'invoice_no', label: 'Invoice', hideOnMobile: true, render: (row) => row.invoice_no || '—' },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        row.status === 'pending' ? (
          <div className="flex gap-1 justify-end">
            <Button size="xs" variant="primary" onClick={() => approveCommission(row, true)}>Approve</Button>
            <Button size="xs" variant="ghost" onClick={() => approveCommission(row, false)}>Reject</Button>
          </div>
        ) : null
      ),
    },
  ];

  const invoiceColumns = [
    { key: 'invoice_no', label: 'Invoice' },
    { key: 'partner_name', label: 'Partner' },
    {
      key: 'period',
      label: 'Period',
      hideOnMobile: true,
      render: (row) => (row.period_start ? `${formatDate(row.period_start)} – ${formatDate(row.period_end)}` : '—'),
    },
    { key: 'line_count', label: 'Lines', align: 'right' },
    { key: 'subtotal', label: 'Subtotal', align: 'right', render: (row) => money(row.subtotal) },
    { key: 'total', label: 'Total', align: 'right', render: (row) => money(row.total) },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        <div className="flex gap-1 justify-end">
          {row.status === 'draft' && (
            <Button size="xs" variant="secondary" onClick={() => setInvoiceStatus(row, 'issued')}>Issue</Button>
          )}
          {['draft', 'issued'].includes(row.status) && (
            <Button size="xs" variant="primary" onClick={() => setInvoiceStatus(row, 'paid')}>Mark paid</Button>
          )}
        </div>
      ),
    },
  ];

  const stats = summary.data || {};

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 space-y-6 scene">
        <PageHeader
          title="Referrals & Commissions"
          subtitle="Partner network, conversion tracking and commission invoicing"
          icon={MdHandshake}
          actions={
            <>
              <Button variant="secondary" icon={MdPeopleAlt} onClick={() => { setPartnerForm(EMPTY_PARTNER); setPartnerModal(true); }}>
                Add partner
              </Button>
              <Button variant="primary" icon={MdAdd} onClick={() => { setReferralForm(EMPTY_REFERRAL); setReferralModal(true); }}>
                Log referral
              </Button>
            </>
          }
        />

        <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StaggerItem>
            <StatCard
              label="Active partners"
              value={Number(stats.partners?.active) || 0}
              icon={MdPeopleAlt}
              hint={`${Number(stats.partners?.total) || 0} total`}
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label="Conversion"
              value={Number(stats.referrals?.conversion_rate) || 0}
              suffix="%"
              decimals={1}
              tone="success"
              icon={MdTrendingUp}
              hint={`${Number(stats.referrals?.converted) || 0} of ${Number(stats.referrals?.total) || 0}`}
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label="Awaiting approval"
              value={Number(stats.commissions?.pending) || 0}
              prefix="₹"
              tone="amber"
              icon={MdReceiptLong}
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label="Paid out"
              value={Number(stats.commissions?.paid) || 0}
              prefix="₹"
              tone="teal"
              icon={MdPaid}
            />
          </StaggerItem>
        </Stagger>

        <Reveal>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              id="referral-tabs"
              value={tab}
              onChange={setTab}
              tabs={[
                { key: 'referrals', label: 'Referrals', icon: MdHandshake },
                { key: 'partners', label: 'Partners', icon: MdPeopleAlt },
                { key: 'commissions', label: 'Commissions', icon: MdReceiptLong },
                { key: 'invoices', label: 'Invoices', icon: MdPaid },
              ]}
            />
            {tab === 'invoices' && (
              <Button variant="secondary" icon={MdAdd} onClick={() => setInvoiceModal(true)}>
                New invoice
              </Button>
            )}
          </div>
        </Reveal>

        <Reveal delay={0.05}>
          {tab === 'referrals' && (
            <DataTable
              columns={referralColumns}
              rows={referrals.rows}
              loading={referrals.loading}
              error={referrals.error}
              search={referrals.search}
              onSearchChange={referrals.setSearch}
              searchPlaceholder="Search referees…"
              pagination={referrals.pagination}
              onPageChange={referrals.setPage}
              toolbar={
                <Select
                  wrapperClass="mb-0 w-40"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  placeholder="All statuses"
                  options={REFERRAL_STATUSES.map((status) => ({
                    value: status,
                    label: status.replace(/^./, (c) => c.toUpperCase()),
                  }))}
                />
              }
              empty={{
                icon: MdHandshake,
                title: 'No referrals yet',
                description: 'Add a partner, share their code, and their referrals land here.',
              }}
            />
          )}

          {tab === 'partners' && (
            <DataTable
              columns={partnerColumns}
              rows={partners.rows}
              loading={partners.loading}
              error={partners.error}
              search={partners.search}
              onSearchChange={partners.setSearch}
              searchPlaceholder="Search partners…"
              pagination={partners.pagination}
              onPageChange={partners.setPage}
              empty={{
                icon: MdPeopleAlt,
                title: 'No partners yet',
                description: 'Agents, consultants and alumni each get a unique referral code.',
                action: <Button variant="primary" icon={MdAdd} onClick={() => setPartnerModal(true)}>Add partner</Button>,
              }}
            />
          )}

          {tab === 'commissions' && (
            <DataTable
              columns={commissionColumns}
              rows={commissions.rows}
              loading={commissions.loading}
              error={commissions.error}
              pagination={commissions.pagination}
              onPageChange={commissions.setPage}
              empty={{
                icon: MdReceiptLong,
                title: 'No commissions yet',
                description: 'A commission is accrued automatically when a referral converts.',
              }}
            />
          )}

          {tab === 'invoices' && (
            <DataTable
              columns={invoiceColumns}
              rows={invoices.rows}
              loading={invoices.loading}
              error={invoices.error}
              search={invoices.search}
              onSearchChange={invoices.setSearch}
              searchPlaceholder="Search invoice numbers…"
              pagination={invoices.pagination}
              onPageChange={invoices.setPage}
              empty={{
                icon: MdPaid,
                title: 'No invoices yet',
                description: 'Batch a partner’s approved commissions into one invoice.',
                action: <Button variant="primary" icon={MdAdd} onClick={() => setInvoiceModal(true)}>New invoice</Button>,
              }}
            />
          )}
        </Reveal>
      </div>

      {/* Partner */}
      <Modal
        open={partnerModal}
        onClose={() => setPartnerModal(false)}
        title="Add referral partner"
        maxWidth="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPartnerModal(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={savePartner}>Add partner</Button>
          </>
        }
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Name" required value={partnerForm.name} onChange={(e) => setPartnerForm((f) => ({ ...f, name: e.target.value }))} />
          <Select
            label="Type"
            wrapperClass="mb-0"
            value={partnerForm.type}
            onChange={(e) => setPartnerForm((f) => ({ ...f, type: e.target.value }))}
            options={PARTNER_TYPES.map((type) => ({ value: type, label: type.replace(/^./, (c) => c.toUpperCase()) }))}
          />
          <Input label="Email" type="email" value={partnerForm.email} onChange={(e) => setPartnerForm((f) => ({ ...f, email: e.target.value }))} />
          <Input label="Phone" value={partnerForm.phone} onChange={(e) => setPartnerForm((f) => ({ ...f, phone: e.target.value }))} />
          <Input label="Company" value={partnerForm.company} onChange={(e) => setPartnerForm((f) => ({ ...f, company: e.target.value }))} />
          <Input label="City" value={partnerForm.city} onChange={(e) => setPartnerForm((f) => ({ ...f, city: e.target.value }))} />
          <Select
            label="Commission type"
            wrapperClass="mb-0"
            value={partnerForm.commission_type}
            onChange={(e) => setPartnerForm((f) => ({ ...f, commission_type: e.target.value }))}
            options={[
              { value: 'percentage', label: 'Percentage of tuition' },
              { value: 'fixed', label: 'Fixed per conversion' },
            ]}
          />
          <Input
            label={partnerForm.commission_type === 'percentage' ? 'Rate (%)' : 'Amount (₹)'}
            type="number"
            value={partnerForm.commission_rate}
            onChange={(e) => setPartnerForm((f) => ({ ...f, commission_rate: e.target.value }))}
          />
          <Input
            label="Referral code"
            value={partnerForm.referral_code}
            onChange={(e) => setPartnerForm((f) => ({ ...f, referral_code: e.target.value }))}
            hint="Leave blank to generate one"
            wrapperClass="sm:col-span-2"
          />
        </div>
      </Modal>

      {/* Referral */}
      <Modal
        open={referralModal}
        onClose={() => setReferralModal(false)}
        title="Log a referral"
        maxWidth="max-w-xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReferralModal(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={saveReferral}>Log referral</Button>
          </>
        }
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <Select
            label="Partner"
            required
            wrapperClass="mb-0 sm:col-span-2"
            value={referralForm.partner_id}
            onChange={(e) => setReferralForm((f) => ({ ...f, partner_id: e.target.value }))}
            placeholder="Choose a partner"
            options={partnerSelect}
          />
          <Input label="Referee name" required value={referralForm.referee_name} onChange={(e) => setReferralForm((f) => ({ ...f, referee_name: e.target.value }))} />
          <Input label="Referee phone" value={referralForm.referee_phone} onChange={(e) => setReferralForm((f) => ({ ...f, referee_phone: e.target.value }))} />
          <Input label="Referee email" type="email" value={referralForm.referee_email} onChange={(e) => setReferralForm((f) => ({ ...f, referee_email: e.target.value }))} />
          <Select
            label="Program"
            wrapperClass="mb-0"
            value={referralForm.program_id}
            onChange={(e) => setReferralForm((f) => ({ ...f, program_id: e.target.value }))}
            placeholder="Not specified"
            options={programSelect}
            hint="Sets the commission base on conversion"
          />
          <Input
            label="Expires"
            type="date"
            wrapperClass="sm:col-span-2"
            value={referralForm.expires_at}
            onChange={(e) => setReferralForm((f) => ({ ...f, expires_at: e.target.value }))}
          />
        </div>
      </Modal>

      {/* Invoice */}
      <Modal
        open={invoiceModal}
        onClose={() => setInvoiceModal(false)}
        title="New commission invoice"
        maxWidth="max-w-xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setInvoiceModal(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={createInvoice}>Create invoice</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="neu-alert neu-alert-info">
            <span>Every approved, un-invoiced commission for the partner in this period is batched onto one invoice.</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Select
              label="Partner"
              required
              wrapperClass="mb-0 sm:col-span-2"
              value={invoiceForm.partner_id}
              onChange={(e) => setInvoiceForm((f) => ({ ...f, partner_id: e.target.value }))}
              placeholder="Choose a partner"
              options={partnerSelect}
            />
            <Input label="Period start" type="date" value={invoiceForm.period_start} onChange={(e) => setInvoiceForm((f) => ({ ...f, period_start: e.target.value }))} />
            <Input label="Period end" type="date" value={invoiceForm.period_end} onChange={(e) => setInvoiceForm((f) => ({ ...f, period_end: e.target.value }))} />
            <Input label="Tax rate (%)" type="number" value={invoiceForm.tax_rate} onChange={(e) => setInvoiceForm((f) => ({ ...f, tax_rate: e.target.value }))} />
            <Input label="Due date" type="date" value={invoiceForm.due_at} onChange={(e) => setInvoiceForm((f) => ({ ...f, due_at: e.target.value }))} />
          </div>
        </div>
      </Modal>
    </MainLayout>
  );
}
