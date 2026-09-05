import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdAdd, MdClose, MdDelete } from 'react-icons/md';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const EMPTY_FORM = { class_name: '', section: '', timetable_slot_id: '', substitute_teacher_id: '', assignment_date: '', reason: '' };

export default function SubstitutesPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [teachers, setTeachers] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [classSlots, setClassSlots] = useState([]);
  const [saving, setSaving] = useState(false);

  const loadAssignments = async () => {
    if (!profile?.institution_id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/substitutes');
      setAssignments(data || []);
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to load substitute assignments';
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

  useEffect(() => { if (profile) { loadAssignments(); loadTeachers(); } }, [profile]);

  const openModal = () => {
    setForm(EMPTY_FORM);
    setClassSlots([]);
    setShowModal(true);
  };

  const loadClassSlots = async (className) => {
    setForm(f => ({ ...f, class_name: className, timetable_slot_id: '' }));
    if (!className.trim()) { setClassSlots([]); return; }
    try {
      const { data } = await api.get('/timetable', { params: { class_name: className, section: form.section } });
      setClassSlots(data || []);
    } catch {
      setClassSlots([]);
    }
  };

  const handleSave = async () => {
    if (!form.timetable_slot_id || !form.substitute_teacher_id || !form.assignment_date) {
      notification.error('Slot, substitute teacher and date are required'); return;
    }
    setSaving(true);
    try {
      await api.post('/substitutes', {
        timetable_slot_id: form.timetable_slot_id,
        substitute_teacher_id: form.substitute_teacher_id,
        assignment_date: form.assignment_date,
        reason: form.reason,
      });
      notification.success('Substitute assigned!');
      setShowModal(false);
      loadAssignments();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to assign substitute');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (assignment) => {
    if (!window.confirm('Remove this substitute assignment?')) return;
    try {
      await api.delete(`/substitutes/${assignment.id}`);
      setAssignments(prev => prev.filter(a => a.id !== assignment.id));
      notification.success('Removed');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to remove');
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">Substitute Teacher Management</h1>
          <Button variant="primary" onClick={openModal}>
            <MdAdd className="inline mr-1" /> Assign Substitute
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-white/50">Loading...</div>
        ) : error ? (
          <GlassCard className="p-10 text-center">
            <p className="text-red-400 mb-3">{error}</p>
            <Button variant="secondary" onClick={loadAssignments}>Retry</Button>
          </GlassCard>
        ) : assignments.length === 0 ? (
          <GlassCard className="p-10 text-center text-white/40">No substitute assignments yet.</GlassCard>
        ) : (
          <div className="space-y-3">
            {assignments.map(a => (
              <GlassCard key={a.id} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-white font-semibold">{a.subject} — Class {a.class_name}{a.section ? ` ${a.section}` : ''}</p>
                  <p className="text-white/50 text-sm">{DAYS[a.day_of_week]} · Period {a.period_number} · {a.assignment_date}</p>
                  <p className="text-white/40 text-xs mt-1">
                    {a.original_first_name ? `${a.original_first_name} ${a.original_last_name} → ` : ''}
                    {a.substitute_first_name} {a.substitute_last_name}
                  </p>
                  {a.reason && <p className="text-white/40 text-xs">{a.reason}</p>}
                </div>
                <button onClick={() => handleDelete(a)} className="text-red-400/60 hover:text-red-400 transition shrink-0">
                  <MdDelete className="w-4 h-4" />
                </button>
              </GlassCard>
            ))}
          </div>
        )}

        {showModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Assign Substitute</h3>
                <button onClick={() => setShowModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Class" required value={form.class_name} onChange={e => loadClassSlots(e.target.value)} />
                <Input label="Section" value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value }))} />
              </div>
              <label className="block text-white/60 text-sm mb-1.5">Slot</label>
              <select className="input-glass w-full mb-3" value={form.timetable_slot_id} onChange={e => setForm(f => ({ ...f, timetable_slot_id: e.target.value }))}>
                <option value="">-- Select --</option>
                {classSlots.map(s => <option key={s.id} value={s.id}>{DAYS[s.day_of_week]} P{s.period_number} — {s.subject}</option>)}
              </select>
              <label className="block text-white/60 text-sm mb-1.5">Substitute Teacher</label>
              <select className="input-glass w-full mb-3" value={form.substitute_teacher_id} onChange={e => setForm(f => ({ ...f, substitute_teacher_id: e.target.value }))}>
                <option value="">-- Select --</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
              </select>
              <Input label="Date" type="date" required value={form.assignment_date} onChange={e => setForm(f => ({ ...f, assignment_date: e.target.value }))} />
              <Input label="Reason" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
              <div className="flex gap-2 pt-1">
                <Button variant="primary" loading={saving} onClick={handleSave}>Assign</Button>
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
