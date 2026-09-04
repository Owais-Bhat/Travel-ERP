import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdAdd, MdClose, MdCheckCircle } from 'react-icons/md';

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function PayrollPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [month, setMonth] = useState(currentMonth());
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [teachers, setTeachers] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ teacher_id: '', basic_pay: '', allowances: '', deductions: '' });
  const [saving, setSaving] = useState(false);

  const loadRecords = async (m = month) => {
    if (!profile?.institution_id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/payroll/records', { params: { month: m } });
      setRecords(data || []);
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to load payroll records';
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

  useEffect(() => { if (profile) { loadRecords(); loadTeachers(); } }, [profile]);

  const openModal = () => {
    setForm({ teacher_id: '', basic_pay: '', allowances: '', deductions: '' });
    setShowModal(true);
  };

  const netPreview = (
    (parseFloat(form.basic_pay) || 0) + (parseFloat(form.allowances) || 0) - (parseFloat(form.deductions) || 0)
  ).toFixed(2);

  const handleGenerate = async () => {
    if (!form.teacher_id) { notification.error('Select a teacher'); return; }
    if (!form.basic_pay) { notification.error('Enter basic pay'); return; }
    setSaving(true);
    try {
      await api.post('/payroll/records', {
        teacher_id: form.teacher_id,
        pay_month: month,
        basic_pay: parseFloat(form.basic_pay) || 0,
        allowances: parseFloat(form.allowances) || 0,
        deductions: parseFloat(form.deductions) || 0,
      });
      notification.success('Payslip generated!');
      setShowModal(false);
      loadRecords();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to generate payslip');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async (record) => {
    try {
      const { data } = await api.post(`/payroll/records/${record.id}/mark-paid`);
      setRecords(prev => prev.map(r => (r.id === record.id ? { ...r, ...data } : r)));
      notification.success('Marked as paid');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to mark paid');
    }
  };

  const totalNet = records.reduce((sum, r) => sum + parseFloat(r.net_pay || 0), 0);

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h1 className="text-3xl font-bold text-white">HR & Payroll</h1>
          <div className="flex items-center gap-3">
            <input
              type="month"
              className="input-glass"
              value={month}
              onChange={e => { setMonth(e.target.value); loadRecords(e.target.value); }}
            />
            <Button variant="primary" onClick={openModal}>
              <MdAdd className="inline mr-1" /> Generate Payslip
            </Button>
          </div>
        </div>

        <GlassCard className="p-4 flex gap-6 text-sm">
          <div>
            <span className="text-white/40 block text-xs">Payslips this month</span>
            <span className="text-white font-bold text-lg">{records.length}</span>
          </div>
          <div>
            <span className="text-white/40 block text-xs">Total Net Pay</span>
            <span className="text-white font-bold text-lg">₹{totalNet.toFixed(2)}</span>
          </div>
        </GlassCard>

        {loading ? (
          <div className="text-center py-12 text-white/50">Loading...</div>
        ) : error ? (
          <GlassCard className="p-10 text-center">
            <p className="text-red-300 font-semibold mb-1">Could not load payroll</p>
            <p className="text-white/50 text-sm mb-4">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => loadRecords()}>Retry</Button>
          </GlassCard>
        ) : records.length === 0 ? (
          <GlassCard className="p-10 text-center text-white/40">No payslips generated for {month} yet.</GlassCard>
        ) : (
          <GlassCard className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-white/50">Employee</th>
                    <th className="text-left py-3 px-4 text-white/50">Basic</th>
                    <th className="text-left py-3 px-4 text-white/50">Allowances</th>
                    <th className="text-left py-3 px-4 text-white/50">Deductions</th>
                    <th className="text-left py-3 px-4 text-white/50">Net Pay</th>
                    <th className="text-left py-3 px-4 text-white/50">Status</th>
                    <th className="text-center py-3 px-4 text-white/50">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/3 transition">
                      <td className="py-3 px-4 text-white">
                        {r.first_name} {r.last_name}
                        <span className="text-white/40 text-xs block">{r.employee_id}</span>
                      </td>
                      <td className="py-3 px-4 text-white/70">₹{r.basic_pay}</td>
                      <td className="py-3 px-4 text-emerald-400">+₹{r.allowances}</td>
                      <td className="py-3 px-4 text-red-400">-₹{r.deductions}</td>
                      <td className="py-3 px-4 text-white font-bold">₹{r.net_pay}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                          r.status === 'paid' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {r.status === 'paid' ? `Paid ${r.paid_on || ''}` : 'Pending'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {r.status !== 'paid' && (
                          <button onClick={() => handleMarkPaid(r)} className="text-emerald-400/70 hover:text-emerald-400 transition inline-flex items-center gap-1 text-xs font-semibold">
                            <MdCheckCircle className="w-4 h-4" /> Mark Paid
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        )}

        {/* ─── GENERATE PAYSLIP MODAL ──────────────────────────────── */}
        {showModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Generate Payslip — {month}</h3>
                <button onClick={() => setShowModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-0">
                <label className="block text-sm font-medium mb-2">Teacher <span className="text-red-400 ml-1">*</span></label>
                <select
                  className="input-glass w-full mb-3"
                  value={form.teacher_id}
                  onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value }))}
                >
                  <option value="">-- Select teacher --</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.first_name} {t.last_name} {t.employee_id ? `(${t.employee_id})` : ''}</option>
                  ))}
                </select>
                <Input label="Basic Pay" type="number" min="0" required value={form.basic_pay} onChange={e => setForm(f => ({ ...f, basic_pay: e.target.value }))} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Allowances" type="number" min="0" value={form.allowances} onChange={e => setForm(f => ({ ...f, allowances: e.target.value }))} />
                  <Input label="Deductions" type="number" min="0" value={form.deductions} onChange={e => setForm(f => ({ ...f, deductions: e.target.value }))} />
                </div>
                <p className="text-white/60 text-sm mt-1">Net Pay: <span className="text-white font-bold">₹{netPreview}</span></p>
              </div>
              <div className="flex gap-2 pt-3">
                <Button variant="primary" loading={saving} onClick={handleGenerate}>Generate</Button>
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
