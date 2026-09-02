import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import api from '../../lib/api';
import { useAppData } from '../../hooks/useAppData';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/helpers';
import {
  MdAdd,
  MdClose,
  MdWarning,
  MdInbox,
  MdCheckCircle,
  MdCancel,
  MdSchool,
  MdMoreVert,
  MdThumbUp,
  MdThumbDown,
  MdPersonAdd,
  MdExpandMore,
} from 'react-icons/md';

const CLASS_OPTIONS = [
  'Nursery', 'KG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12',
];

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'enrolled', label: 'Enrolled' },
];

const EMPTY_FORM = {
  applicant_name: '',
  email: '',
  phone: '',
  dob: '',
  class_applying: '',
  parent_name: '',
  parent_phone: '',
  address: '',
};

function StatusBadge({ status }) {
  const map = {
    pending: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    approved: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
    rejected: 'bg-red-500/15 text-red-300 border border-red-500/30',
    enrolled: 'bg-blue-500/15 text-blue-300 border border-blue-500/30',
  };
  const cls = map[status] || 'bg-gray-500/15 text-gray-300 border border-gray-500/30';
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>
      {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'}
    </span>
  );
}

function Modal({ title, onClose, children, maxWidth = 'max-w-2xl' }) {
  // Portalled to <body>: MainLayout's ancestors set `perspective` and
  // `will-change: transform` for the 3D shell, which gives fixed-position
  // descendants a new containing block instead of the viewport — an
  // in-place backdrop here would land off-screen.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 w-full ${maxWidth} max-h-[90vh] overflow-y-auto glass-card rounded-xl p-6 shadow-2xl`}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition"
          >
            <MdClose className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function ProcessDropdown({ admission, onAction }) {
  const [open, setOpen] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [showRemarks, setShowRemarks] = useState(null); // 'approve' | 'reject'
  const [loading, setLoading] = useState(false);

  const handleAction = async (action) => {
    setLoading(true);
    await onAction(admission.id, action, remarks);
    setLoading(false);
    setOpen(false);
    setShowRemarks(null);
    setRemarks('');
  };

  const canEnroll = admission.status === 'approved';
  const canApprove = admission.status === 'pending';
  const canReject = admission.status === 'pending' || admission.status === 'approved';

  if (admission.status === 'enrolled') {
    return (
      <span className="text-xs text-blue-400 flex items-center gap-1">
        <MdSchool className="w-3 h-3" /> Enrolled
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition flex items-center gap-1"
      >
        <MdMoreVert className="w-4 h-4" />
        <MdExpandMore className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 glass-card rounded-lg shadow-xl border border-white/10 min-w-[170px] overflow-hidden">
            {showRemarks ? (
              <div className="p-3 space-y-2">
                <p className="text-xs text-white/60 font-medium uppercase tracking-wider">
                  {showRemarks === 'approve' ? 'Approve' : 'Reject'} with remarks
                </p>
                <textarea
                  className="input-glass w-full resize-none text-xs"
                  rows={3}
                  placeholder="Optional remarks..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    disabled={loading}
                    onClick={() => handleAction(showRemarks)}
                    className={`flex-1 py-1.5 rounded text-xs font-medium transition ${
                      showRemarks === 'approve'
                        ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                        : 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                    } disabled:opacity-50`}
                  >
                    {loading ? '...' : 'Confirm'}
                  </button>
                  <button
                    className="px-2 py-1.5 rounded text-xs text-white/40 hover:text-white transition"
                    onClick={() => { setShowRemarks(null); setRemarks(''); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {canApprove && (
                  <button
                    onClick={() => setShowRemarks('approve')}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-emerald-300 hover:bg-emerald-500/10 transition text-left"
                  >
                    <MdThumbUp className="w-4 h-4" /> Approve
                  </button>
                )}
                {canReject && (
                  <button
                    onClick={() => setShowRemarks('reject')}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-300 hover:bg-red-500/10 transition text-left"
                  >
                    <MdThumbDown className="w-4 h-4" /> Reject
                  </button>
                )}
                {canEnroll && (
                  <button
                    disabled={loading}
                    onClick={() => handleAction('enroll')}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-blue-300 hover:bg-blue-500/10 transition text-left disabled:opacity-50"
                  >
                    <MdPersonAdd className="w-4 h-4" /> {loading ? 'Enrolling...' : 'Enroll as Student'}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function AdmissionsPage() {
  const { admissions, loadAdmissions, addAdmission, updateAdmission, loadStudents } = useAppData();
  const { profile } = useAuth();
  const notification = useNotification();

  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});

  const [activeTab, setActiveTab] = useState('all');

  // Load admissions on mount
  useEffect(() => {
    const load = async () => {
      setPageLoading(true);
      setPageError(null);
      try {
        await loadAdmissions();
      } catch (err) {
        setPageError(err.message || 'Failed to load admissions');
      } finally {
        setPageLoading(false);
      }
    };
    if (profile?.institution_id) load();
  }, [profile?.institution_id]);

  // The context loader is the single source of truth; the old duplicate
  // direct-fetch fallback went through Supabase and no longer exists.
  const allAdmissions = admissions || [];

  const filteredAdmissions = activeTab === 'all'
    ? allAdmissions
    : allAdmissions.filter((a) => a.status === activeTab);

  const stats = {
    total: allAdmissions.length,
    pending: allAdmissions.filter((a) => a.status === 'pending').length,
    approved: allAdmissions.filter((a) => a.status === 'approved').length,
    rejected: allAdmissions.filter((a) => a.status === 'rejected').length,
    enrolled: allAdmissions.filter((a) => a.status === 'enrolled').length,
  };

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validateForm = () => {
    const errors = {};
    if (!form.applicant_name.trim()) errors.applicant_name = 'Applicant name is required';
    if (!form.class_applying) errors.class_applying = 'Class is required';
    return errors;
  };

  const refreshAdmissions = useCallback(async () => {
    if (!profile?.institution_id) return;
    try {
      await loadAdmissions();
    } catch (err) {
      notification.error(err.message || 'Failed to refresh admissions');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.institution_id]);

  const handleSaveApplication = async () => {
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setSaving(true);
    try {
      // institution_id and status come from the server; sending them here
      // would just be ignored by the validator.
      const result = await addAdmission(form);
      if (result?.success === false) throw new Error(result.error || 'Failed to add application');
      await refreshAdmissions();
      notification.success('Application submitted successfully');
      setShowAddModal(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      notification.error(err.message || 'Failed to submit application');
    } finally {
      setSaving(false);
    }
  };

  const handleProcessAction = async (admissionId, action, remarks) => {
    const admission = allAdmissions.find((a) => a.id === admissionId);
    if (!admission) return;

    try {
      if (action === 'approve' || action === 'reject') {
        const result = await updateAdmission(admissionId, {
          status: action === 'approve' ? 'approved' : 'rejected',
          remarks: remarks || null,
        });
        if (result?.success === false) throw new Error(result.error);
        await refreshAdmissions();
        notification.success(action === 'approve' ? 'Application approved' : 'Application rejected');
      } else if (action === 'enroll') {
        // One server-side transaction creates the student, links it back to
        // the application, moves any collected documents across and fills a
        // program seat — the old two-step client version could half-apply.
        await api.post(`/admissions/${admissionId}/enrol`, {
          class_name: admission.class_applying || undefined,
        });
        await refreshAdmissions();
        await loadStudents();
        notification.success(`${admission.applicant_name} enrolled as a student successfully`);
      }
    } catch (err) {
      notification.error(err.message || `Failed to ${action} application`);
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Admissions</h1>
            <p className="text-white/50 text-sm mt-1">Manage student applications and enrollments</p>
          </div>
          <Button variant="primary" onClick={() => { setForm(EMPTY_FORM); setFormErrors({}); setShowAddModal(true); }}>
            <MdAdd className="inline mr-1.5 w-4 h-4" /> New Application
          </Button>
        </div>

        {pageError && (
          <GlassCard className="p-4 border border-red-500/30">
            <div className="flex items-center gap-3 text-red-400">
              <MdWarning className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{pageError}</p>
              <Button
                variant="secondary"
                size="sm"
                className="ml-auto"
                onClick={() => { setPageError(null); refreshAdmissions(); }}
              >
                Retry
              </Button>
            </div>
          </GlassCard>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Total', value: stats.total, color: 'text-white' },
            { label: 'Pending', value: stats.pending, color: 'text-amber-400' },
            { label: 'Approved', value: stats.approved, color: 'text-emerald-400' },
            { label: 'Rejected', value: stats.rejected, color: 'text-red-400' },
            { label: 'Enrolled', value: stats.enrolled, color: 'text-blue-400' },
          ].map(({ label, value, color }) => (
            <GlassCard key={label} className="p-4">
              <p className="text-white/50 text-xs mb-1 uppercase tracking-wider">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </GlassCard>
          ))}
        </div>

        {/* Status Tab Filters */}
        <div className="flex gap-1 flex-wrap">
          {STATUS_TABS.map((tab) => {
            const count = tab.key === 'all' ? allAdmissions.length : stats[tab.key];
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  activeTab === tab.key
                    ? 'bg-white/15 text-white border border-white/20'
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                    activeTab === tab.key ? 'bg-white/20' : 'bg-white/10'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Admissions Table */}
        <GlassCard className="p-0 overflow-hidden">
          {pageLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center space-y-3">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white/70 rounded-full animate-spin mx-auto" />
                <p className="text-white/50 text-sm">Loading applications...</p>
              </div>
            </div>
          ) : filteredAdmissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                <MdInbox className="w-8 h-8 text-white/20" />
              </div>
              <p className="text-white/50 text-lg font-medium">No applications found</p>
              <p className="text-white/30 text-sm">
                {activeTab !== 'all'
                  ? `No ${activeTab} applications at this time.`
                  : 'Start by adding a new application.'}
              </p>
              {activeTab === 'all' && (
                <Button variant="primary" size="sm" onClick={() => { setForm(EMPTY_FORM); setFormErrors({}); setShowAddModal(true); }}>
                  <MdAdd className="inline mr-1 w-4 h-4" /> New Application
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/3">
                    <th className="text-left py-3 px-4 text-white/50 font-medium">Applicant</th>
                    <th className="text-left py-3 px-4 text-white/50 font-medium">Class</th>
                    <th className="text-left py-3 px-4 text-white/50 font-medium">Contact</th>
                    <th className="text-left py-3 px-4 text-white/50 font-medium">Parent</th>
                    <th className="text-left py-3 px-4 text-white/50 font-medium">Applied</th>
                    <th className="text-left py-3 px-4 text-white/50 font-medium">Status</th>
                    <th className="text-left py-3 px-4 text-white/50 font-medium">Remarks</th>
                    <th className="text-center py-3 px-4 text-white/50 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdmissions.map((app) => (
                    <tr key={app.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center text-xs font-bold text-white/60 flex-shrink-0">
                            {(app.applicant_name?.[0] || '').toUpperCase()}
                          </div>
                          <div>
                            <p className="text-white font-medium">{app.applicant_name}</p>
                            {app.dob && (
                              <p className="text-white/40 text-xs">DOB: {formatDate(app.dob)}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-white/80">
                        {app.class_applying ? `Class ${app.class_applying}` : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          {app.phone && <p className="text-white/70 text-xs">{app.phone}</p>}
                          {app.email && (
                            <p className="text-white/50 text-xs truncate max-w-[140px]">{app.email}</p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          {app.parent_name && (
                            <p className="text-white/70 text-xs">{app.parent_name}</p>
                          )}
                          {app.parent_phone && (
                            <p className="text-white/50 text-xs">{app.parent_phone}</p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-white/50 text-xs whitespace-nowrap">
                        {app.applied_at ? formatDate(app.applied_at) : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={app.status} />
                      </td>
                      <td className="py-3 px-4 text-white/40 text-xs max-w-[150px]">
                        {app.remarks ? (
                          <span title={app.remarks} className="truncate block">{app.remarks}</span>
                        ) : (
                          <span className="italic">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <ProcessDropdown admission={app} onAction={handleProcessAction} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

        {/* New Application Modal */}
        {showAddModal && (
          <Modal title="New Application" onClose={() => setShowAddModal(false)}>
            <div className="space-y-4">
              <Input
                label="Applicant Name"
                required
                value={form.applicant_name}
                onChange={(e) => handleFormChange('applicant_name', e.target.value)}
                placeholder="Full name"
                error={formErrors.applicant_name}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(e) => handleFormChange('email', e.target.value)}
                  placeholder="applicant@email.com"
                />
                <Input
                  label="Phone"
                  value={form.phone}
                  onChange={(e) => handleFormChange('phone', e.target.value)}
                  placeholder="10-digit phone"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Date of Birth"
                  type="date"
                  value={form.dob}
                  onChange={(e) => handleFormChange('dob', e.target.value)}
                />
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">
                    Class Applying <span className="text-red-400 ml-1">*</span>
                  </label>
                  <select
                    className={`input-glass w-full ${formErrors.class_applying ? 'border-red-500' : ''}`}
                    value={form.class_applying}
                    onChange={(e) => handleFormChange('class_applying', e.target.value)}
                  >
                    <option value="">Select class</option>
                    {CLASS_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {formErrors.class_applying && (
                    <p className="text-red-400 text-sm mt-1">{formErrors.class_applying}</p>
                  )}
                </div>
              </div>
              <div className="border-t border-white/10 pt-4">
                <p className="text-sm text-white/50 mb-3 uppercase tracking-wider">Parent / Guardian</p>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Parent Name"
                    value={form.parent_name}
                    onChange={(e) => handleFormChange('parent_name', e.target.value)}
                    placeholder="Parent full name"
                  />
                  <Input
                    label="Parent Phone"
                    value={form.parent_phone}
                    onChange={(e) => handleFormChange('parent_phone', e.target.value)}
                    placeholder="10-digit phone"
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Address</label>
                <textarea
                  className="input-glass w-full resize-none"
                  rows={3}
                  value={form.address}
                  onChange={(e) => handleFormChange('address', e.target.value)}
                  placeholder="Full address"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6 pt-4 border-t border-white/10">
              <Button variant="primary" loading={saving} onClick={handleSaveApplication}>
                Submit Application
              </Button>
              <Button variant="secondary" disabled={saving} onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
            </div>
          </Modal>
        )}
      </div>
    </MainLayout>
  );
}
