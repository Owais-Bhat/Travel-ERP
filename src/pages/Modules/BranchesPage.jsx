import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdAdd, MdClose, MdSchool } from 'react-icons/md';
import { formatDate } from '../../utils/helpers';

const EMPTY_FORM = { name: '', address: '', phone: '', email: '' };

export default function BranchesPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadBranches = async () => {
    if (!profile?.institution_id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/branches');
      setBranches(data || []);
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to load branches';
      setError(message);
      notification.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (profile) loadBranches(); }, [profile]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) { notification.error('Name and email are required'); return; }
    setSaving(true);
    try {
      await api.post('/branches', form);
      notification.success('Branch added!');
      setShowModal(false);
      setForm(EMPTY_FORM);
      loadBranches();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to add branch');
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white">Branches & Campuses</h1>
            <p className="text-white/50 text-sm mt-1">Central registry of your institution's branch campuses.</p>
          </div>
          <Button variant="primary" onClick={() => setShowModal(true)}>
            <MdAdd className="inline mr-1" /> Add Branch
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-white/50">Loading...</div>
        ) : error ? (
          <GlassCard className="p-10 text-center">
            <p className="text-red-400 mb-3">{error}</p>
            <Button variant="secondary" onClick={loadBranches}>Retry</Button>
          </GlassCard>
        ) : branches.length === 0 ? (
          <GlassCard className="p-10 text-center text-white/40">No branches added yet.</GlassCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {branches.map(b => (
              <GlassCard key={b.id} className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <MdSchool className="w-5 h-5 text-blue-400" />
                  <h3 className="text-white font-bold">{b.name}</h3>
                </div>
                <p className="text-white/50 text-sm mb-1">{b.address || 'No address given'}</p>
                <p className="text-white/40 text-xs mb-3">{b.email}{b.phone ? ` · ${b.phone}` : ''}</p>
                <div className="flex items-center justify-between pt-3 border-t border-white/5 text-xs text-white/50">
                  <span>{b.student_count} students</span>
                  <span>{b.teacher_count} teachers</span>
                  <span className="capitalize">{b.subscription_plan}</span>
                </div>
                <p className="text-white/30 text-xs mt-2">Added {formatDate(b.created_at)}</p>
              </GlassCard>
            ))}
          </div>
        )}

        {showModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Add Branch</h3>
                <button onClick={() => setShowModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <Input label="Branch Name" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <Input label="Email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              <Input label="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              <Input label="Address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              <p className="text-white/40 text-xs mb-3">The branch inherits your current subscription plan. It's added as a registry entry for central visibility — it does not yet have its own login.</p>
              <div className="flex gap-2 pt-1">
                <Button variant="primary" loading={saving} onClick={handleSave}>Add Branch</Button>
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
