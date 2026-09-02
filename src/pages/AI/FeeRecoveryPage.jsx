import { useState } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { feeRecoveryAssistant } from '../../lib/openrouter';
import {
  MdAutoAwesome, MdAttachMoney, MdSearch, MdClose,
  MdContentCopy, MdCheck, MdPerson, MdWarning,
} from 'react-icons/md';

const PAYMENT_HISTORY_OPTIONS = [
  { value: 'always_on_time', label: 'Always On Time' },
  { value: 'occasional_delays', label: 'Occasional Delays' },
  { value: 'frequently_late', label: 'Frequently Late' },
  { value: 'first_default', label: 'First Default' },
];

const INCOME_OPTIONS = [
  { value: '<2L', label: 'Below ₹2 Lakh' },
  { value: '2-5L', label: '₹2–5 Lakh' },
  { value: '5-10L', label: '₹5–10 Lakh' },
  { value: '>10L', label: 'Above ₹10 Lakh' },
];

const DELAY_REASON_OPTIONS = [
  { value: 'financial_difficulty', label: 'Financial Difficulty' },
  { value: 'forgot', label: 'Forgot' },
  { value: 'dispute', label: 'Dispute' },
  { value: 'other', label: 'Other' },
];

const RISK_STYLES = {
  High: 'bg-red-500/20 text-red-300 border border-red-500/40',
  Medium: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
  Low: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
};

