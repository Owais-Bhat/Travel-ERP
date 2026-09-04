import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdAdd, MdClose, MdDelete, MdChevronLeft, MdChevronRight } from 'react-icons/md';

const TYPE_STYLES = {
  holiday: 'bg-red-500/20 text-red-300 border-red-500/30',
  exam: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  event: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  ptm: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  other: 'bg-white/10 text-white/60 border-white/20',
};

const EMPTY_FORM = { title: '', description: '', event_date: '', end_date: '', event_type: 'event' };

export default function CalendarPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [monthDate, setMonthDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const monthLabel = monthDate.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  const loadEvents = async () => {
    if (!profile?.institution_id) return;
    setLoading(true);
    const from = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).toISOString().slice(0, 10);
    const to = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).toISOString().slice(0, 10);
    try {
      const { data } = await api.get('/calendar', { params: { from, to } });
      setEvents(data || []);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load calendar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (profile) loadEvents(); }, [profile, monthDate]);

  const changeMonth = (delta) => {
    setMonthDate(d => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  };

  const openModal = () => {
    setForm({ ...EMPTY_FORM, event_date: new Date().toISOString().slice(0, 10) });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.event_date) { notification.error('Title and date are required'); return; }
    setSaving(true);
    try {
      await api.post('/calendar', form);
      notification.success('Event added!');
      setShowModal(false);
      loadEvents();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to add event');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (event) => {
    if (!window.confirm(`Delete "${event.title}"?`)) return;
    try {
      await api.delete(`/calendar/${event.id}`);
      setEvents(prev => prev.filter(e => e.id !== event.id));
      notification.success('Event deleted');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to delete event');
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">School Calendar</h1>
          <Button variant="primary" onClick={openModal}>
            <MdAdd className="inline mr-1" /> Add Event
          </Button>
        </div>

        <GlassCard className="p-4 flex items-center justify-between">
          <button onClick={() => changeMonth(-1)} className="text-white/60 hover:text-white p-2"><MdChevronLeft className="w-5 h-5" /></button>
          <h2 className="text-white font-bold text-lg">{monthLabel}</h2>
          <button onClick={() => changeMonth(1)} className="text-white/60 hover:text-white p-2"><MdChevronRight className="w-5 h-5" /></button>
        </GlassCard>

        {loading ? (
          <div className="text-center py-12 text-white/50">Loading...</div>
        ) : events.length === 0 ? (
          <GlassCard className="p-10 text-center text-white/40">No events this month.</GlassCard>
        ) : (
          <div className="space-y-3">
            {events.map(event => (
              <GlassCard key={event.id} className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <div className="text-center shrink-0 w-14">
                    <p className="text-white font-bold text-lg leading-none">{new Date(event.event_date).getDate()}</p>
                    <p className="text-white/40 text-xs">{new Date(event.event_date).toLocaleString('en-IN', { weekday: 'short' })}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-white font-semibold">{event.title}</p>
                      <span className={`px-2 py-0.5 text-[10px] rounded border font-medium capitalize ${TYPE_STYLES[event.event_type] || TYPE_STYLES.other}`}>
                        {event.event_type}
                      </span>
                    </div>
                    {event.description && <p className="text-white/50 text-sm">{event.description}</p>}
                  </div>
                </div>
                <button onClick={() => handleDelete(event)} className="text-red-400/60 hover:text-red-400 transition shrink-0">
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
                <h3 className="text-white font-bold text-lg">Add Event</h3>
                <button onClick={() => setShowModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <Input label="Title" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Date" type="date" required value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
                <Input label="End Date (optional)" type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
              <label className="block text-white/60 text-sm mb-1.5">Type</label>
              <select className="input-glass w-full mb-3" value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}>
                <option value="event">Event</option>
                <option value="holiday">Holiday</option>
                <option value="exam">Exam</option>
                <option value="ptm">PTM</option>
                <option value="other">Other</option>
              </select>
              <label className="block text-white/60 text-sm mb-1.5">Description</label>
              <textarea className="input-glass w-full mb-3" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <div className="flex gap-2 pt-1">
                <Button variant="primary" loading={saving} onClick={handleSave}>Add Event</Button>
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
