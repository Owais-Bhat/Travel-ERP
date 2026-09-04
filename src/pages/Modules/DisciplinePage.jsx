import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdAdd, MdClose, MdDelete, MdSearch } from 'react-icons/md';
import { formatDate } from '../../utils/helpers';

const EMPTY_FORM = { student_id: '', record_type: 'demerit', points: 1, reason: '' };

export default function DisciplinePage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadRecords = async () => {
    if (!profile?.institution_id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/discipline');
      setRecords(data || []);
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to load discipline records';
      setError(message);
      notification.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (profile) loadRecords(); }, [profile]);

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

  const openModal = () => {
    setForm(EMPTY_FORM);
    setSelectedStudent(null);
    setStudentSearch('');
    setStudentResults([]);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!selectedStudent) { notification.error('Select a student'); return; }
    if (!form.reason.trim()) { notification.error('Enter a reason'); return; }
    setSaving(true);
    try {
      await api.post('/discipline', { ...form, student_id: selectedStudent.id });
      notification.success('Recorded!');
      setShowModal(false);
      loadRecords();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to record');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record) => {
    if (!window.confirm('Delete this record?')) return;
    try {
      await api.delete(`/discipline/${record.id}`);
      setRecords(prev => prev.filter(r => r.id !== record.id));
      notification.success('Deleted');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">Discipline Tracking</h1>
          <Button variant="primary" onClick={openModal}>
            <MdAdd className="inline mr-1" /> Add Record
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-white/50">Loading...</div>
        ) : error ? (
          <GlassCard className="p-10 text-center">
            <p className="text-red-400 mb-3">{error}</p>
            <Button variant="secondary" onClick={loadRecords}>Retry</Button>
          </GlassCard>
        ) : records.length === 0 ? (
          <GlassCard className="p-10 text-center text-white/40">No discipline records yet.</GlassCard>
        ) : (
          <div className="space-y-3">
            {records.map(r => (
              <GlassCard key={r.id} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-white font-semibold">{r.first_name} {r.last_name}</p>
                    <span className="text-white/40 text-xs">Class {r.class_name}</span>
                    <span className={`px-2 py-0.5 text-[10px] rounded border font-medium capitalize ${r.record_type === 'merit' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-red-500/20 text-red-300 border-red-500/30'}`}>
                      {r.record_type} · {r.points} pts
                    </span>
                  </div>
                  {r.reason && <p className="text-white/60 text-sm">{r.reason}</p>}
                  <p className="text-white/30 text-xs mt-1">{formatDate(r.created_at)}</p>
                </div>
                <button onClick={() => handleDelete(r)} className="text-red-400/60 hover:text-red-400 transition shrink-0">
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
                <h3 className="text-white font-bold text-lg">Add Discipline Record</h3>
                <button onClick={() => setShowModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>

              {selectedStudent ? (
                <div className="flex items-center justify-between bg-white/5 rounded-lg p-3 mb-3">
                  <p className="text-white text-sm font-semibold">{selectedStudent.first_name} {selectedStudent.last_name} · Class {selectedStudent.class_name}</p>
                  <button onClick={() => setSelectedStudent(null)} className="text-white/40 hover:text-white/70 text-xs">Change</button>
                </div>
              ) : (
                <div className="relative mb-3">
                  <MdSearch className="absolute left-3 top-3 w-4 h-4 text-white/40" />
                  <input className="input-glass w-full pl-9" placeholder="Search student..." value={studentSearch} onChange={e => searchStudents(e.target.value)} />
                  {studentResults.length > 0 && (
                    <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                      {studentResults.map(s => (
                        <button key={s.id} onClick={() => { setSelectedStudent(s); setStudentResults([]); }} className="w-full text-left px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-white/80 transition">
                          {s.first_name} {s.last_name} · Class {s.class_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-white/60 text-sm mb-1.5">Type</label>
                  <select className="input-glass w-full" value={form.record_type} onChange={e => setForm(f => ({ ...f, record_type: e.target.value }))}>
                    <option value="demerit">Demerit</option>
                    <option value="merit">Merit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-white/60 text-sm mb-1.5">Points</label>
                  <input type="number" min="0" className="input-glass w-full" value={form.points} onChange={e => setForm(f => ({ ...f, points: e.target.value }))} />
                </div>
              </div>
              <label className="block text-white/60 text-sm mb-1.5">Reason</label>
              <textarea className="input-glass w-full mb-3" rows={3} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
              <div className="flex gap-2 pt-1">
                <Button variant="primary" loading={saving} onClick={handleSave}>Save</Button>
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