export default function FeeRecoveryPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  // Mode
  const [mode, setMode] = useState('manual'); // 'student' | 'manual'

  // Student search
  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);

  // Form
  const [form, setForm] = useState({
    parentName: '',
    paymentHistory: 'always_on_time',
    income: '2-5L',
    delayReason: 'financial_difficulty',
    outstandingAmount: '',
  });

  // Result
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [rawResult, setRawResult] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // ─── Student search ────────────────────────────────────────────────
  const handleStudentSearch = async (val) => {
    setStudentSearch(val);
    if (!val.trim() || val.length < 2) { setStudentResults([]); return; }
    try {
      const { data } = await api.get('/students', { params: { search: val, pageSize: 8, page: 1 } });
      setStudentResults(data?.data || []);
    } catch {
      setStudentResults([]);
    }
  };

  const handleSelectStudent = async (student) => {
    setSelectedStudent(student);
    setStudentResults([]);

    // Auto-fill parent name from student record
    if (student.parent_name) {
      setForm(f => ({ ...f, parentName: student.parent_name }));
    }

    // Pull the student's unpaid balance so the strategy has a real number
    // to work with rather than a guess.
    try {
      const { data } = await api.get('/fees', { params: { studentId: student.id } });
      const outstanding = (data || [])
        .filter((fee) => !['paid', 'waived', 'cancelled'].includes(fee.status))
        .reduce((total, fee) => total + (Number(fee.total_amount) - Number(fee.paid_amount)), 0);

      if (outstanding > 0) {
        setForm(f => ({ ...f, outstandingAmount: String(outstanding.toFixed(2)) }));
        notification.success('Outstanding fee loaded from records');
      }
    } catch {
      // No fee records, or no permission to read them — the user can type it in.
    }
  };

  // ─── Generate strategy ─────────────────────────────────────────────
  const handleGenerateStrategy = async () => {
    if (!form.parentName.trim()) { notification.error('Parent name is required'); return; }
    if (!form.outstandingAmount || parseFloat(form.outstandingAmount) <= 0) {
      notification.error('Please enter the outstanding amount');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    const parentData = {
      name: form.parentName.trim(),
      paymentHistory: PAYMENT_HISTORY_OPTIONS.find(o => o.value === form.paymentHistory)?.label || form.paymentHistory,
      income: INCOME_OPTIONS.find(o => o.value === form.income)?.label || form.income,
      delayReason: DELAY_REASON_OPTIONS.find(o => o.value === form.delayReason)?.label || form.delayReason,
    };

    const fees = { outstanding: parseFloat(form.outstandingAmount) };

    const response = await feeRecoveryAssistant(parentData, fees);

    if (response.success === false) {
      setError(response.error || 'Strategy generation failed');
      notification.error('AI request failed');
    } else {
      setRawResult(response.data);
      try {
        const jsonMatch = response.data.match(/```json\s*([\s\S]*?)```/) ||
                          response.data.match(/```\s*([\s\S]*?)```/) ||
                          [null, response.data];
        const parsed = JSON.parse(jsonMatch[1].trim());
        setResult(parsed);
      } catch {
        setResult(null);
      }
      notification.success('Recovery strategy generated!');
    }
    setLoading(false);
  };

  // ─── Copy script ───────────────────────────────────────────────────
  const handleCopyScript = () => {
    const script = result?.suggestedMessage || result?.suggested_message ||
                   result?.script || result?.communicationScript ||
                   result?.communication_script || rawResult;
    if (!script) { notification.error('No script to copy'); return; }
    navigator.clipboard.writeText(script).then(() => {
      setCopied(true);
      notification.success('Script copied to clipboard!');
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      notification.error('Failed to copy to clipboard');
    });
  };

  // ─── Risk level ────────────────────────────────────────────────────
  const getRiskLevel = () => {
    const raw = result?.riskAssessment || result?.risk_assessment || result?.riskLevel || result?.risk_level || '';
    if (!raw) return null;
    const text = typeof raw === 'object' ? (raw.level || raw.rating || '') : String(raw);
    if (/high/i.test(text)) return 'High';
    if (/medium|moderate/i.test(text)) return 'Medium';
    if (/low/i.test(text)) return 'Low';
    return text;
  };

  const riskLevel = getRiskLevel();

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <MdAttachMoney className="w-8 h-8 text-neon-cyan" />
          <h1 className="text-3xl font-bold text-white">AI Fee Recovery Assistant</h1>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => { setMode('student'); setSelectedStudent(null); setStudentSearch(''); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              mode === 'student' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            From Student Record
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              mode === 'manual' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            Manual Entry
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Form */}
          <div className="space-y-4">
            {/* Student search */}
            {mode === 'student' && (
              <GlassCard className="p-5">
                <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                  <MdPerson className="text-neon-cyan" /> Search Student
                </h3>
                {selectedStudent ? (
                  <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                    <div className="flex-1">
                      <p className="text-white font-medium">
                        {selectedStudent.first_name} {selectedStudent.last_name}
                      </p>
                      <p className="text-white/50 text-sm">
                        {selectedStudent.admission_no} &middot; {selectedStudent.class_name}
                      </p>
                    </div>
                    <button
                      onClick={() => { setSelectedStudent(null); setStudentSearch(''); setForm(f => ({ ...f, parentName: '', outstandingAmount: '' })); }}
                      className="text-white/40 hover:text-white/70"
                    >
                      <MdClose className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <MdSearch className="absolute left-3 top-3 w-4 h-4 text-white/40" />
                    <input
                      className="input-glass w-full pl-9"
                      placeholder="Search by name or admission no..."
                      value={studentSearch}
                      onChange={e => handleStudentSearch(e.target.value)}
                    />
                    {studentResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-gray-900/95 border border-white/10 rounded-lg overflow-hidden shadow-xl">
                        {studentResults.map(s => (
                          <button
                            key={s.id}
                            className="w-full text-left px-4 py-2.5 hover:bg-white/10 text-sm text-white/80 transition"
                            onClick={() => handleSelectStudent(s)}
                          >
                            {s.first_name} {s.last_name}
                            <span className="text-white/40 ml-2 text-xs">{s.admission_no} &middot; {s.class_name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </GlassCard>
            )}

            <GlassCard className="p-5">
              <h3 className="text-white font-bold mb-4">Parent & Fee Details</h3>
              <div className="space-y-0">
                <Input
                  label="Parent / Guardian Name" required
                  value={form.parentName}
                  onChange={e => setForm(f => ({ ...f, parentName: e.target.value }))}
                  placeholder="Parent full name"
                />

                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Payment History</label>
                  <select
                    className="input-glass w-full"
                    value={form.paymentHistory}
                    onChange={e => setForm(f => ({ ...f, paymentHistory: e.target.value }))}
                  >
                    {PAYMENT_HISTORY_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Estimated Annual Income</label>
                  <select
                    className="input-glass w-full"
                    value={form.income}
                    onChange={e => setForm(f => ({ ...f, income: e.target.value }))}
                  >
                    {INCOME_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Reason for Delay</label>
                  <select
                    className="input-glass w-full"
                    value={form.delayReason}
                    onChange={e => setForm(f => ({ ...f, delayReason: e.target.value }))}
                  >
                    {DELAY_REASON_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">
                    Outstanding Amount (₹) <span className="text-red-400 ml-1">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-white/40 text-sm">₹</span>
                    <input
                      type="number"
                      min="0"
                      className="input-glass w-full pl-7"
                      placeholder="0"
                      value={form.outstandingAmount}
                      onChange={e => setForm(f => ({ ...f, outstandingAmount: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <Button
                variant="primary"
                loading={loading}
                onClick={handleGenerateStrategy}
                className="w-full flex items-center justify-center gap-2"
              >
                <MdAutoAwesome /> Generate Recovery Strategy
              </Button>
            </GlassCard>
          </div>

          {/* Right: Results */}
          <div className="space-y-4">
            {!result && !rawResult && !error && (
              <GlassCard className="p-10 flex flex-col items-center justify-center text-center text-white/25 h-full">
                <MdAttachMoney className="w-14 h-14 mb-3 opacity-20" />
                <p>Fill in the details and click Generate to get an AI-powered fee recovery strategy.</p>
              </GlassCard>
            )}

            {error && (
              <GlassCard className="p-5 border border-red-500/30">
                <div className="flex items-center gap-2 text-red-400 mb-2">
                  <MdWarning />
                  <span className="font-semibold">Error</span>
                </div>
                <p className="text-red-300/80 text-sm">{error}</p>
              </GlassCard>
            )}

            {loading && (
              <GlassCard className="p-10 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 border-4 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin mb-4" />
                <p className="text-white/70">Generating strategy...</p>
              </GlassCard>
            )}

            {result && !loading && (
              <>
                {/* Risk Assessment */}
                {riskLevel && (
                  <GlassCard className="p-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-bold">Risk Assessment</h3>
                      <span className={`px-4 py-1.5 rounded-full text-sm font-bold ${RISK_STYLES[riskLevel] || RISK_STYLES.Medium}`}>
                        {riskLevel} Risk
                      </span>
                    </div>
                    {typeof result.riskAssessment === 'object' && result.riskAssessment?.reason && (
                      <p className="text-white/60 text-sm mt-2">{result.riskAssessment.reason}</p>
                    )}
                  </GlassCard>
                )}

                {/* Recommended Approach */}
                {(result.recommendedApproach || result.recommended_approach || result.approach) && (
                  <GlassCard className="p-5">
                    <h3 className="text-white font-bold mb-2">Recommended Approach</h3>
                    <p className="text-white/75 text-sm leading-relaxed">
                      {typeof (result.recommendedApproach || result.recommended_approach || result.approach) === 'object'
                        ? JSON.stringify(result.recommendedApproach || result.recommended_approach || result.approach)
                        : (result.recommendedApproach || result.recommended_approach || result.approach)}
                    </p>
                    {(result.bestContactTime || result.best_contact_time) && (
                      <p className="text-white/40 text-xs mt-2">
                        Best Contact Time: {result.bestContactTime || result.best_contact_time}
                      </p>
                    )}
                  </GlassCard>
                )}

                {/* Payment Plan */}
                {(result.paymentPlan || result.payment_plan || result.suggestedPaymentPlan) && (
                  <GlassCard className="p-5">
                    <h3 className="text-white font-bold mb-3">Payment Plan Suggestion</h3>
                    {Array.isArray(result.paymentPlan || result.payment_plan || result.suggestedPaymentPlan) ? (
                      <ul className="space-y-2">
                        {(result.paymentPlan || result.payment_plan || result.suggestedPaymentPlan).map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-white/75">
                            <span className="text-neon-cyan mt-0.5 shrink-0">→</span>
                            {typeof item === 'object' ? item.installment || item.step || JSON.stringify(item) : item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-white/75 text-sm leading-relaxed">
                        {String(result.paymentPlan || result.payment_plan || result.suggestedPaymentPlan)}
                      </p>
                    )}
                  </GlassCard>
                )}

                {/* Communication Script */}
                {(result.suggestedMessage || result.suggested_message || result.script || result.communicationScript || result.communication_script) && (
                  <GlassCard className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-white font-bold">Suggested Message / Script</h3>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleCopyScript}
                        className="flex items-center gap-1.5"
                      >
                        {copied ? <MdCheck className="text-emerald-400" /> : <MdContentCopy />}
                        {copied ? 'Copied!' : 'Copy'}
                      </Button>
                    </div>
                    <div className="p-4 bg-white/5 rounded-lg border border-white/10 text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
                      {result.suggestedMessage || result.suggested_message || result.script ||
                       result.communicationScript || result.communication_script}
                    </div>
                  </GlassCard>
                )}

                {/* Escalation Timeline */}
                {(result.escalationTimeline || result.escalation_timeline) && (
                  <GlassCard className="p-5">
                    <h3 className="text-white font-bold mb-3">Escalation Timeline</h3>
                    {Array.isArray(result.escalationTimeline || result.escalation_timeline) ? (
                      <div className="space-y-2">
                        {(result.escalationTimeline || result.escalation_timeline).map((step, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 bg-white/5 rounded-lg">
                            <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-300 text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            <span className="text-sm text-white/75">
                              {typeof step === 'object' ? step.action || step.step || step.description || JSON.stringify(step) : step}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-white/75 text-sm">
                        {String(result.escalationTimeline || result.escalation_timeline)}
                      </p>
                    )}
                  </GlassCard>
                )}
              </>
            )}

            {/* Fallback raw text */}
            {!result && rawResult && !loading && (
              <GlassCard className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-bold">AI Strategy</h3>
                  <Button variant="secondary" size="sm" onClick={handleCopyScript}>
                    {copied ? <MdCheck className="text-emerald-400" /> : <MdContentCopy />}
                  </Button>
                </div>
                <pre className="text-white/75 text-sm leading-relaxed whitespace-pre-wrap font-sans">{rawResult}</pre>
              </GlassCard>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
