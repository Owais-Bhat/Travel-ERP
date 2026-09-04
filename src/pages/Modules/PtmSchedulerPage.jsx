import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdAdd, MdClose, MdSearch, MdDelete } from 'react-icons/md';

const CREATOR_ROLES = ['super_admin', 'admin', 'institution_admin', 'principal', 'staff', 'teacher'];
const EMPTY_SLOT_FORM = { teacher_id: '', slot_date: '', start_time: '', end_time: '', notes: '' };

export default function PtmSchedulerPage() {
  const { profile } = useAuth();
  const notification = useNotification();
  const isCreator = CREATOR_ROLES.includes(profile?.role);

  const [slots, setSlots] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showSlotModal, setShowSlotModal] = useState(false);
  const [slotForm, setSlotForm] = useState(EMPTY_SLOT_FORM);
  const [saving, setSaving] = useState(false);

  const [bookingSlot, setBookingSlot] = useState(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState([]);

  const loadSlots = async () => {
    if (!profile?.institution_id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/ptm/slots');
      setSlots(data || []);
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to load meeting slots';
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

  useEffect(() => { if (profile) { loadSlots(); if (isCreator) loadTeachers(); } }, [profile]);

  const handleCreateSlot = async () => {
    if (!slotForm.teacher_id || !slotForm.slot_date || !slotForm.start_time || !slotForm.end_time) {
      notification.error('Teacher, date, start and end time are required'); return;
    }
    setSaving(true);
    try {
      await api.post('/ptm/slots', slotForm);
      notification.success('Slot opened!');
      setShowSlotModal(false);
      setSlotForm(EMPTY_SLOT_FORM);
      loadSlots();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to open slot');
    } finally {
      setSaving(false);
    }
  };

  const searchStudents = async (val) => {
    setStudentSearch(val);
    if (!val.trim() || val.length < 2) { setStudentResults([]); return; }
    try {
      const { data } = await api.get('/students', { params: { search: val, pageSize: 10, page: 1 } });
      setStudentResults(data?.data || []);
    } catch {
      setStudentResults([]);
    }
  };

  const handleBook = async (student) => {
    try {
      await api.post(`/ptm/slots/${bookingSlot.id}/book`, { student_id: student.id });
      notification.success('Slot booked!');
      setBookingSlot(null);
      setStudentSearch('');
      setStudentResults([]);
      loadSlots();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to book slot');
    }
  };

  const handleCancel = async (slot) => {
    if (!window.confirm('Cancel this slot?')) return;
    try {
      await api.delete(`/ptm/slots/${slot.id}`);
      loadSlots();
      notification.success('Cancelled');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to cancel');
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">Parent-Teacher Meetings</h1>
          {isCreator && (
            <Button variant="primary" onClick={() => setShowSlotModal(true)}>
              <MdAdd className="inline mr-1" /> Open Slot
            </Button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-white/50">Loading...</div>
        ) : error ? (
          <GlassCard className="p-10 text-center">
            <p className="text-red-400 mb-3">{error}</p>
            <Button variant="secondary" onClick={loadSlots}>Retry</Button>
          </GlassCard>
        ) : slots.length === 0 ? (
          <GlassCard className="p-10 text-center text-white/40">No meeting slots yet.</GlassCard>
        ) : (
          <div className="space-y-3">
            {slots.map(s => (
              <GlassCard key={s.id} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-white font-semibold">{s.teacher_first_name} {s.teacher_last_name}</p>
                    <span className={`px-2 py-0.5 text-[10px] rounded border font-medium capitalize ${
                      s.status === 'open' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : s.status === 'booked' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                          : 'bg-white/10 text-white/40 border-white/20'
                    }`}>{s.status}</span>
                  </div>
                  <p className="text-white/50 text-sm">{s.slot_date} · {s.start_time} — {s.end_time}</p>
                  {s.status === 'booked' && <p className="text-white/40 text-xs mt-1">With: {s.student_first_name} {s.student_last_name}</p>}
                  {s.notes && <p className="text-white/40 text-xs mt-1">{s.notes}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  {s.status === 'open' && !isCreator && (
                    <Button variant="primary" onClick={() => setBookingSlot(s)}>Book</Button>
                  )}
                  {s.status !== 'cancelled' && (
                    <button onClick={() => handleCancel(s)} className="text-red-400/60 hover:text-red-400 transition">
                      <MdDelete className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        {showSlotModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Open Meeting Slot</h3>
                <button onClick={() => setShowSlotModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <label className="block text-white/60 text-sm mb-1.5">Teacher</label>
              <select className="input-glass w-full mb-3" value={slotForm.teacher_id} onChange={e => setSlotForm(f => ({ ...f, teacher_id: e.target.value }))}>
                <option value="">-- Select --</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
              </select>
              <Input label="Date" type="date" required value={slotForm.slot_date} onChange={e => setSlotForm(f => ({ ...f, slot_date: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Start Time" type="time" required value={slotForm.start_time} onChange={e => setSlotForm(f => ({ ...f, start_time: e.target.value }))} />
                <Input label="End Time" type="time" required value={slotForm.end_time} onChange={e => setSlotForm(f => ({ ...f, end_time: e.target.value }))} />
              </div>
              <label className="block text-white/60 text-sm mb-1.5">Notes</label>
              <textarea className="input-glass w-full mb-3" rows={2} value={slotForm.notes} onChange={e => setSlotForm(f => ({ ...f, notes: e.target.value }))} />
              <div className="flex gap-2 pt-1">
                <Button variant="primary" loading={saving} onClick={handleCreateSlot}>Open Slot</Button>
                <Button variant="secondary" onClick={() => setShowSlotModal(false)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}

        {bookingSlot && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Book Slot for Student</h3>
                <button onClick={() => setBookingSlot(null)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <div className="relative mb-3">
                <MdSearch className="absolute left-3 top-3 w-4 h-4 text-white/40" />
                <input className="input-glass w-full pl-9" placeholder="Search student..." value={studentSearch} onChange={e => searchStudents(e.target.value)} />
              </div>
              {studentResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {studentResults.map(s => (
                    <button key={s.id} onClick={() => handleBook(s)} className="w-full text-left px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-white/80 transition">
                      {s.first_name} {s.last_name} · Class {s.class_name}
                    </button>
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
