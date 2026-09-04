import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdAdd, MdClose, MdDelete, MdVisibility } from 'react-icons/md';
import { formatDate } from '../../utils/helpers';

const EMPTY_FORM = { class_name: '', section: '', subject: '', title: '', description: '', due_date: '' };

export default function HomeworkPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [viewing, setViewing] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  const loadHomework = async () => {
    if (!profile?.institution_id) return;
    setLoading(true);
    try {
      const { data } = await api.get('/homework');
      setItems(data || []);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load homework');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (profile) loadHomework(); }, [profile]);

  const handleSave = async () => {
    if (!form.class_name.trim() || !form.title.trim() || !form.due_date) {
      notification.error('Class, title and due date are required'); return;
    }
    setSaving(true);
    try {
      await api.post('/homework', form);
      notification.success('Homework posted!');
      setShowModal(false);
      setForm(EMPTY_FORM);
      loadHomework();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to post homework');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    try {
      await api.delete(`/homework/${item.id}`);
      setItems(prev => prev.filter(h => h.id !== item.id));
      notification.success('Homework deleted');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const openSubmissions = async (item) => {
    setViewing(item);
    setSubmissionsLoading(true);
    try {
      const { data } = await api.get(`/homework/${item.id}/submissions`);
      setSubmissions(data || []);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load submissions');
    } finally {
      setSubmissionsLoading(false);
    }
  };

  const handleGrade = async (submission, grade) => {
    try {
      const { data } = await api.post(`/homework/submissions/${submission.id}/grade`, { grade });
      setSubmissions(prev => prev.map(s => (s.id === submission.id ? { ...s, ...data } : s)));
      notification.success('Graded!');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to grade');
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">Homework & Assignments</h1>
          <Button variant="primary" onClick={() => setShowModal(true)}>
            <MdAdd className="inline mr-1" /> Post Homework
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-white/50">Loading...</div>
        ) : items.length === 0 ? (
          <GlassCard className="p-10 text-center text-white/40">No homework posted yet.</GlassCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {items.map(item => {
              const overdue = new Date(item.due_date) < new Date();
              return (
                <GlassCard key={item.id} className="p-5">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-white font-bold">{item.title}</h3>
                    <button onClick={() => handleDelete(item)} className="text-red-400/60 hover:text-red-400 transition">
                      <MdDelete className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-white/50 text-sm mb-1">Class {item.class_name}{item.section ? ` ${item.section}` : ''} {item.subject ? `· ${item.subject}` : ''}</p>
                  {item.description && <p className="text-white/60 text-sm mb-2 line-clamp-2">{item.description}</p>}
                  <p className={`text-xs font-semibold mb-3 ${overdue ? 'text-red-400' : 'text-white/50'}`}>Due {formatDate(item.due_date)}</p>
                  <div className="flex items-center justify-between pt-3 border-t border-white/5">
                    <span className="text-white/50 text-xs">{item.submission_count} submission(s)</span>
                    <button onClick={() => openSubmissions(item)} className="text-blue-400 hover:text-blue-300 text-xs font-semibold inline-flex items-center gap-1">
                      <MdVisibility className="w-4 h-4" /> View
                    </button>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}

        {/* ─── POST HOMEWORK MODAL ─────────────────────────────────── */}
        {showModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Post Homework</h3>
                <button onClick={() => setShowModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <Input label="Title" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Class" required value={form.class_name} onChange={e => setForm(f => ({ ...f, class_name: e.target.value }))} />
                <Input label="Section" value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Subject" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
                <Input label="Due Date" type="date" required value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
              <div className="mb-3">
                <label className="block text-white/60 text-sm mb-1.5">Description</label>
                <textarea className="input-glass w-full" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="primary" loading={saving} onClick={handleSave}>Post</Button>
                <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}

        {/* ─── SUBMISSIONS MODAL ───────────────────────────────────── */}
        {viewing && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Submissions — {viewing.title}</h3>
                <button onClick={() => setViewing(null)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              {submissionsLoading ? (
                <p className="text-white/50 text-center py-6">Loading...</p>
              ) : submissions.length === 0 ? (
                <p className="text-white/40 text-center py-6">No submissions yet.</p>
              ) : (
                <div className="space-y-3">
                  {submissions.map(s => (
                    <div key={s.id} className="bg-white/5 rounded-lg p-3">
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-white font-semibold text-sm">{s.first_name} {s.last_name} <span className="text-white/40 text-xs">{s.admission_no}</span></p>
                        <span className={`px-2 py-0.5 text-xs rounded font-medium ${s.status === 'graded' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-blue-500/20 text-blue-300'}`}>
                          {s.grade || s.status}
                        </span>
                      </div>
                      {s.note && <p className="text-white/60 text-sm mb-1">{s.note}</p>}
                      {s.link && <a href={s.link} target="_blank" rel="noreferrer" className="text-blue-400 text-xs">{s.link}</a>}
                      <div className="flex gap-1.5 mt-2">
                        {['A', 'B', 'C', 'Needs Improvement'].map(g => (
                          <button key={g} onClick={() => handleGrade(s, g)} className="px-2 py-1 text-xs bg-white/10 hover:bg-white/20 text-white/70 rounded">
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>,
          document.body
        )}
      </div>
    </MainLayout>
  );
}
