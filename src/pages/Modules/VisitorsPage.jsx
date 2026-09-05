import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import PhotoUpload from '../../components/Common/PhotoUpload';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdAdd, MdClose, MdLogout } from 'react-icons/md';
import { formatDate } from '../../utils/helpers';

const EMPTY_FORM = { visitor_name: '', phone: '', purpose: '', whom_to_meet: '' };

export default function VisitorsPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [visitors, setVisitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadVisitors = async () => {
    if (!profile?.institution_id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/visitors');
      setVisitors(data || []);
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to load visitor log';
      setError(message);
      notification.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (profile) loadVisitors(); }, [profile]);

  const handleSave = async () => {
    if (!form.visitor_name.trim()) { notification.error('Visitor name is required'); return; }
    setSaving(true);
    try {
      await api.post('/visitors', form);
      notification.success('Visitor checked in!');
      setShowModal(false);
      setForm(EMPTY_FORM);
      loadVisitors();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to check in visitor');
    } finally {
      setSaving(false);
    }
  };

  const handleCheckOut = async (visitor) => {
    try {
      await api.patch(`/visitors/${visitor.id}/check-out`);
      notification.success('Visitor checked out');
      loadVisitors();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to check out');
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">Visitor & Gate Pass</h1>
          <Button variant="primary" onClick={() => setShowModal(true)}>
            <MdAdd className="inline mr-1" /> Check In Visitor
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-white/50">Loading...</div>
        ) : error ? (
          <GlassCard className="p-10 text-center">
            <p className="text-red-400 mb-3">{error}</p>
            <Button variant="secondary" onClick={loadVisitors}>Retry</Button>
          </GlassCard>
        ) : visitors.length === 0 ? (
          <GlassCard className="p-10 text-center text-white/40">No visitors logged yet.</GlassCard>
        ) : (
          <div className="space-y-3">
            {visitors.map(v => (
              <GlassCard key={v.id} className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <PhotoUpload
                    name={v.visitor_name}
                    src={v.photo_url}
                    size="md"
                    onUpload={async (file) => {
                      const formData = new FormData();
                      formData.append('file', file);
                      const { data } = await api.post(`/visitors/${v.id}/photo`, formData);
                      setVisitors((prev) => prev.map((x) => (x.id === v.id ? { ...x, photo_url: data.photo_url } : x)));
                      return data.photo_url;
                    }}
                  />
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-white font-semibold">{v.visitor_name}</p>
                      <span className={`px-2 py-0.5 text-[10px] rounded border font-medium capitalize ${v.status === 'checked_in' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-white/10 text-white/50 border-white/20'}`}>
                        {v.status === 'checked_in' ? 'Checked In' : 'Checked Out'}
                      </span>
                    </div>
                    <p className="text-white/50 text-sm">{v.purpose || 'No purpose given'}{v.whom_to_meet ? ` · Meeting ${v.whom_to_meet}` : ''}</p>
                    <p className="text-white/30 text-xs mt-1">In: {formatDate(v.check_in)}{v.check_out ? ` · Out: ${formatDate(v.check_out)}` : ''}</p>
                  </div>
                </div>
                {v.status === 'checked_in' && (
                  <Button variant="secondary" onClick={() => handleCheckOut(v)}>
                    <MdLogout className="inline mr-1 w-4 h-4" /> Check Out
                  </Button>
                )}
              </GlassCard>
            ))}
          </div>
        )}

        {showModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Check In Visitor</h3>
                <button onClick={() => setShowModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <Input label="Visitor Name" required value={form.visitor_name} onChange={e => setForm(f => ({ ...f, visitor_name: e.target.value }))} />
              <Input label="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              <Input label="Purpose" value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} />
              <Input label="Whom to Meet" value={form.whom_to_meet} onChange={e => setForm(f => ({ ...f, whom_to_meet: e.target.value }))} />
              <div className="flex gap-2 pt-2">
                <Button variant="primary" loading={saving} onClick={handleSave}>Check In</Button>
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
