import { useCallback, useMemo, useState } from 'react';
import {
  MdWorkspacePremium, MdAdd, MdVerified, MdSearch, MdBlock,
  MdContentCopy, MdCheck, MdEventBusy,
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
import { Reveal, Stagger, StaggerItem } from '../../components/Common/Motion';
import { useResource, useEndpoint } from '../../hooks/useResource';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { formatDate } from '../../utils/helpers';

const STATUSES = ['issued', 'revoked', 'expired'];

const EMPTY_FORM = {
  student_id: '', program_id: '', title: '', certificate_no: '',
  grade: '', issued_on: '', expires_on: '',
};

export default function CertificationsPage() {
  const notification = useNotification();

  const [statusFilter, setStatusFilter] = useState('');
  const params = useMemo(() => (statusFilter ? { status: statusFilter } : {}), [statusFilter]);

  const certificates = useResource('/certifications', { params });
  const summary = useEndpoint('/certifications/summary');
  const programs = useEndpoint('/programs', { params: { pageSize: 100 } });

  const [issueOpen, setIssueOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState('');

  const [studentQuery, setStudentQuery] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const programOptions = useMemo(() => (
    (programs.data?.data || []).map((program) => ({ value: program.id, label: program.name }))
  ), [programs.data]);

  const refreshAll = useCallback(() => {
    certificates.reload();
    summary.reload();
  }, [certificates, summary]);

  const searchStudents = async (value) => {
    setStudentQuery(value);
    setSelectedStudent(null);
    if (value.trim().length < 2) { setStudentResults([]); return; }
    try {
      const { data } = await api.get('/students', { params: { search: value, pageSize: 8, page: 1 } });
      setStudentResults(data?.data || []);
    } catch {
      setStudentResults([]);
    }
  };

  const issue = async () => {
    if (!form.title.trim()) {
      notification.error('Certificate title is required');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/certifications', {
        ...form,
        student_id: selectedStudent?.id || null,
        program_id: form.program_id || null,
      });
      notification.success(`Issued — verification code ${data.certification.verification_code}`);
      setIssueOpen(false);
      setForm(EMPTY_FORM);
      setSelectedStudent(null);
      setStudentQuery('');
      refreshAll();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to issue certificate');
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (certificate) => {
    const reason = window.prompt(`Revoke "${certificate.title}"? Give a reason:`);
    if (!reason) return;
    try {
      await api.post(`/certifications/${certificate.id}/revoke`, { reason });
      notification.success('Certificate revoked');
      refreshAll();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to revoke certificate');
    }
  };

  const verify = async () => {
    if (!verifyCode.trim()) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const { data } = await api.get(`/certifications/verify/${encodeURIComponent(verifyCode.trim())}`);
      setVerifyResult(data);
    } catch (err) {
      setVerifyResult(err.response?.data || { valid: false, reason: 'Lookup failed' });
    } finally {
      setVerifying(false);
    }
  };

  const copyCode = async (code) => {
    await navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(''), 1800);
  };

  const columns = [
    {
      key: 'title',
      label: 'Certificate',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-semibold mb-0 truncate" style={{ color: 'var(--neu-ink)' }}>{row.title}</p>
          <p className="text-xs mb-0" style={{ color: 'var(--neu-ink-muted)' }}>{row.certificate_no}</p>
        </div>
      ),
    },
    { key: 'student_name', label: 'Student', render: (row) => row.student_name || '—' },
    { key: 'program_name', label: 'Program', hideOnMobile: true, render: (row) => row.program_name || '—' },
    { key: 'grade', label: 'Grade', render: (row) => row.grade || '—' },
    { key: 'issued_on', label: 'Issued', render: (row) => (row.issued_on ? formatDate(row.issued_on) : '—') },
    {
      key: 'verification_code',
      label: 'Verify code',
      hideOnMobile: true,
      render: (row) => (
        <button type="button" onClick={() => copyCode(row.verification_code)} className="neu-btn neu-btn-xs">
          {copied === row.verification_code ? <MdCheck className="w-3.5 h-3.5" /> : <MdContentCopy className="w-3.5 h-3.5" />}
          {row.verification_code}
        </button>
      ),
    },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        row.status === 'issued' ? (
          <Button size="xs" variant="ghost" icon={MdBlock} onClick={() => revoke(row)}>Revoke</Button>
        ) : null
      ),
    },
  ];

  const totals = summary.data?.totals || {};

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 space-y-6 scene">
        <PageHeader
          title="Certifications"
          subtitle="Issue credentials that anyone can verify from a code"
          icon={MdWorkspacePremium}
          actions={
            <>
              <Button variant="secondary" icon={MdSearch} onClick={() => { setVerifyResult(null); setVerifyOpen(true); }}>
                Verify a code
              </Button>
              <Button variant="primary" icon={MdAdd} onClick={() => { setForm(EMPTY_FORM); setIssueOpen(true); }}>
                Issue certificate
              </Button>
            </>
          }
        />

        <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StaggerItem>
            <StatCard label="Issued" value={Number(totals.issued) || 0} icon={MdWorkspacePremium} hint={`${Number(totals.total) || 0} total`} />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Active" value={(Number(totals.issued) || 0) - (Number(totals.expired) || 0)} tone="success" icon={MdVerified} />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Expired" value={Number(totals.expired) || 0} tone="amber" icon={MdEventBusy} />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Revoked" value={Number(totals.revoked) || 0} tone="danger" icon={MdBlock} />
          </StaggerItem>
        </Stagger>

        <Reveal>
          <DataTable
            columns={columns}
            rows={certificates.rows}
            loading={certificates.loading}
            error={certificates.error}
            search={certificates.search}
            onSearchChange={certificates.setSearch}
            searchPlaceholder="Search title, number or code…"
            pagination={certificates.pagination}
            onPageChange={certificates.setPage}
            toolbar={
              <Select
                wrapperClass="mb-0 w-40"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                placeholder="All statuses"
                options={STATUSES.map((status) => ({ value: status, label: status.replace(/^./, (c) => c.toUpperCase()) }))}
              />
            }
            empty={{
              icon: MdWorkspacePremium,
              title: 'No certificates issued',
              description: 'Every certificate gets a unique code an employer can check without an account.',
              action: <Button variant="primary" icon={MdAdd} onClick={() => setIssueOpen(true)}>Issue certificate</Button>,
            }}
          />
        </Reveal>
      </div>

      {/* Issue */}
      <Modal
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        title="Issue a certificate"
        maxWidth="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIssueOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={issue}>Issue</Button>
          </>
        }
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Input
              label="Student"
              value={selectedStudent
                ? `${selectedStudent.first_name} ${selectedStudent.last_name || ''}`.trim()
                : studentQuery}
              onChange={(event) => searchStudents(event.target.value)}
              leftIcon={MdSearch}
              placeholder="Search by name or admission number"
              hint="Optional — leave blank for a non-student credential"
              wrapperClass="mb-0"
            />
            {studentResults.length > 0 && !selectedStudent && (
              <Surface variant="flat" className="!p-1 mt-2 max-h-44 overflow-y-auto">
                {studentResults.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    className="neu-btn neu-btn-ghost w-full !justify-start"
                    onClick={() => { setSelectedStudent(student); setStudentResults([]); }}
                  >
                    {student.first_name} {student.last_name}
                    <span className="text-xs ml-auto" style={{ color: 'var(--neu-ink-muted)' }}>
                      {student.admission_no || student.class_name || ''}
                    </span>
                  </button>
                ))}
              </Surface>
            )}
          </div>

          <Input label="Title" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Diploma in Data Science" />
          <Select
            label="Program"
            wrapperClass="mb-0"
            value={form.program_id}
            onChange={(e) => setForm((f) => ({ ...f, program_id: e.target.value }))}
            placeholder="Not linked"
            options={programOptions}
          />
          <Input label="Certificate number" value={form.certificate_no} onChange={(e) => setForm((f) => ({ ...f, certificate_no: e.target.value }))} hint="Auto-generated when blank" />
          <Input label="Grade" value={form.grade} onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))} placeholder="A / Distinction" />
          <Input label="Issued on" type="date" value={form.issued_on} onChange={(e) => setForm((f) => ({ ...f, issued_on: e.target.value }))} hint="Defaults to today" />
          <Input label="Expires on" type="date" value={form.expires_on} onChange={(e) => setForm((f) => ({ ...f, expires_on: e.target.value }))} hint="Leave blank if it never expires" />
        </div>
      </Modal>

      {/* Verify */}
      <Modal
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        title="Verify a certificate"
        maxWidth="max-w-lg"
        footer={<Button variant="secondary" onClick={() => setVerifyOpen(false)}>Close</Button>}
      >
        <div className="space-y-4">
          <div className="flex gap-2 items-end">
            <Input
              label="Verification code"
              wrapperClass="mb-0 flex-1"
              value={verifyCode}
              onChange={(event) => setVerifyCode(event.target.value.toUpperCase())}
              placeholder="ABCD-EFGH-JKLM"
            />
            <Button variant="primary" loading={verifying} onClick={verify}>Check</Button>
          </div>

          {verifyResult && (
            <div className={`neu-alert ${verifyResult.valid ? 'neu-alert-success' : 'neu-alert-error'}`}>
              <div className="min-w-0">
                <p className="font-semibold mb-1" style={{ color: 'var(--neu-ink)' }}>
                  {verifyResult.valid ? 'Valid certificate' : 'Not valid'}
                </p>
                {verifyResult.certificate ? (
                  <p className="text-sm mb-0">
                    {verifyResult.certificate.title}
                    {verifyResult.certificate.student_name ? ` · ${verifyResult.certificate.student_name}` : ''}
                    {' · '}
                    {verifyResult.certificate.institution_name}
                    {verifyResult.status !== 'issued' ? ` (${verifyResult.status})` : ''}
                  </p>
                ) : (
                  <p className="text-sm mb-0">{verifyResult.reason || 'No certificate matches that code.'}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </MainLayout>
  );
}
