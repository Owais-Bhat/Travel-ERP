import { useState } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdAdd, MdClose, MdSearch, MdDelete, MdLocalHospital } from 'react-icons/md';
import { formatDate } from '../../utils/helpers';

const EMPTY_RECORD = { blood_group: '', allergies: '', medical_conditions: '', emergency_contact_name: '', emergency_contact_phone: '', notes: '' };
const EMPTY_VISIT = { visit_date: '', reason: '', treatment: '', notes: '' };

export default function HealthRecordsPage() {
  const notification = useNotification();

  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [student, setStudent] = useState(null);
  const [record, setRecord] = useState(EMPTY_RECORD);
  const [visits, setVisits] = useState([]);
  const [saving, setSaving] = useState(false);

  const [showVisitModal, setShowVisitModal] = useState(false);
  const [visitForm, setVisitForm] = useState(EMPTY_VISIT);

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

  const loadRecord = async (s) => {
    setStudent(s);
    setStudentResults([]);
    setStudentSearch('');
    try {
      const { data } = await api.get(`/health-records/${s.id}`);
      setRecord(data.record || EMPTY_RECORD);
      setVisits(data.visits || []);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load health record');
    }
  };

  const handleSaveRecord = async () => {
    setSaving(true);
    try {
      await api.put(`/health-records/${student.id}`, record);
      notification.success('Health record saved!');
      loadRecord(student);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to save record');
    } finally {
      setSaving(false);
    }
  };

  const handleAddVisit = async () => {
    if (!visitForm.visit_date || !visitForm.reason.trim()) { notification.error('Date and reason are required'); return; }
    setSaving(true);
    try {
      await api.post('/health-records/visits', { ...visitForm, student_id: student.id });
      notification.success('Visit logged!');
      setShowVisitModal(false);
      setVisitForm(EMPTY_VISIT);
      loadRecord(student);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to log visit');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVisit = async (visit) => {
    if (!window.confirm('Delete this visit record?')) return;
    try {
      await api.delete(`/health-records/visits/${visit.id}`);
      setVisits(prev => prev.filter(v => v.id !== visit.id));
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-3xl font-bold text-white">Health / Nurse Records</h1>

        <GlassCard className="p-4">
          <div className="relative">
            <MdSearch className="absolute left-3 top-3 w-4 h-4 text-white/40" />
            <input className="input-glass w-full pl-9" placeholder="Search student..." value={studentSearch} onChange={e => searchStudents(e.target.value)} />
          </div>
          {studentResults.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
              {studentResults.map(s => (
                <button key={s.id} onClick={() => loadRecord(s)} className="w-full text-left px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-white/80 transition">
                  {s.first_name} {s.last_name} · Class {s.class_name}
                </button>
              ))}
            </div>
          )}
        </GlassCard>

        {!student ? (
          <GlassCard className="p-10 text-center text-white/40">Search and select a student to view their health record.</GlassCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <GlassCard className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <MdLocalHospital className="w-5 h-5 text-red-400" />
                <p className="text-white font-bold">{student.first_name} {student.last_name} — Health Record</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Blood Group" value={record.blood_group || ''} onChange={e => setRecord(r => ({ ...r, blood_group: e.target.value }))} />
                <Input label="Emergency Contact Name" value={record.emergency_contact_name || ''} onChange={e => setRecord(r => ({ ...r, emergency_contact_name: e.target.value }))} />
              </div>
              <Input label="Emergency Contact Phone" value={record.emergency_contact_phone || ''} onChange={e => setRecord(r => ({ ...r, emergency_contact_phone: e.target.value }))} />
              <label className="block text-white/60 text-sm mb-1.5">Allergies</label>
              <textarea className="input-glass w-full mb-3" rows={2} value={record.allergies || ''} onChange={e => setRecord(r => ({ ...r, allergies: e.target.value }))} />
              <label className="block text-white/60 text-sm mb-1.5">Medical Conditions</label>
              <textarea className="input-glass w-full mb-3" rows={2} value={record.medical_conditions || ''} onChange={e => setRecord(r => ({ ...r, medical_conditions: e.target.value }))} />
              <label className="block text-white/60 text-sm mb-1.5">Notes</label>
              <textarea className="input-glass w-full mb-3" rows={2} value={record.notes || ''} onChange={e => setRecord(r => ({ ...r, notes: e.target.value }))} />
              <Button variant="primary" loading={saving} onClick={handleSaveRecord}>Save Record</Button>
            </GlassCard>

            <GlassCard className="p-5">
              <div className="flex justify-between items-center mb-3">
                <p className="text-white font-bold">Infirmary Visits</p>
                <Button variant="secondary" onClick={() => setShowVisitModal(true)}>
                  <MdAdd className="inline mr-1 w-4 h-4" /> Log Visit
                </Button>
              </div>
              {visits.length === 0 ? (
                <p className="text-white/40 text-sm text-center py-6">No visits logged yet.</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {visits.map(v => (
                    <div key={v.id} className="bg-white/5 rounded-lg p-3 flex justify-between items-start">
                      <div>
                        <p className="text-white text-sm font-semibold">{v.reason}</p>
                        <p className="text-white/40 text-xs">{formatDate(v.visit_date)}</p>
                        {v.treatment && <p className="text-white/50 text-xs mt-1">{v.treatment}</p>}
                      </div>
                      <button onClick={() => handleDeleteVisit(v)} className="text-red-400/60 hover:text-red-400"><MdDelete className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>
        )}

        {showVisitModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Log Infirmary Visit</h3>
                <button onClick={() => setShowVisitModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <Input label="Date" type="date" required value={visitForm.visit_date} onChange={e => setVisitForm(f => ({ ...f, visit_date: e.target.value }))} />
              <Input label="Reason" required value={visitForm.reason} onChange={e => setVisitForm(f => ({ ...f, reason: e.target.value }))} />
              <label className="block text-white/60 text-sm mb-1.5">Treatment Given</label>
              <textarea className="input-glass w-full mb-3" rows={2} value={visitForm.treatment} onChange={e => setVisitForm(f => ({ ...f, treatment: e.target.value }))} />
              <label className="block text-white/60 text-sm mb-1.5">Notes</label>
              <textarea className="input-glass w-full mb-3" rows={2} value={visitForm.notes} onChange={e => setVisitForm(f => ({ ...f, notes: e.target.value }))} />
              <div className="flex gap-2 pt-1">
                <Button variant="primary" loading={saving} onClick={handleAddVisit}>Log Visit</Button>
                <Button variant="secondary" onClick={() => setShowVisitModal(false)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}
      </div>
    </MainLayout>
  );
}
