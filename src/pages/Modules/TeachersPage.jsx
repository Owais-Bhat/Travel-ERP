import { useState, useEffect } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import Select from '../../components/Common/Select';
import Modal from '../../components/Common/Modal';
import Avatar from '../../components/Common/Avatar';
import PhotoUpload from '../../components/Common/PhotoUpload';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { fileHref } from '../../utils/helpers';
import { MdAdd, MdEdit, MdDelete, MdSearch, MdWarning } from 'react-icons/md';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'on_leave', label: 'On Leave' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'resigned', label: 'Resigned' },
];

const EMPTY_FORM = {
  employee_id: '', first_name: '', last_name: '', email: '', phone: '',
  subjects: '', qualification: '', department: '', designation: '',
  joining_date: '', experience_years: '', status: 'active',
};

const STATUS_STYLES = {
  active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  on_leave: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  inactive: 'bg-white/10 text-white/50 border-white/20',
  resigned: 'bg-red-500/20 text-red-300 border-red-500/30',
};

function toFormShape(teacher) {
  return {
    employee_id: teacher.employee_id || '',
    first_name: teacher.first_name || '',
    last_name: teacher.last_name || '',
    email: teacher.email || '',
    phone: teacher.phone || '',
    subjects: (teacher.subjects || []).join(', '),
    qualification: teacher.qualification || '',
    department: teacher.department || '',
    designation: teacher.designation || '',
    joining_date: teacher.joining_date ? String(teacher.joining_date).slice(0, 10) : '',
    experience_years: teacher.experience_years ?? '',
    status: teacher.status || 'active',
  };
}

function toPayload(form) {
  return {
    ...form,
    subjects: form.subjects ? form.subjects.split(',').map((s) => s.trim()).filter(Boolean) : [],
    experience_years: form.experience_years === '' ? undefined : Number(form.experience_years),
  };
}

