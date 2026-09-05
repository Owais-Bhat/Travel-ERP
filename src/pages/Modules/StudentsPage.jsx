import { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import Select from '../../components/Common/Select';
import Modal from '../../components/Common/Modal';
import Avatar from '../../components/Common/Avatar';
import PhotoUpload from '../../components/Common/PhotoUpload';
import { useAppData } from '../../hooks/useAppData';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDate, fileHref } from '../../utils/helpers';
import api from '../../lib/api';
import { analyzeStudentRisk } from '../../lib/openrouter';
import {
  MdAdd,
  MdEdit,
  MdDelete,
  MdSearch,
  MdDownload,
  MdPeople,
  MdFilterList,
  MdWarning,
  MdAutoAwesome,
} from 'react-icons/md';

const ITEMS_PER_PAGE = 20;

const CLASS_OPTIONS = [
  'Nursery', 'KG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12',
];

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  dob: '',
  gender: '',
  class_name: '',
  section: '',
  admission_no: '',
  parent_name: '',
  parent_phone: '',
  parent_email: '',
  address: '',
  status: 'active',
};

function StatusBadge({ status }) {
  const map = {
    active: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    inactive: 'bg-gray-500/20 text-gray-300 border border-gray-500/30',
  };
  const cls = map[status] || 'bg-gray-500/20 text-gray-300 border border-gray-500/30';
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>
      {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'}
    </span>
  );
}

function StudentFormFields({ form, onChange, errors }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="First Name"
          required
          value={form.first_name}
          onChange={(e) => onChange('first_name', e.target.value)}
          placeholder="First name"
          error={errors.first_name}
          wrapperClass="mb-0"
        />
        <Input
          label="Last Name"
          required
          value={form.last_name}
          onChange={(e) => onChange('last_name', e.target.value)}
          placeholder="Last name"
          error={errors.last_name}
          wrapperClass="mb-0"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => onChange('email', e.target.value)}
          placeholder="student@email.com"
          wrapperClass="mb-0"
        />
        <Input
          label="Phone"
          value={form.phone}
          onChange={(e) => onChange('phone', e.target.value)}
          placeholder="10-digit phone"
          wrapperClass="mb-0"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Date of Birth"
          type="date"
          value={form.dob}
          onChange={(e) => onChange('dob', e.target.value)}
          wrapperClass="mb-0"
        />
        <Select
          label="Gender"
          value={form.gender}
          onChange={(e) => onChange('gender', e.target.value)}
          options={[
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
            { value: 'other', label: 'Other' },
            { value: 'prefer_not_to_say', label: 'Prefer not to say' },
          ]}
          placeholder="Select gender"
          className="mb-0"
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Select
          label="Class"
          value={form.class_name}
          onChange={(e) => onChange('class_name', e.target.value)}
          options={CLASS_OPTIONS}
          placeholder="Select class"
          className="mb-0"
        />
        <Input
          label="Section"
          value={form.section}
          onChange={(e) => onChange('section', e.target.value)}
          placeholder="A"
          wrapperClass="mb-0"
        />
        <Input
          label="Admission No."
          value={form.admission_no}
          onChange={(e) => onChange('admission_no', e.target.value)}
          placeholder="Auto-generated if blank"
          wrapperClass="mb-0"
        />
      </div>
      <div className="border-t border-white/10 pt-4">
        <p className="text-sm text-white/50 mb-3 uppercase tracking-wider">Parent / Guardian</p>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Parent Name"
            value={form.parent_name}
            onChange={(e) => onChange('parent_name', e.target.value)}
            placeholder="Parent full name"
            wrapperClass="mb-0"
          />
          <Input
            label="Parent Phone"
            value={form.parent_phone}
            onChange={(e) => onChange('parent_phone', e.target.value)}
            placeholder="10-digit phone"
            wrapperClass="mb-0"
          />
        </div>
        <Input
          label="Parent Email"
          type="email"
          value={form.parent_email}
          onChange={(e) => onChange('parent_email', e.target.value)}
          placeholder="parent@email.com"
          wrapperClass="mb-0 mt-4"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Address</label>
        <textarea
          className="input-glass w-full resize-none"
          rows={3}
          value={form.address}
          onChange={(e) => onChange('address', e.target.value)}
          placeholder="Full address"
        />
      </div>
      <Select
        label="Status"
        value={form.status}
        onChange={(e) => onChange('status', e.target.value)}
        options={[
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ]}
        className="mb-0"
      />
    </div>
  );
}

