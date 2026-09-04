import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdAdd, MdClose, MdCheck, MdBlock } from 'react-icons/md';
import { formatDate } from '../../utils/helpers';

const REVIEWER_ROLES = ['super_admin', 'admin', 'institution_admin', 'principal', 'staff'];
const LEAVE_TYPES = ['casual', 'sick', 'earned', 'unpaid', 'other'];
const EMPTY_FORM = { leave_type: 'casual', start_date: '', end_date: '', reason: '' };

const STATUS_STYLES = {
  pending: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  approved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  rejected: 'bg-red-500/20 text-red-300 border-red-500/30',
};

export default function LeaveManagementPage() {
  const { profile } = useAuth();
  const notification = useNotification();
  const isReviewer = REVIEWER_ROLES.includes(profile?.role);

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadRequests = async () => {
    if (!profile?.institution_id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/leave', { params: isReviewer ? {} : { mine: 'true' } });
      setRequests(data || []);
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to load leave requests';
      setError(message);
      notification.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (profile) loadRequests(); }, [profile]);

  const handleSave = async () => {
    if (!form.start_date || !form.end_date) { notification.error('Start and end date are required'); return; }
    setSaving(true);
    try {
      await api.post('/leave', form);
      notification.success('Leave request submitted!');
      setShowModal(false);
      setForm(EMPTY_FORM);
      loadRequests();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to submit request');
    } finally {
      setSaving(false);
    }
  };

  const handleReview = async (request, status) => {
    try {
      await api.patch(`/leave/${request.id}/review`, { status });
      notification.success(`Request ${status}`);
      loadRequests();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to review request');
    }
  };

  const handleWithdraw = async (request) => {
    if (!window.confirm('Withdraw this leave request?')) return;
    try {
      await api.delete(`/leave/${request.id}`);
      setRequests(prev => prev.filter(r => r.id !== request.id));
      notification.success('Request withdrawn');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to withdraw');
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">{isReviewer ? 'Leave Management' : 'My Leave'}</h1>
          <Button variant="primary" onClick={() => setShowModal(true)}>
            <MdAdd className="inline mr-1" /> Apply for Leave
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-white/50">Loading...</div>
        ) : error ? (
          <GlassCard className="p-10 text-center">
            <p className="text-red-400 mb-3">{error}</p>
            <Button variant="secondary" onClick={loadRequests}>Retry</Button>
          </GlassCard>
        ) : requests.length === 0 ? (
          <GlassCard className="p-10 text-center text-white/40">No leave requests yet.</GlassCard>
        ) : (
          <div className="space-y-3">
            {requests.map(r => (
              <GlassCard key={r.id} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    {isReviewer && <p className="text-white font-semibold">{r.first_name} {r.last_name}</p>}
                    <span className="px-2 py-0.5 text-[10px] rounded border font-medium capitalize bg-white/5 text-white/60 border-white/10">{r.leave_type}</span>
                    <span className={`px-2 py-0.5 text-[10px] rounded border font-medium capitalize ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                  </div>
                  <p className="text-white/50 text-sm">{formatDate(r.start_date)} — {formatDate(r.end_date)}</p>
                  {r.reason && <p className="text-white/60 text-sm mt-1">{r.reason}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  {isReviewer && r.status === 'pending' && (
                    <>
                      <button onClick={() => handleReview(r, 'approved')} className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30" title="Approve">
                        <MdCheck className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleReview(r, 'rejected')} className="p-2 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30" title="Reject">
                        <MdBlock className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {r.profile_id === profile?.id && r.status === 'pending' && (
                    <Button variant="secondary" onClick={() => handleWithdraw(r)}>Withdraw</Button>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        {showModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Apply for Leave</h3>
                <button onClick={() => setShowModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <label className="block text-white/60 text-sm mb-1.5">Leave Type</label>
              <select className="input-glass w-full mb-3" value={form.leave_type} onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))}>
                {LEAVE_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Start Date" type="date" required value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                <Input label="End Date" type="date" required value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
              <label className="block text-white/60 text-sm mb-1.5">Reason</label>
              <textarea className="input-glass w-full mb-3" rows={3} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
              <div className="flex gap-2 pt-1">
                <Button variant="primary" loading={saving} onClick={handleSave}>Submit</Button>
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
