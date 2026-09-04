import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdAdd, MdEdit, MdDelete, MdClose, MdVideocam, MdOpenInNew } from 'react-icons/md';

const EMPTY_FORM = { title: '', subject: '', class_name: '', teacher_id: '', meeting_link: '', scheduled_at: '', duration_minutes: 40 };

export default function VideoClassesPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [teachers, setTeachers] = useState([]);
  const [filter, setFilter] = useState('scheduled');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadClasses = async (status = filter) => {
    if (!profile?.institution_id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/video-classes', { params: status ? { status } : {} });
      setClasses(data || []);
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to load video classes';
      setError(message);
      notification.error(message);
    } finally {
      setLoading(false);
    }
  };

  const loadTeachers = async () => {
    try {
      const { data } = await api.get('/teachers');
      setTeachers(data || []);
    } catch {
      setTeachers([]);
    }
  };

  useEffect(() => { if (profile) { loadClasses(); loadTeachers(); } }, [profile]);

  const openModal = (item = null) => {
    if (item) {
      setEditing(item);
      setForm({
        title: item.title || '', subject: item.subject || '', class_name: item.class_name || '',
        teacher_id: item.teacher_id || '', meeting_link: item.meeting_link || '',
        scheduled_at: (item.scheduled_at || '').replace(' ', 'T').slice(0, 16),
        duration_minutes: item.duration_minutes || 40,
      });
    } else {
      setEditing(null);
      setForm(EMPTY_FORM);
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { notification.error('Title is required'); return; }
    if (!form.meeting_link.trim()) { notification.error('Meeting link is required'); return; }
    if (!form.scheduled_at) { notification.error('Schedule date/time is required'); return; }
    setSaving(true);
    const payload = {
      title: form.title.trim(), subject: form.subject.trim(), class_name: form.class_name.trim(),
      teacher_id: form.teacher_id || null, meeting_link: form.meeting_link.trim(),
      scheduled_at: form.scheduled_at, duration_minutes: parseInt(form.duration_minutes, 10) || 40,
    };
    try {
      const response = editing
        ? await api.put(`/video-classes/${editing.id}`, payload)
        : await api.post('/video-classes', payload);
      const saved = response.data;
      setClasses(prev => (editing ? prev.map(c => (c.id === saved.id ? saved : c)) : [saved, ...prev]));
      notification.success(editing ? 'Class updated!' : 'Class scheduled!');
      setShowModal(false);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to save class');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    try {
      await api.delete(`/video-classes/${item.id}`);
      setClasses(prev => prev.filter(c => c.id !== item.id));
      notification.success('Class deleted');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to delete class');
    }
  };

  const handleMarkCompleted = async (item) => {
    try {
      const { data } = await api.put(`/video-classes/${item.id}`, { status: 'completed' });
      setClasses(prev => prev.map(c => (c.id === item.id ? data : c)));
      notification.success('Marked completed');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to update status');
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">Video Classes</h1>
          <Button variant="primary" onClick={() => openModal()}>
            <MdAdd className="inline mr-1" /> Schedule Class
          </Button>
        </div>

        <div className="flex gap-2">
          {[{ v: 'scheduled', label: 'Upcoming' }, { v: '', label: 'All' }, { v: 'completed', label: 'Completed' }].map(opt => (
            <button
              key={opt.v}
              onClick={() => { setFilter(opt.v); loadClasses(opt.v); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                filter === opt.v ? 'bg-blue-500/30 text-blue-300 border border-blue-500/40' : 'text-white/50 hover:text-white hover:bg-white/10'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-white/50">Loading...</div>
        ) : error ? (
          <GlassCard className="p-10 text-center">
            <p className="text-red-300 font-semibold mb-1">Could not load video classes</p>
            <p className="text-white/50 text-sm mb-4">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => loadClasses()}>Retry</Button>
          </GlassCard>
        ) : classes.length === 0 ? (
          <GlassCard className="p-10 text-center text-white/40">No video classes found.</GlassCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {classes.map(item => (
              <GlassCard key={item.id} className="p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-white font-bold text-base flex items-center gap-2">
                    <MdVideocam className="text-neon-cyan w-5 h-5 shrink-0" /> {item.title}
                  </h3>
                  <div className="flex gap-1.5 shrink-0 ml-2">
                    <button onClick={() => openModal(item)} className="text-blue-400/70 hover:text-blue-400 transition"><MdEdit className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(item)} className="text-red-400/60 hover:text-red-400 transition"><MdDelete className="w-4 h-4" /></button>
                  </div>
                </div>
                <p className="text-white/60 text-sm mb-1">{item.subject || 'No subject'} {item.class_name ? `· ${item.class_name}` : ''}</p>
                {item.teacher_first_name && (
                  <p className="text-white/50 text-xs mb-2">Teacher: {item.teacher_first_name} {item.teacher_last_name}</p>
                )}
                <p className="text-white/70 text-sm mb-3">
                  {item.scheduled_at ? new Date(item.scheduled_at).toLocaleString('en-IN') : '—'} · {item.duration_minutes} min
                </p>
                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                  <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                    item.status === 'completed' ? 'bg-gray-500/20 text-gray-400'
                      : item.status === 'cancelled' ? 'bg-red-500/20 text-red-300'
                      : 'bg-emerald-500/20 text-emerald-300'
                  }`}>
                    {item.status}
                  </span>
                  <div className="flex items-center gap-3">
                    {item.status === 'scheduled' && (
                      <button onClick={() => handleMarkCompleted(item)} className="text-xs text-white/50 hover:text-white">Mark done</button>
                    )}
                    <a href={item.meeting_link} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 text-sm font-semibold inline-flex items-center gap-1">
                      Join <MdOpenInNew className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        {/* ─── SCHEDULE/EDIT MODAL ─────────────────────────────────── */}
        {showModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">{editing ? 'Edit Class' : 'Schedule Video Class'}</h3>
                <button onClick={() => setShowModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-0">
                <Input label="Title" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Subject" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
                  <Input label="Class" value={form.class_name} onChange={e => setForm(f => ({ ...f, class_name: e.target.value }))} />
                </div>
                <label className="block text-sm font-medium mb-2">Teacher (optional)</label>
                <select className="input-glass w-full mb-3" value={form.teacher_id} onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value }))}>
                  <option value="">-- None --</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                  ))}
                </select>
                <Input label="Meeting Link" required placeholder="https://meet.google.com/..." value={form.meeting_link} onChange={e => setForm(f => ({ ...f, meeting_link: e.target.value }))} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Date & Time" type="datetime-local" required value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} />
                  <Input label="Duration (min)" type="number" min="5" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="primary" loading={saving} onClick={handleSave}>{editing ? 'Update' : 'Schedule'}</Button>
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
