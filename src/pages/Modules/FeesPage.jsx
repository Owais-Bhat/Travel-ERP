import { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import Badge from '../../components/Common/Badge';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { formatCurrency, formatDate } from '../../utils/helpers';
import {
  MdAdd,
  MdDownload,
  MdPayment,
  MdSearch,
  MdClose,
  MdReceipt,
  MdFilterList,
} from 'react-icons/md';

// ─── helpers ────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().split('T')[0];

function resolveStatus(fee) {
  if (fee.status === 'paid') return 'paid';
  if (fee.status !== 'paid' && fee.due_date < TODAY) return 'overdue';
  return fee.status;
}

function statusBadgeClass(status) {
  const map = {
    paid: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    partial: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
    pending: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
    overdue: 'bg-red-500/20 text-red-300 border border-red-500/30',
  };
  return map[status] || 'bg-gray-500/20 text-gray-300';
}

function calcGrade(percentage) {
  if (percentage >= 91) return 'A+';
  if (percentage >= 81) return 'A';
  if (percentage >= 71) return 'B+';
  if (percentage >= 61) return 'B';
  if (percentage >= 51) return 'C';
  if (percentage >= 41) return 'D';
  return 'F';
}

// ─── Modal backdrop ─────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content w-full"
        style={{ maxWidth: wide ? 720 : 520 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white transition">
            <MdClose className="w-6 h-6" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function FeesPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  // data state
  const [fees, setFees] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  // filter state
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterClass, setFilterClass] = useState('');
  const [search, setSearch] = useState('');

  // modals
  const [payModal, setPayModal] = useState(null);   // fee record being paid
  const [addModal, setAddModal] = useState(false);

  // payment form
  const [payForm, setPayForm] = useState({ amount: '', payment_date: TODAY, payment_mode: 'Cash' });
  const [savingPay, setSavingPay] = useState(false);

  // add fee form
  const [addForm, setAddForm] = useState({
    student_id: '',
    fee_type: 'Tuition',
    total_amount: '',
    due_date: '',
  });
  const [studentSearch, setStudentSearch] = useState('');
  const [savingAdd, setSavingAdd] = useState(false);

  // ── load data ─────────────────────────────────────────────────────────────

  const loadFees = useCallback(async () => {
    if (!profile?.institution_id) return;
    setLoading(true);
    try {
      // The API nests the joined student under `students`, the same shape
      // this screen already renders from.
      const { data } = await api.get('/fees', { params: { sort: 'due_date', order: 'desc' } });
      setFees(data || []);
    } catch (err) {
      notification.error('Failed to load fees: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }, [profile?.institution_id]);

  const loadStudents = useCallback(async (q = '') => {
    if (!profile?.institution_id) return;
    try {
      const { data } = await api.get('/students', {
        params: { pageSize: 50, page: 1, ...(q ? { search: q } : {}) },
      });
      setStudents(data?.data || []);
    } catch {
      setStudents([]);
    }
  }, [profile?.institution_id]);

  useEffect(() => { loadFees(); }, [loadFees]);
  useEffect(() => { loadStudents(studentSearch); }, [loadStudents, studentSearch]);

  // ── derived stats ─────────────────────────────────────────────────────────

  const totalBilled = fees.reduce((s, f) => s + (f.total_amount || 0), 0);
  const totalCollected = fees
    .filter((f) => f.status === 'paid')
    .reduce((s, f) => s + (f.paid_amount || 0), 0);
  const totalPending = fees
    .filter((f) => f.status === 'pending')
    .reduce((s, f) => s + ((f.total_amount || 0) - (f.paid_amount || 0)), 0);
  const overdueCount = fees.filter(
    (f) => f.status !== 'paid' && f.due_date && f.due_date < TODAY
  ).length;

  // ── filtered list ─────────────────────────────────────────────────────────

  const classes = [...new Set(fees.map((f) => f.students?.class_name).filter(Boolean))].sort();

  const filtered = fees.filter((f) => {
    const effectiveStatus = resolveStatus(f);
    if (filterStatus !== 'all' && effectiveStatus !== filterStatus) return false;
    if (filterClass && f.students?.class_name !== filterClass) return false;
    if (search) {
      const name = `${f.students?.first_name ?? ''} ${f.students?.last_name ?? ''}`.toLowerCase();
      if (!name.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  // ── record payment ────────────────────────────────────────────────────────

  const openPayModal = (fee) => {
    setPayModal(fee);
    const balance = (fee.total_amount || 0) - (fee.paid_amount || 0);
    setPayForm({ amount: String(balance), payment_date: TODAY, payment_mode: 'Cash' });
  };

  const handleRecordPayment = async () => {
    if (!payModal) return;
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) {
      notification.error('Enter a valid payment amount');
      return;
    }

    setSavingPay(true);
    const newPaid = (payModal.paid_amount || 0) + amount;
    const newStatus = newPaid >= payModal.total_amount ? 'paid' : 'partial';
    const receiptNo = `RCP${Date.now()}`;

    try {
      await api.put(`/fees/${payModal.id}`, {
        paid_amount: newPaid,
        status: newStatus,
        payment_date: payForm.payment_date,
        receipt_no: receiptNo,
      });
      notification.success(`Payment recorded. Receipt: ${receiptNo}`);
      setPayModal(null);
      loadFees();
    } catch (err) {
      notification.error('Payment failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingPay(false);
    }
  };

  // ── add fee ───────────────────────────────────────────────────────────────

  const handleAddFee = async () => {
    if (!addForm.student_id || !addForm.total_amount || !addForm.due_date) {
      notification.error('Please fill all required fields');
      return;
    }

    setSavingAdd(true);
    try {
      await api.post('/fees', {
        student_id: addForm.student_id,
        fee_type: addForm.fee_type,
        total_amount: parseFloat(addForm.total_amount),
        paid_amount: 0,
        due_date: addForm.due_date,
        status: 'pending',
      });
      notification.success('Fee record created');
      setAddModal(false);
      setAddForm({ student_id: '', fee_type: 'Tuition', total_amount: '', due_date: '' });
      loadFees();
    } catch (err) {
      notification.error('Failed to add fee: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingAdd(false);
    }
  };

  // ── CSV export ────────────────────────────────────────────────────────────

  const exportCSV = () => {
    const headers = ['Student Name', 'Admission#', 'Class', 'Fee Type', 'Total', 'Paid', 'Balance', 'Due Date', 'Status', 'Receipt'];
    const rows = filtered.map((f) => {
      const name = `${f.students?.first_name ?? ''} ${f.students?.last_name ?? ''}`.trim();
      return [
        name,
        f.students?.admission_no ?? '',
        f.students?.class_name ?? '',
        f.fee_type ?? '',
        f.total_amount ?? 0,
        f.paid_amount ?? 0,
        (f.total_amount ?? 0) - (f.paid_amount ?? 0),
        f.due_date ?? '',
        resolveStatus(f),
        f.receipt_no ?? '',
      ];
    });
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fees_export_${TODAY}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notification.success('CSV exported');
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <MainLayout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h1 className="text-3xl font-bold text-white">Fees Management</h1>
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" size="sm" onClick={exportCSV}>
              <MdDownload className="mr-1 inline" /> Export CSV
            </Button>
            <Button variant="primary" size="sm" onClick={() => setAddModal(true)}>
              <MdAdd className="mr-1 inline" /> Add Fee
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <GlassCard className="p-5">
            <p className="text-white/60 text-xs uppercase tracking-wide mb-2">Total Billed</p>
            <p className="text-2xl font-bold text-white">{formatCurrency(totalBilled)}</p>
          </GlassCard>
          <GlassCard className="p-5">
            <p className="text-white/60 text-xs uppercase tracking-wide mb-2">Collected</p>
            <p className="text-2xl font-bold text-emerald-400">{formatCurrency(totalCollected)}</p>
          </GlassCard>
          <GlassCard className="p-5">
            <p className="text-white/60 text-xs uppercase tracking-wide mb-2">Pending</p>
            <p className="text-2xl font-bold text-amber-400">{formatCurrency(totalPending)}</p>
          </GlassCard>
          <GlassCard className="p-5">
            <p className="text-white/60 text-xs uppercase tracking-wide mb-2">Overdue Records</p>
            <p className="text-2xl font-bold text-red-400">{overdueCount}</p>
          </GlassCard>
        </div>

        {/* Filters */}
        <GlassCard className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 w-4 h-4" />
              <input
                className="input-glass pl-9 py-2 text-sm"
                placeholder="Search student name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <select
              className="input-glass py-2 text-sm flex-shrink-0"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ width: 150 }}
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="overdue">Overdue</option>
            </select>

            <select
              className="input-glass py-2 text-sm flex-shrink-0"
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              style={{ width: 150 }}
            >
              <option value="">All Classes</option>
              {classes.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <div className="flex items-center gap-1 text-white/50 text-sm">
              <MdFilterList className="w-4 h-4" />
              {filtered.length} record{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>
        </GlassCard>

        {/* Fees Table */}
        <GlassCard className="p-0 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="spinner" />
              <span className="ml-3 text-white/60">Loading fees…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <MdReceipt className="w-12 h-12 text-white/20" />
              <p className="text-white/50 text-lg">No fee records found</p>
              <p className="text-white/30 text-sm">Adjust filters or add a fee record</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="text-left py-3 px-4 text-white/60 font-medium">Student</th>
                    <th className="text-left py-3 px-4 text-white/60 font-medium">Adm#</th>
                    <th className="text-left py-3 px-4 text-white/60 font-medium">Class</th>
                    <th className="text-left py-3 px-4 text-white/60 font-medium">Fee Type</th>
                    <th className="text-right py-3 px-4 text-white/60 font-medium">Total</th>
                    <th className="text-right py-3 px-4 text-white/60 font-medium">Paid</th>
                    <th className="text-right py-3 px-4 text-white/60 font-medium">Balance</th>
                    <th className="text-left py-3 px-4 text-white/60 font-medium">Due Date</th>
                    <th className="text-left py-3 px-4 text-white/60 font-medium">Status</th>
                    <th className="text-center py-3 px-4 text-white/60 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((fee) => {
                    const effStatus = resolveStatus(fee);
                    const balance = (fee.total_amount || 0) - (fee.paid_amount || 0);
                    const name = `${fee.students?.first_name ?? ''} ${fee.students?.last_name ?? ''}`.trim();
                    return (
                      <tr key={fee.id} className="border-b border-white/5 hover:bg-white/5 transition">
                        <td className="py-3 px-4 text-white font-medium">{name || '—'}</td>
                        <td className="py-3 px-4 text-white/70">{fee.students?.admission_no ?? '—'}</td>
                        <td className="py-3 px-4 text-white/70">{fee.students?.class_name ?? '—'}</td>
                        <td className="py-3 px-4 text-white/70">{fee.fee_type}</td>
                        <td className="py-3 px-4 text-right text-white">{formatCurrency(fee.total_amount)}</td>
                        <td className="py-3 px-4 text-right text-emerald-400">{formatCurrency(fee.paid_amount)}</td>
                        <td className={`py-3 px-4 text-right font-medium ${balance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {formatCurrency(balance)}
                        </td>
                        <td className="py-3 px-4 text-white/70">{formatDate(fee.due_date)}</td>
                        <td className="py-3 px-4">
                          <span className={`badge text-xs ${statusBadgeClass(effStatus)}`}>
                            {effStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {effStatus !== 'paid' && (
                            <button
                              onClick={() => openPayModal(fee)}
                              className="text-blue-400 hover:text-blue-300 transition flex items-center gap-1 mx-auto text-xs"
                            >
                              <MdPayment className="w-4 h-4" /> Pay
                            </button>
                          )}
                          {effStatus === 'paid' && fee.receipt_no && (
                            <span className="text-white/40 text-xs">{fee.receipt_no}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </div>

      {/* ── Record Payment Modal ─────────────────────────────────────────── */}
      <Modal
        open={!!payModal}
        onClose={() => setPayModal(null)}
        title="Record Payment"
      >
        {payModal && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <p className="text-white font-medium">
                {payModal.students?.first_name} {payModal.students?.last_name}
              </p>
              <p className="text-white/60 text-sm mt-1">
                {payModal.fee_type} · Total: {formatCurrency(payModal.total_amount)}
              </p>
              <p className="text-white/60 text-sm">
                Already paid: {formatCurrency(payModal.paid_amount)} · Balance:{' '}
                <span className="text-amber-400 font-medium">
                  {formatCurrency((payModal.total_amount || 0) - (payModal.paid_amount || 0))}
                </span>
              </p>
            </div>

            <Input
              label="Amount to Pay (₹)"
              type="number"
              required
              value={payForm.amount}
              onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
              placeholder="Enter amount"
            />
            <Input
              label="Payment Date"
              type="date"
              required
              value={payForm.payment_date}
              onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })}
            />
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Payment Mode</label>
              <select
                className="input-glass"
                value={payForm.payment_mode}
                onChange={(e) => setPayForm({ ...payForm, payment_mode: e.target.value })}
              >
                <option value="Cash">Cash</option>
                <option value="Online">Online</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>

            <div className="flex gap-3">
              <Button
                variant="primary"
                className="flex-1"
                loading={savingPay}
                onClick={handleRecordPayment}
              >
                Record Payment
              </Button>
              <Button variant="secondary" onClick={() => setPayModal(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Add Fee Modal ────────────────────────────────────────────────── */}
      <Modal
        open={addModal}
        onClose={() => setAddModal(false)}
        title="Add Fee Record"
      >
        <div className="space-y-4">
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Search Student <span className="text-red-400 ml-1">*</span>
            </label>
            <input
              className="input-glass mb-2"
              placeholder="Type student name to search…"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
            />
            {students.length > 0 && (
              <div className="max-h-36 overflow-y-auto rounded-xl border border-white/10 bg-white/5">
                {students.map((s) => (
                  <button
                    key={s.id}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition ${
                      addForm.student_id === s.id ? 'bg-blue-500/20 text-blue-300' : 'text-white'
                    }`}
                    onClick={() => {
                      setAddForm({ ...addForm, student_id: s.id });
                      setStudentSearch(`${s.first_name} ${s.last_name}`);
                      setStudents([]);
                    }}
                  >
                    {s.first_name} {s.last_name}
                    <span className="text-white/40 ml-2 text-xs">({s.admission_no}) · {s.class_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Fee Type</label>
            <select
              className="input-glass"
              value={addForm.fee_type}
              onChange={(e) => setAddForm({ ...addForm, fee_type: e.target.value })}
            >
              {['Tuition', 'Transport', 'Hostel', 'Library', 'Sports', 'Exam', 'Other'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <Input
            label="Total Amount (₹)"
            type="number"
            required
            value={addForm.total_amount}
            onChange={(e) => setAddForm({ ...addForm, total_amount: e.target.value })}
            placeholder="e.g. 50000"
          />
          <Input
            label="Due Date"
            type="date"
            required
            value={addForm.due_date}
            onChange={(e) => setAddForm({ ...addForm, due_date: e.target.value })}
          />

          <div className="flex gap-3">
            <Button
              variant="primary"
              className="flex-1"
              loading={savingAdd}
              onClick={handleAddFee}
            >
              Save Fee Record
            </Button>
            <Button variant="secondary" onClick={() => setAddModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </MainLayout>
  );
}