export default function TeachersPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [editTeacher, setEditTeacher] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadTeachers = async (query = search) => {
    if (!profile?.institution_id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/teachers', { params: query ? { search: query } : {} });
      setTeachers(data || []);
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to load faculty';
      setError(message);
      notification.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (profile) loadTeachers(); }, [profile]);

  let searchTimer;
  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadTeachers(val), 300);
  };

  const handleSaveAdd = async () => {
    if (!form.first_name.trim()) { notification.error('First name is required'); return; }
    setSaving(true);
    try {
      await api.post('/teachers', toPayload(form));
      notification.success('Faculty added!');
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      loadTeachers();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to add faculty');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      await api.put(`/teachers/${editTeacher.id}`, toPayload(form));
      notification.success('Changes saved!');
      setEditTeacher(null);
      loadTeachers();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/teachers/${deleteTarget.id}`);
      setTeachers((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      notification.success('Faculty removed');
      setDeleteTarget(null);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to remove faculty');
    } finally {
      setDeleting(false);
    }
  };

  const FormFields = (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Input label="First Name" required value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
        <Input label="Last Name" value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Employee ID" value={form.employee_id} onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))} />
        <Select label="Status" options={STATUS_OPTIONS} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        <Input label="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Department" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
        <Input label="Designation" value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} />
      </div>
      <Input label="Subjects (comma-separated)" value={form.subjects} onChange={(e) => setForm((f) => ({ ...f, subjects: e.target.value }))} />
      <Input label="Qualification" value={form.qualification} onChange={(e) => setForm((f) => ({ ...f, qualification: e.target.value }))} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Joining Date" type="date" value={form.joining_date} onChange={(e) => setForm((f) => ({ ...f, joining_date: e.target.value }))} />
        <Input label="Experience (years)" type="number" value={form.experience_years} onChange={(e) => setForm((f) => ({ ...f, experience_years: e.target.value }))} />
      </div>
    </>
  );

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Faculty Directory</h1>
            <p className="text-white/50 text-sm mt-1">Manage teachers and their profiles.</p>
          </div>
          <Button variant="primary" onClick={() => { setForm(EMPTY_FORM); setShowAddModal(true); }}>
            <MdAdd className="inline mr-1.5 w-4 h-4" /> Add Faculty
          </Button>
        </div>

        <GlassCard className="p-4">
          <div className="relative">
            <MdSearch className="absolute left-3 top-3 w-4 h-4 text-white/40" />
            <input className="input-glass w-full pl-9" placeholder="Search by name, employee ID, designation..." value={search} onChange={(e) => handleSearch(e.target.value)} />
          </div>
        </GlassCard>

        {loading ? (
          <div className="text-center py-12 text-white/50">Loading...</div>
        ) : error ? (
          <GlassCard className="p-10 text-center">
            <p className="text-red-400 mb-3">{error}</p>
            <Button variant="secondary" onClick={() => loadTeachers()}>Retry</Button>
          </GlassCard>
        ) : teachers.length === 0 ? (
          <GlassCard className="p-10 text-center text-white/40">No faculty added yet.</GlassCard>
        ) : (
          <GlassCard className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-white/50 text-xs uppercase tracking-wider">
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Contact</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((t) => (
                    <tr key={t.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={`${t.first_name} ${t.last_name || ''}`} src={fileHref(t.photo_url)} size="sm" />
                          <div>
                            <p className="text-white font-medium">{t.first_name} {t.last_name}</p>
                            <p className="text-white/40 text-xs">{t.designation || t.employee_id || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-white/70">{t.department || '—'}</td>
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          {t.phone && <p className="text-white/70 text-xs">{t.phone}</p>}
                          {t.email && <p className="text-white/50 text-xs truncate max-w-[160px]">{t.email}</p>}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border capitalize ${STATUS_STYLES[t.status] || STATUS_STYLES.inactive}`}>
                          {t.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button onClick={() => { setEditTeacher(t); setForm(toFormShape(t)); }} className="text-blue-400 hover:text-blue-300 mr-3">
                          <MdEdit className="w-4 h-4 inline" />
                        </button>
                        <button onClick={() => setDeleteTarget(t)} className="text-red-400/60 hover:text-red-400">
                          <MdDelete className="w-4 h-4 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        )}

        <Modal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Add Faculty"
          maxWidth="max-w-2xl"
          footer={
            <>
              <Button variant="secondary" disabled={saving} onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button variant="primary" loading={saving} onClick={handleSaveAdd}>Save Faculty</Button>
            </>
          }
        >
          {FormFields}
        </Modal>

        <Modal
          open={!!editTeacher}
          onClose={() => setEditTeacher(null)}
          title={editTeacher ? `Edit — ${editTeacher.first_name} ${editTeacher.last_name || ''}` : 'Edit Faculty'}
          maxWidth="max-w-2xl"
          footer={
            <>
              <Button variant="secondary" disabled={saving} onClick={() => setEditTeacher(null)}>Cancel</Button>
              <Button variant="primary" loading={saving} onClick={handleSaveEdit}>Save Changes</Button>
            </>
          }
        >
          {editTeacher && (
            <div className="flex justify-center mb-5">
              <PhotoUpload
                name={`${editTeacher.first_name} ${editTeacher.last_name || ''}`}
                src={editTeacher.photo_url}
                onUpload={async (file) => {
                  const formData = new FormData();
                  formData.append('file', file);
                  const { data } = await api.post(`/teachers/${editTeacher.id}/photo`, formData);
                  setEditTeacher((t) => ({ ...t, photo_url: data.photo_url }));
                  loadTeachers();
                  return data.photo_url;
                }}
              />
            </div>
          )}
          {FormFields}
        </Modal>

        <Modal
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title="Confirm Delete"
          maxWidth="max-w-md"
          footer={
            <>
              <Button variant="secondary" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="primary" className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30" loading={deleting} onClick={handleConfirmDelete}>Yes, Delete</Button>
            </>
          }
        >
          <div className="text-center space-y-4 py-4">
            <div className="w-14 h-14 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto">
              <MdWarning className="w-7 h-7 text-red-400" />
            </div>
            <p className="text-white text-lg font-medium">Remove {deleteTarget?.first_name} {deleteTarget?.last_name}?</p>
            <p className="text-white/50 text-sm">This action cannot be undone.</p>
          </div>
        </Modal>
      </div>
    </MainLayout>
  );
}