export default function StudentsPage() {
  const { students, loadStudents, addStudent, updateStudent, deleteStudent } = useAppData();
  const { profile } = useAuth();
  const notification = useNotification();

  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editStudent, setEditStudent] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // AI risk-check state
  const [riskTarget, setRiskTarget] = useState(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskSnapshot, setRiskSnapshot] = useState(null);
  const [riskResult, setRiskResult] = useState(null);
  const [riskError, setRiskError] = useState(null);

  // Form state
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});

  // Filter / search / pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Load on mount
  useEffect(() => {
    const load = async () => {
      setPageLoading(true);
      setPageError(null);
      try {
        await loadStudents(profile?.institution_id);
      } catch (err) {
        setPageError(err.message || 'Failed to load students');
      } finally {
        setPageLoading(false);
      }
    };
    if (profile?.institution_id) load();
  }, [profile?.institution_id]);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [searchTerm, classFilter, statusFilter]);

  // Derived filtered list
  const filteredStudents = (students || []).filter((s) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      !term ||
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(term) ||
      (s.admission_no || '').toLowerCase().includes(term) ||
      (s.class_name || '').toLowerCase().includes(term);
    const matchesClass = !classFilter || s.class_name === classFilter;
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchesSearch && matchesClass && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / ITEMS_PER_PAGE));
  const paginatedStudents = filteredStudents.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Unique class names from data + standard list
  const availableClasses = [
    ...new Set([...CLASS_OPTIONS, ...(students || []).map((s) => s.class_name).filter(Boolean)]),
  ].sort((a, b) => CLASS_OPTIONS.indexOf(a) - CLASS_OPTIONS.indexOf(b));

  const handleFormChange = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormErrors((prev) => ({ ...prev, [field]: undefined }));
  }, []);

  const validateForm = () => {
    const errors = {};
    if (!form.first_name.trim()) errors.first_name = 'First name is required';
    if (!form.last_name.trim()) errors.last_name = 'Last name is required';
    return errors;
  };

  const handleOpenAdd = () => {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setShowAddModal(true);
  };

  const handleOpenEdit = (student) => {
    setForm({
      first_name: student.first_name || '',
      last_name: student.last_name || '',
      email: student.email || '',
      phone: student.phone || '',
      dob: student.dob || '',
      gender: student.gender || '',
      class_name: student.class_name || '',
      section: student.section || '',
      admission_no: student.admission_no || '',
      parent_name: student.parent_name || '',
      parent_phone: student.parent_phone || '',
      parent_email: student.parent_email || '',
      address: student.address || '',
      status: student.status || 'active',
    });
    setFormErrors({});
    setEditStudent(student);
  };

  const handleSaveAdd = async () => {
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        institution_id: profile.institution_id,
        admission_no: form.admission_no.trim() || `ADM${Date.now()}`,
      };
      const result = await addStudent(payload);
      if (result?.success === false) throw new Error(result.error || 'Failed to add student');
      notification.success('Student added successfully');
      setShowAddModal(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      notification.error(err.message || 'Failed to add student');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setSaving(true);
    try {
      const result = await updateStudent(editStudent.id, form);
      if (result?.success === false) throw new Error(result.error || 'Failed to update student');
      notification.success('Student updated successfully');
      setEditStudent(null);
    } catch (err) {
      notification.error(err.message || 'Failed to update student');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(deleteTarget.id);
    try {
      const result = await deleteStudent(deleteTarget.id);
      if (!result.success) throw new Error(result.error);
      notification.success('Student deleted successfully');
      setDeleteTarget(null);
    } catch (err) {
      notification.error(err.message || 'Failed to delete student');
    } finally {
      setDeleting(null);
    }
  };

  const handleCheckRisk = async (student) => {
    setRiskTarget(student);
    setRiskLoading(true);
    setRiskSnapshot(null);
    setRiskResult(null);
    setRiskError(null);
    try {
      const { data: snapshot } = await api.get(`/students/${student.id}/risk-snapshot`);
      setRiskSnapshot(snapshot);

      const studentData = {
        attendance: snapshot.attendance.attendancePercent ?? 'unknown',
        marksAverage: snapshot.exams.averagePercent ?? 'unknown',
        feeStatus:
          snapshot.fees.outstanding > 0
            ? `₹${snapshot.fees.outstanding} outstanding across ${snapshot.fees.unpaidInvoices} invoice(s)`
            : 'Fully paid',
        behaviorIssues: 'Not tracked in system',
        parentalEngagement: 'Not tracked in system',
        previousPerformance:
          snapshot.exams.examCount > 0
            ? `${snapshot.exams.averagePercent}% average across ${snapshot.exams.examCount} exam(s)`
            : 'No exam history recorded',
      };

      const result = await analyzeStudentRisk(studentData);
      if (result.success) {
        setRiskResult(result.data);
      } else {
        setRiskError(result.error || 'AI analysis failed');
      }
    } catch (err) {
      setRiskError(err.message || 'Failed to load risk snapshot');
    } finally {
      setRiskLoading(false);
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'Admission No', 'First Name', 'Last Name', 'Email', 'Phone',
      'DOB', 'Gender', 'Class', 'Section',
      'Parent Name', 'Parent Phone', 'Parent Email',
      'Address', 'Status',
    ];
    const rows = filteredStudents.map((s) => [
      s.admission_no, s.first_name, s.last_name, s.email, s.phone,
      s.dob, s.gender, s.class_name, s.section,
      s.parent_name, s.parent_phone, s.parent_email,
      `"${(s.address || '').replace(/"/g, '""')}"`, s.status,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `students_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notification.success('CSV exported successfully');
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-white font-display">Students</h1>
            <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-sm font-medium border border-blue-500/30">
              <MdPeople className="inline mr-1 w-4 h-4" />
              {(students || []).length} total
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleExportCSV} disabled={pageLoading}>
              <MdDownload className="inline mr-1.5 w-4 h-4" /> Export CSV
            </Button>
            <Button variant="primary" onClick={handleOpenAdd} icon={MdAdd}>
              Add Student
            </Button>
          </div>
        </div>

        {/* Error state */}
        {pageError && (
          <GlassCard className="p-4 border border-red-500/30">
            <div className="flex items-center gap-3 text-red-400">
              <MdWarning className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{pageError}</p>
              <Button
                variant="secondary"
                size="sm"
                className="ml-auto"
                onClick={() => { setPageError(null); loadStudents(profile?.institution_id); }}
              >
                Retry
              </Button>
            </div>
          </GlassCard>
        )}

        {/* Filters */}
        <GlassCard className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                className="input-glass w-full pl-9 py-2 text-sm"
                placeholder="Search by name, admission no, class..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 text-white/50 text-sm">
              <MdFilterList className="w-4 h-4" />
            </div>
            <Select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              options={[
                { value: '', label: 'All Classes' },
                ...availableClasses.map((c) => ({ value: c, label: `Class ${c}` })),
              ]}
              className="py-2 text-sm min-w-[130px] mb-0"
            />
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
              className="py-2 text-sm min-w-[120px] mb-0"
            />
            {(searchTerm || classFilter || statusFilter !== 'all') && (
              <button
                className="text-xs text-white/40 hover:text-white/70 transition underline"
                onClick={() => { setSearchTerm(''); setClassFilter(''); setStatusFilter('all'); }}
              >
                Clear filters
              </button>
            )}
          </div>
          {filteredStudents.length !== (students || []).length && (
            <p className="mt-2 text-xs text-white/40">
              Showing {filteredStudents.length} of {(students || []).length} students
            </p>
          )}
        </GlassCard>

        {/* Table */}
        <GlassCard className="p-0 overflow-hidden">
          {pageLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center space-y-3">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white/70 rounded-full animate-spin mx-auto" />
                <p className="text-white/50 text-sm">Loading students...</p>
              </div>
            </div>
          ) : paginatedStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                <MdPeople className="w-8 h-8 text-white/20" />
              </div>
              <p className="text-white/50 text-lg font-medium">No students found</p>
              <p className="text-white/30 text-sm max-w-xs text-center">
                {searchTerm || classFilter || statusFilter !== 'all'
                  ? 'Try adjusting your filters or search term.'
                  : 'Add your first student to get started.'}
              </p>
              {!searchTerm && !classFilter && statusFilter === 'all' && (
                <Button variant="primary" size="sm" onClick={handleOpenAdd} icon={MdAdd}>
                  Add Student
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/3">
                      <th className="text-left py-3 px-4 text-white/50 font-medium">Student</th>
                      <th className="text-left py-3 px-4 text-white/50 font-medium">Admission #</th>
                      <th className="text-left py-3 px-4 text-white/50 font-medium">Class</th>
                      <th className="text-left py-3 px-4 text-white/50 font-medium">Contact</th>
                      <th className="text-left py-3 px-4 text-white/50 font-medium">Parent</th>
                      <th className="text-left py-3 px-4 text-white/50 font-medium">Status</th>
                      <th className="text-center py-3 px-4 text-white/50 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedStudents.map((student) => (
                      <tr
                        key={student.id}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <Avatar
                              name={`${student.first_name} ${student.last_name}`}
                              src={fileHref(student.photo_url)}
                              size="sm"
                            />
                            <div>
                              <p className="text-white font-medium">
                                {student.first_name} {student.last_name}
                              </p>
                              {student.dob && (
                                <p className="text-white/40 text-xs">{formatDate(student.dob)}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-white/70 font-mono text-xs">
                          {student.admission_no || '—'}
                        </td>
                        <td className="py-3 px-4 text-white/80">
                          {student.class_name
                            ? `Class ${student.class_name}${student.section ? ` - ${student.section}` : ''}`
                            : '—'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="space-y-0.5">
                            {student.phone && <p className="text-white/70 text-xs">{student.phone}</p>}
                            {student.email && <p className="text-white/50 text-xs truncate max-w-[140px]">{student.email}</p>}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="space-y-0.5">
                            {student.parent_name && (
                              <p className="text-white/70 text-xs">{student.parent_name}</p>
                            )}
                            {student.parent_phone && (
                              <p className="text-white/50 text-xs">{student.parent_phone}</p>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={student.status} />
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleCheckRisk(student)}
                              className="p-1.5 rounded-lg hover:bg-purple-500/20 text-purple-400 hover:text-purple-300 transition"
                              title="AI risk check"
                            >
                              <MdAutoAwesome className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleOpenEdit(student)}
                              className="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 transition"
                              title="Edit student"
                            >
                              <MdEdit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(student)}
                              disabled={deleting === student.id}
                              className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 hover:text-red-300 transition disabled:opacity-50"
                              title="Delete student"
                            >
                              <MdDelete className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
                  <p className="text-white/40 text-xs">
                    Page {currentPage} of {totalPages} &bull; {filteredStudents.length} results
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const page = Math.max(1, Math.min(currentPage - 2, totalPages - 4)) + i;
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`w-8 h-8 rounded text-xs font-medium transition ${
                            page === currentPage
                              ? 'bg-blue-500/30 text-blue-300 border border-blue-500/40'
                              : 'text-white/50 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </GlassCard>

        {/* Add Student Modal */}
        <Modal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Add New Student"
          maxWidth="max-w-2xl"
          footer={
            <>
              <Button variant="secondary" disabled={saving} onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" loading={saving} onClick={handleSaveAdd}>
                Save Student
              </Button>
            </>
          }
        >
          <StudentFormFields form={form} onChange={handleFormChange} errors={formErrors} />
        </Modal>

        {/* Edit Student Modal */}
        <Modal
          open={!!editStudent}
          onClose={() => setEditStudent(null)}
          title={editStudent ? `Edit — ${editStudent.first_name} ${editStudent.last_name}` : 'Edit Student'}
          maxWidth="max-w-2xl"
          footer={
            <>
              <Button variant="secondary" disabled={saving} onClick={() => setEditStudent(null)}>
                Cancel
              </Button>
              <Button variant="primary" loading={saving} onClick={handleSaveEdit}>
                Save Changes
              </Button>
            </>
          }
        >
          {editStudent && (
            <div className="flex justify-center mb-5">
              <PhotoUpload
                name={`${editStudent.first_name} ${editStudent.last_name || ''}`}
                src={editStudent.photo_url}
                onUpload={async (file) => {
                  const formData = new FormData();
                  formData.append('file', file);
                  const { data } = await api.post(`/students/${editStudent.id}/photo`, formData);
                  setEditStudent((s) => ({ ...s, photo_url: data.photo_url }));
                  loadStudents(profile?.institution_id);
                  return data.photo_url;
                }}
              />
            </div>
          )}
          <StudentFormFields form={form} onChange={handleFormChange} errors={formErrors} />
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title="Confirm Delete"
          maxWidth="max-w-md"
          footer={
            <>
              <Button
                variant="secondary"
                disabled={!!deleting}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30"
                loading={!!deleting}
                onClick={handleConfirmDelete}
              >
                Yes, Delete
              </Button>
            </>
          }
        >
          <div className="text-center space-y-4 py-4">
            <div className="w-14 h-14 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto">
              <MdWarning className="w-7 h-7 text-red-400" />
            </div>
            <p className="text-white text-lg font-medium">
              Delete {deleteTarget?.first_name} {deleteTarget?.last_name}?
            </p>
            <p className="text-white/50 text-sm">
              This action cannot be undone. All data associated with this student will be permanently removed.
            </p>
          </div>
        </Modal>

        {/* AI Risk Check Modal */}
        <Modal
          open={!!riskTarget}
          onClose={() => setRiskTarget(null)}
          title={riskTarget ? `AI Risk Check — ${riskTarget.first_name} ${riskTarget.last_name || ''}` : 'AI Risk Check'}
          maxWidth="max-w-2xl"
          footer={
            <Button variant="secondary" onClick={() => setRiskTarget(null)}>
              Close
            </Button>
          }
        >
          {riskLoading && (
            <div className="flex items-center justify-center gap-3 py-10 text-white/60">
              <MdAutoAwesome className="w-5 h-5 animate-pulse text-purple-400" />
              Analyzing attendance, fees and exam trends...
            </div>
          )}

          {!riskLoading && riskError && (
            <div className="text-center py-8 space-y-2">
              <MdWarning className="w-8 h-8 text-red-400 mx-auto" />
              <p className="text-red-300 text-sm">{riskError}</p>
            </div>
          )}

          {!riskLoading && !riskError && riskSnapshot && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center">
                  <p className="text-white/40 text-xs mb-1">Attendance (60d)</p>
                  <p className="text-white text-lg font-semibold">
                    {riskSnapshot.attendance.attendancePercent ?? '—'}
                    {riskSnapshot.attendance.attendancePercent !== null ? '%' : ''}
                  </p>
                </div>
                <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center">
                  <p className="text-white/40 text-xs mb-1">Fees Outstanding</p>
                  <p className="text-white text-lg font-semibold">₹{riskSnapshot.fees.outstanding}</p>
                </div>
                <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center">
                  <p className="text-white/40 text-xs mb-1">Exam Average</p>
                  <p className="text-white text-lg font-semibold">
                    {riskSnapshot.exams.averagePercent ?? '—'}
                    {riskSnapshot.exams.averagePercent !== null ? '%' : ''}
                  </p>
                </div>
              </div>

              {riskResult && (
                <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-4">
                  <p className="text-purple-300 text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <MdAutoAwesome className="w-3.5 h-3.5" /> AI Assessment
                  </p>
                  <pre className="text-white/80 text-sm whitespace-pre-wrap font-sans">{riskResult}</pre>
                </div>
              )}
            </div>
          )}
        </Modal>
      </div>
    </MainLayout>
  );
}
