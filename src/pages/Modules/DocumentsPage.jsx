import { useCallback, useMemo, useRef, useState } from 'react';
import {
  MdFolderShared, MdUploadFile, MdCheckCircle, MdCancel,
  MdPendingActions, MdBusiness, MdOpenInNew, MdDelete, MdVerified, MdDescription,
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
import { useAuth } from '../../hooks/useAuth';
import { canManageTenantUsers } from '../../auth/permissions';
import api from '../../lib/api';
import { API_BASE_URL } from '../../config';
import { formatDate } from '../../utils/helpers';

const STUDENT_DOC_TYPES = [
  'photo', 'id_proof', 'address_proof', 'birth_certificate', 'transfer_certificate',
  'marksheet', 'degree', 'income_certificate', 'caste_certificate', 'medical', 'other',
];

const INSTITUTION_DOC_TYPES = [
  'registration', 'accreditation', 'affiliation', 'tax', 'address_proof', 'authorised_signatory', 'other',
];

const STATUSES = ['pending', 'verified', 'rejected'];

const titleCase = (value) => String(value || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Uploads are served relative to the API host, not the SPA host. */
const fileHref = (url) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE_URL.replace(/\/api\/?$/, '')}${url}`;
};

const formatBytes = (bytes) => {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

export default function DocumentsPage() {
  const notification = useNotification();
  const { profile } = useAuth();
  const isAdmin = canManageTenantUsers(profile?.role);

  const [tab, setTab] = useState('students');
  const [statusFilter, setStatusFilter] = useState('');
  const params = useMemo(() => (statusFilter ? { status: statusFilter } : {}), [statusFilter]);

  const documents = useResource('/documents/students', { params, auto: tab === 'students' });
  const institution = useEndpoint('/documents/institution', { enabled: tab === 'institution' && isAdmin });

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({ doc_type: 'id_proof', name: '', notes: '', student_id: '' });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);

  const [studentQuery, setStudentQuery] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);

  const refresh = useCallback(() => {
    if (tab === 'students') documents.reload();
    else institution.reload();
  }, [tab, documents, institution]);

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

  const upload = async () => {
    if (!file) {
      notification.error('Choose a file to upload');
      return;
    }
    if (tab === 'students' && !selectedStudent) {
      notification.error('Choose the student this document belongs to');
      return;
    }

    // multipart/form-data — the axios client sets the boundary itself.
    const body = new FormData();
    body.append('file', file);
    body.append('doc_type', uploadForm.doc_type);
    if (uploadForm.name) body.append('name', uploadForm.name);
    if (uploadForm.notes) body.append('notes', uploadForm.notes);
    if (tab === 'students') body.append('student_id', selectedStudent.id);

    setUploading(true);
    try {
      await api.post(tab === 'students' ? '/documents/students' : '/documents/institution', body);
      notification.success('Document uploaded');
      setUploadOpen(false);
      setFile(null);
      setUploadForm({ doc_type: tab === 'students' ? 'id_proof' : 'registration', name: '', notes: '', student_id: '' });
      setSelectedStudent(null);
      setStudentQuery('');
      refresh();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const review = async (document, status) => {
    try {
      await api.post(`/documents/students/${document.id}/verify`, { status });
      notification.success(`Marked ${status}`);
      refresh();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to update document');
    }
  };

  const remove = async (document) => {
    if (!window.confirm(`Delete "${document.name}"? The file is removed permanently.`)) return;
    try {
      await api.delete(`/documents/students/${document.id}`);
      notification.success('Document deleted');
      refresh();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to delete document');
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Document',
      render: (row) => (
        <div className="flex items-center gap-2.5 min-w-0">
          {row.mime_type?.startsWith('image/') && row.file_url ? (
            <img src={fileHref(row.file_url)} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-black/5 flex items-center justify-center shrink-0">
              <MdDescription className="w-4 h-4" style={{ color: 'var(--neu-ink-muted)' }} />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold mb-0 truncate" style={{ color: 'var(--neu-ink)' }}>{row.name}</p>
            <p className="text-xs mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
              {titleCase(row.doc_type)} · {formatBytes(row.size_bytes)}
            </p>
          </div>
        </div>
      ),
    },
    { key: 'student_name', label: 'Belongs to', render: (row) => row.student_name || row.applicant_name || '—' },
    { key: 'created_at', label: 'Uploaded', hideOnMobile: true, render: (row) => formatDate(row.created_at) },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        <div className="flex gap-1 justify-end">
          {row.file_url && (
            <a
              href={fileHref(row.file_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="neu-btn neu-btn-ghost neu-btn-xs"
              aria-label={`Open ${row.name}`}
            >
              <MdOpenInNew className="w-3.5 h-3.5" />
            </a>
          )}
          {isAdmin && row.status !== 'verified' && (
            <Button size="xs" variant="ghost" icon={MdCheckCircle} onClick={() => review(row, 'verified')} aria-label="Verify" />
          )}
          {isAdmin && row.status !== 'rejected' && (
            <Button size="xs" variant="ghost" icon={MdCancel} onClick={() => review(row, 'rejected')} aria-label="Reject" />
          )}
          {isAdmin && (
            <Button size="xs" variant="ghost" icon={MdDelete} onClick={() => remove(row)} aria-label="Delete" />
          )}
        </div>
      ),
    },
  ];

  const counts = documents.rows.reduce((totals, row) => {
    totals[row.status] = (totals[row.status] || 0) + 1;
    return totals;
  }, {});

  const verification = institution.data?.verification;

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 space-y-6 scene">
        <PageHeader
          title="Document Vault"
          subtitle="Collect, verify and store student and institution paperwork"
          icon={MdFolderShared}
          actions={
            <Button
              variant="primary"
              icon={MdUploadFile}
              onClick={() => {
                setUploadForm((f) => ({ ...f, doc_type: tab === 'students' ? 'id_proof' : 'registration' }));
                setUploadOpen(true);
              }}
            >
              Upload
            </Button>
          }
        />

        <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StaggerItem>
            <StatCard label="On this page" value={documents.pagination.total || 0} icon={MdFolderShared} />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Pending review" value={counts.pending || 0} tone="amber" icon={MdPendingActions} />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Verified" value={counts.verified || 0} tone="success" icon={MdCheckCircle} />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Rejected" value={counts.rejected || 0} tone="danger" icon={MdCancel} />
          </StaggerItem>
        </Stagger>

        {isAdmin && (
          <Reveal>
            <Tabs
              id="document-tabs"
              value={tab}
              onChange={setTab}
              tabs={[
                { key: 'students', label: 'Student documents', icon: MdFolderShared },
                { key: 'institution', label: 'Institution verification', icon: MdBusiness },
              ]}
            />
          </Reveal>
        )}

        {tab === 'students' && (
          <Reveal delay={0.05}>
            <DataTable
              columns={columns}
              rows={documents.rows}
              loading={documents.loading}
              error={documents.error}
              search={documents.search}
              onSearchChange={documents.setSearch}
              searchPlaceholder="Search documents…"
              pagination={documents.pagination}
              onPageChange={documents.setPage}
              toolbar={
                <Select
                  wrapperClass="mb-0 w-40"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  placeholder="All statuses"
                  options={STATUSES.map((status) => ({ value: status, label: titleCase(status) }))}
                />
              }
              empty={{
                icon: MdFolderShared,
                title: 'No documents yet',
                description: 'Upload ID proofs, marksheets and certificates against a student or an application.',
                action: <Button variant="primary" icon={MdUploadFile} onClick={() => setUploadOpen(true)}>Upload</Button>,
              }}
            />
          </Reveal>
        )}

        {tab === 'institution' && isAdmin && (
          <Reveal delay={0.05}>
            <div className="space-y-4">
              <Surface variant="raised">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold mb-1" style={{ color: 'var(--neu-ink)' }}>
                      Verification status
                    </p>
                    <p className="text-sm mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
                      {verification?.verification_notes
                        || 'Upload your registration and accreditation papers, and the platform team will review them.'}
                    </p>
                  </div>
                  <Badge status={verification?.verification_status || 'pending'} />
                </div>

                {verification?.verified_at && (
                  <p className="text-xs mt-3 mb-0 inline-flex items-center gap-1" style={{ color: 'var(--neu-success)' }}>
                    <MdVerified className="w-4 h-4" /> Verified on {formatDate(verification.verified_at)}
                  </p>
                )}
              </Surface>

              <Surface variant="raised" className="!p-0 overflow-hidden">
                {institution.loading ? (
                  <div className="p-6"><div className="neu-skeleton h-16" /></div>
                ) : institution.data?.documents?.length ? (
                  institution.data.documents.map((document) => (
                    <div
                      key={document.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      style={{ borderBottom: '1px solid var(--neu-line)' }}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium mb-0 truncate" style={{ color: 'var(--neu-ink)' }}>
                          {document.name}
                        </p>
                        <p className="text-xs mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
                          {titleCase(document.doc_type)} · {formatDate(document.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge status={document.status} />
                        {document.file_url && (
                          <a
                            href={fileHref(document.file_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="neu-btn neu-btn-ghost neu-btn-xs"
                          >
                            <MdOpenInNew className="w-3.5 h-3.5" /> Open
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center">
                    <p className="text-sm mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
                      No verification documents submitted yet.
                    </p>
                  </div>
                )}
              </Surface>
            </div>
          </Reveal>
        )}
      </div>

      {/* Upload */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title={tab === 'students' ? 'Upload a student document' : 'Upload a verification document'}
        maxWidth="max-w-xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={uploading} onClick={upload}>Upload</Button>
          </>
        }
      >
        <div className="space-y-4">
          {tab === 'students' && (
            <div>
              <Input
                label="Student"
                required
                wrapperClass="mb-0"
                value={selectedStudent
                  ? `${selectedStudent.first_name} ${selectedStudent.last_name || ''}`.trim()
                  : studentQuery}
                onChange={(event) => searchStudents(event.target.value)}
                placeholder="Search by name or admission number"
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
                        {student.admission_no || ''}
                      </span>
                    </button>
                  ))}
                </Surface>
              )}
            </div>
          )}

          <Select
            label="Document type"
            wrapperClass="mb-0"
            value={uploadForm.doc_type}
            onChange={(event) => setUploadForm((f) => ({ ...f, doc_type: event.target.value }))}
            options={(tab === 'students' ? STUDENT_DOC_TYPES : INSTITUTION_DOC_TYPES)
              .map((type) => ({ value: type, label: titleCase(type) }))}
          />

          <Input
            label="Display name"
            wrapperClass="mb-0"
            value={uploadForm.name}
            onChange={(event) => setUploadForm((f) => ({ ...f, name: event.target.value }))}
            hint="Defaults to the file name"
          />

          <div>
            <p className="neu-label">File</p>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="w-full p-6 text-center"
              style={{ borderRadius: 'var(--neu-radius)', boxShadow: 'var(--neu-inset)' }}
            >
              <MdUploadFile className="w-7 h-7 mx-auto mb-2" style={{ color: 'var(--neu-primary)' }} />
              <p className="text-sm mb-0" style={{ color: 'var(--neu-ink)' }}>
                {file ? file.name : 'Choose a file'}
              </p>
              <p className="text-xs mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
                {file ? formatBytes(file.size) : 'PDF, JPG, PNG, WEBP, DOC(X) or XLS(X) — up to 10 MB'}
              </p>
            </button>
            <input
              ref={fileInput}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </div>

          <div>
            <label className="neu-label" htmlFor="document-notes">Notes</label>
            <textarea
              id="document-notes"
              className="neu-textarea"
              rows={2}
              value={uploadForm.notes}
              onChange={(event) => setUploadForm((f) => ({ ...f, notes: event.target.value }))}
            />
          </div>
        </div>
      </Modal>
    </MainLayout>
  );
}
