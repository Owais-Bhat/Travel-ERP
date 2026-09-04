import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdClose, MdDelete } from 'react-icons/md';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PERIODS = Array.from({ length: 8 }, (_, i) => i + 1);
const CLASS_OPTIONS = ['Nursery', 'KG', ...Array.from({ length: 12 }, (_, i) => String(i + 1))];

export default function TimetablePage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [classAndSection, setClassAndSection] = useState({ class_name: '5', section: '' });
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [editingCell, setEditingCell] = useState(null); // { day, period, existing }
  const [form, setForm] = useState({ subject: '', teacher_id: '' });
  const [saving, setSaving] = useState(false);

  const loadSlots = async () => {
    if (!profile?.institution_id || !classAndSection.class_name) return;
    setLoading(true);
    try {
      const { data } = await api.get('/timetable', { params: classAndSection });
      setSlots(data || []);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load timetable');
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

  useEffect(() => { if (profile) { loadSlots(); loadTeachers(); } }, [profile, classAndSection.class_name, classAndSection.section]);

  const slotFor = (day, period) => slots.find(s => s.day_of_week === day && s.period_number === period);

  const openCell = (day, period) => {
    const existing = slotFor(day, period);
    setEditingCell({ day, period, existing });
    setForm({ subject: existing?.subject || '', teacher_id: existing?.teacher_id || '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.subject.trim()) { notification.error('Enter a subject'); return; }
    setSaving(true);
    try {
      await api.post('/timetable', {
        ...classAndSection,
        day_of_week: editingCell.day,
        period_number: editingCell.period,
        subject: form.subject.trim(),
        teacher_id: form.teacher_id || null,
      });
      notification.success('Slot saved!');
      setShowModal(false);
      loadSlots();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to save slot');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingCell.existing) return;
    try {
      await api.delete(`/timetable/${editingCell.existing.id}`);
      notification.success('Slot cleared');
      setShowModal(false);
      loadSlots();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to clear slot');
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-3xl font-bold text-white">Timetable</h1>

        <GlassCard className="p-4 flex flex-wrap gap-4 items-center">
          <div>
            <label className="block text-white/60 text-xs mb-1.5">Class</label>
            <select className="input-glass" value={classAndSection.class_name} onChange={e => setClassAndSection(c => ({ ...c, class_name: e.target.value }))}>
              {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-white/60 text-xs mb-1.5">Section (optional)</label>
            <input className="input-glass" placeholder="e.g. A" value={classAndSection.section} onChange={e => setClassAndSection(c => ({ ...c, section: e.target.value }))} />
          </div>
        </GlassCard>

        {loading ? (
          <div className="text-center py-12 text-white/50">Loading...</div>
        ) : (
          <GlassCard className="p-4 overflow-x-auto">
            <table className="w-full text-sm border-separate" style={{ borderSpacing: '4px' }}>
              <thead>
                <tr>
                  <th className="text-white/50 text-xs font-medium p-2">Period</th>
                  {DAYS.map(d => <th key={d} className="text-white/50 text-xs font-medium p-2">{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {PERIODS.map(period => (
                  <tr key={period}>
                    <td className="text-white/60 text-xs font-semibold text-center p-2">P{period}</td>
                    {DAYS.map((_, dayIdx) => {
                      const slot = slotFor(dayIdx, period);
                      return (
                        <td key={dayIdx}>
                          <button
                            onClick={() => openCell(dayIdx, period)}
                            className={`w-full min-w-[100px] h-16 rounded-lg text-xs p-2 transition text-left ${
                              slot ? 'bg-blue-500/20 border border-blue-500/30 text-blue-200 hover:bg-blue-500/30' : 'bg-white/5 border border-white/10 text-white/30 hover:bg-white/10'
                            }`}
                          >
                            {slot ? (
                              <>
                                <p className="font-semibold truncate mb-0.5">{slot.subject}</p>
                                {slot.teacher_first_name && <p className="text-blue-300/70 truncate">{slot.teacher_first_name} {slot.teacher_last_name}</p>}
                              </>
                            ) : '+ Add'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        )}

        {showModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">{DAYS[editingCell?.day]} · Period {editingCell?.period}</h3>
                <button onClick={() => setShowModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <div className="mb-3">
                <label className="block text-white/60 text-sm mb-1.5">Subject</label>
                <input className="input-glass w-full" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
              </div>
              <div className="mb-4">
                <label className="block text-white/60 text-sm mb-1.5">Teacher (optional)</label>
                <select className="input-glass w-full" value={form.teacher_id} onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value }))}>
                  <option value="">-- None --</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <Button variant="primary" loading={saving} onClick={handleSave}>Save</Button>
                {editingCell?.existing && (
                  <Button variant="secondary" onClick={handleDelete}>
                    <MdDelete className="inline w-4 h-4" />
                  </Button>
                )}
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
