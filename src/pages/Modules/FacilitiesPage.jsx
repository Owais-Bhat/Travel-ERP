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

const EMPTY_FACILITY = { name: '', facility_type: '', capacity: '' };
const EMPTY_BOOKING = { facility_id: '', purpose: '', start_time: '', end_time: '' };

export default function FacilitiesPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [activeTab, setActiveTab] = useState('bookings');
  const [facilities, setFacilities] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showFacilityModal, setShowFacilityModal] = useState(false);
  const [facilityForm, setFacilityForm] = useState(EMPTY_FACILITY);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingForm, setBookingForm] = useState(EMPTY_BOOKING);
  const [saving, setSaving] = useState(false);

  const loadAll = async () => {
    if (!profile?.institution_id) return;
    setLoading(true);
    setError('');
    try {
      const [f, b] = await Promise.all([
        api.get('/facilities'),
        api.get('/facilities/bookings'),
      ]);
      setFacilities(f.data || []);
      setBookings(b.data || []);
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to load facilities';
      setError(message);
      notification.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (profile) loadAll(); }, [profile]);

  const handleSaveFacility = async () => {
    if (!facilityForm.name.trim()) { notification.error('Facility name is required'); return; }
    setSaving(true);
    try {
      await api.post('/facilities', { ...facilityForm, capacity: facilityForm.capacity || null });
      notification.success('Facility added!');
      setShowFacilityModal(false);
      setFacilityForm(EMPTY_FACILITY);
      loadAll();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to add facility');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFacility = async (facility) => {
    if (!window.confirm(`Delete "${facility.name}"?`)) return;
    try {
      await api.delete(`/facilities/${facility.id}`);
      setFacilities(prev => prev.filter(f => f.id !== facility.id));
      notification.success('Facility deleted');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const openBookingModal = () => {
    setBookingForm({ ...EMPTY_BOOKING, facility_id: facilities[0]?.id || '' });
    setShowBookingModal(true);
  };

  const handleSaveBooking = async () => {
    if (!bookingForm.facility_id || !bookingForm.start_time || !bookingForm.end_time) {
      notification.error('Facility, start and end time are required'); return;
    }
    setSaving(true);
    try {
      await api.post('/facilities/bookings', bookingForm);
      notification.success('Booked!');
      setShowBookingModal(false);
      loadAll();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to book');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelBooking = async (booking) => {
    if (!window.confirm('Cancel this booking?')) return;
    try {
      await api.delete(`/facilities/bookings/${booking.id}`);
      setBookings(prev => prev.filter(b => b.id !== booking.id));
      notification.success('Booking cancelled');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to cancel');
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">Facility Booking</h1>
          {activeTab === 'bookings' ? (
            <Button variant="primary" onClick={openBookingModal} disabled={facilities.length === 0}>
              <MdAdd className="inline mr-1" /> New Booking
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setShowFacilityModal(true)}>
              <MdAdd className="inline mr-1" /> Add Facility
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          {['bookings', 'facilities'].map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition ${
                activeTab === t ? 'bg-blue-500/30 text-blue-300 border border-blue-500/40' : 'bg-white/5 text-white/50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-white/50">Loading...</div>
        ) : error ? (
          <GlassCard className="p-10 text-center">
            <p className="text-red-400 mb-3">{error}</p>
            <Button variant="secondary" onClick={loadAll}>Retry</Button>
          </GlassCard>
        ) : activeTab === 'bookings' ? (
          bookings.length === 0 ? (
            <GlassCard className="p-10 text-center text-white/40">No bookings yet.</GlassCard>
          ) : (
            <div className="space-y-3">
              {bookings.map(b => (
                <GlassCard key={b.id} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-white font-semibold">{b.facility_name}</p>
                      <span className={`px-2 py-0.5 text-[10px] rounded border font-medium capitalize ${b.status === 'cancelled' ? 'bg-white/10 text-white/40 border-white/20' : 'bg-blue-500/20 text-blue-300 border-blue-500/30'}`}>{b.status}</span>
                    </div>
                    <p className="text-white/50 text-sm">{b.purpose || 'No purpose given'}</p>
                    <p className="text-white/30 text-xs mt-1">{new Date(b.start_time).toLocaleString()} — {new Date(b.end_time).toLocaleString()}</p>
                  </div>
                  {b.status !== 'cancelled' && (
                    <button onClick={() => handleCancelBooking(b)} className="text-red-400/60 hover:text-red-400 transition shrink-0">
                      <MdDelete className="w-4 h-4" />
                    </button>
                  )}
                </GlassCard>
              ))}
            </div>
          )
        ) : facilities.length === 0 ? (
          <GlassCard className="p-10 text-center text-white/40">No facilities added yet.</GlassCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {facilities.map(f => (
              <GlassCard key={f.id} className="p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-white font-bold">{f.name}</h3>
                  <button onClick={() => handleDeleteFacility(f)} className="text-red-400/60 hover:text-red-400 transition">
                    <MdDelete className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-white/50 text-sm">{f.facility_type || 'General'}</p>
                {f.capacity && <p className="text-white/40 text-xs mt-1">Capacity: {f.capacity}</p>}
              </GlassCard>
            ))}
          </div>
        )}

        {showFacilityModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Add Facility</h3>
                <button onClick={() => setShowFacilityModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <Input label="Name" required value={facilityForm.name} onChange={e => setFacilityForm(f => ({ ...f, name: e.target.value }))} />
              <Input label="Type (e.g. Lab, Auditorium)" value={facilityForm.facility_type} onChange={e => setFacilityForm(f => ({ ...f, facility_type: e.target.value }))} />
              <Input label="Capacity" type="number" value={facilityForm.capacity} onChange={e => setFacilityForm(f => ({ ...f, capacity: e.target.value }))} />
              <div className="flex gap-2 pt-2">
                <Button variant="primary" loading={saving} onClick={handleSaveFacility}>Save</Button>
                <Button variant="secondary" onClick={() => setShowFacilityModal(false)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}

        {showBookingModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">New Booking</h3>
                <button onClick={() => setShowBookingModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <label className="block text-white/60 text-sm mb-1.5">Facility</label>
              <select className="input-glass w-full mb-3" value={bookingForm.facility_id} onChange={e => setBookingForm(f => ({ ...f, facility_id: e.target.value }))}>
                {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <Input label="Purpose" value={bookingForm.purpose} onChange={e => setBookingForm(f => ({ ...f, purpose: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Start" type="datetime-local" required value={bookingForm.start_time} onChange={e => setBookingForm(f => ({ ...f, start_time: e.target.value }))} />
                <Input label="End" type="datetime-local" required value={bookingForm.end_time} onChange={e => setBookingForm(f => ({ ...f, end_time: e.target.value }))} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="primary" loading={saving} onClick={handleSaveBooking}>Book</Button>
                <Button variant="secondary" onClick={() => setShowBookingModal(false)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}
      </div>
    </MainLayout>
  );
}
