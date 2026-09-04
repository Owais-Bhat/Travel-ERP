import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdAdd, MdClose, MdDelete, MdSearch, MdWork } from 'react-icons/md';

const EMPTY_FORM = {
  first_name: '', last_name: '', batch_year: '', class_name: '', email: '', phone: '',
  occupation: '', company: '', linkedin_url: '', notes: '',
};

export default function AlumniPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [alumni, setAlumni] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadAlumni = async (query = search) => {
    if (!profile?.institution_id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/alumni', { params: query ? { search: query, pageSize: 50 } : { pageSize: 50 } });
      setAlumni(data?.data || []);
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to load alumni directory';
      setError(message);
      notification.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (profile) loadAlumni(); }, [profile]);

  let searchTimer;
  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadAlumni(val), 300);
  };

  const handleSave = async () => {
    if (!form.first_name.trim()) { notification.error('First name is required'); return; }
    setSaving(true);
    try {
      await api.post('/alumni', { ...form, batch_year: form.batch_year || null });
      notification.success('Alumni added!');
      setShowModal(false);
      setForm(EMPTY_FORM);
      loadAlumni();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to add alumni');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (person) => {
    if (!window.confirm(`Remove "${person.first_name} ${person.last_name || ''}"?`)) return;
    try {
      await api.delete(`/alumni/${person.id}`);
      setAlumni(prev => prev.filter(a => a.id !== person.id));
      notification.success('Removed');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to remove');
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">Alumni Network</h1>
          <Button variant="primary" onClick={() => setShowModal(true)}>
            <MdAdd className="inline mr-1" /> Add Alumni
          </Button>
        </div>

        <GlassCard className="p-4">
          <div className="relative">
            <MdSearch className="absolute left-3 top-3 w-4 h-4 text-white/40" />
            <input className="input-glass w-full pl-9" placeholder="Search by name, company, occupation..." value={search} onChange={e => handleSearch(e.target.value)} />
          </div>
        </GlassCard>

        {loading ? (
          <div className="text-center py-12 text-white/50">Loading...</div>
        ) : error ? (
          <GlassCard className="p-10 text-center">
            <p className="text-red-400 mb-3">{error}</p>
            <Button variant="secondary" onClick={() => loadAlumni()}>Retry</Button>
          </GlassCard>
        ) : alumni.length === 0 ? (
          <GlassCard className="p-10 text-center text-white/40">No alumni added yet.</GlassCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {alumni.map(a => (
              <GlassCard key={a.id} className="p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-white font-bold">{a.first_name} {a.last_name}</h3>
                  <button onClick={() => handleDelete(a)} className="text-red-400/60 hover:text-red-400 transition">
                    <MdDelete className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-white/50 text-sm mb-1">Batch {a.batch_year || '—'}{a.class_name ? ` · Class ${a.class_name}` : ''}</p>
                {a.occupation && (
                  <p className="text-white/60 text-sm flex items-center gap-1 mb-1">
                    <MdWork className="w-3.5 h-3.5" /> {a.occupation}{a.company ? ` at ${a.company}` : ''}
                  </p>
                )}
                {a.email && <p className="text-white/40 text-xs">{a.email}</p>}
                {a.linkedin_url && <a href={a.linkedin_url} target="_blank" rel="noreferrer" className="text-blue-400 text-xs">LinkedIn</a>}
              </GlassCard>
            ))}
          </div>
        )}

        {showModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Add Alumni</h3>
                <button onClick={() => setShowModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="First Name" required value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
                <Input label="Last Name" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Batch Year" type="number" value={form.batch_year} onChange={e => setForm(f => ({ ...f, batch_year: e.target.value }))} />
                <Input label="Class" value={form.class_name} onChange={e => setForm(f => ({ ...f, class_name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                <Input label="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Occupation" value={form.occupation} onChange={e => setForm(f => ({ ...f, occupation: e.target.value }))} />
                <Input label="Company" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
              </div>
              <Input label="LinkedIn URL" value={form.linkedin_url} onChange={e => setForm(f => ({ ...f, linkedin_url: e.target.value }))} />
              <label className="block text-white/60 text-sm mb-1.5">Notes</label>
              <textarea className="input-glass w-full mb-3" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              <div className="flex gap-2 pt-1">
                <Button variant="primary" loading={saving} onClick={handleSave}>Save</Button>
                <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}
      </div>
    </MainLayout>
  );
}
