import { useState, useEffect } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import { useAppData } from '../../hooks/useAppData';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdSearch, MdPrint, MdBlock } from 'react-icons/md';
import { formatDate, fileHref } from '../../utils/helpers';

function qrUrl(data) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=110x110&margin=0&data=${encodeURIComponent(data)}`;
}

export default function HallTicketsPage() {
  const { institution } = useAppData();
  const { profile } = useAuth();
  const notification = useNotification();

  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [student, setStudent] = useState(null);

  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState('');
  const [ticket, setTicket] = useState(null);
  const [blocked, setBlocked] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadExams = async () => {
    try {
      const { data } = await api.get('/exams');
      setExams(data || []);
    } catch {
      setExams([]);
    }
  };

  useEffect(() => { if (profile) loadExams(); }, [profile]);

  const runSearch = async (val) => {
    setSearch(val);
    if (!val.trim() || val.length < 2) { setResults([]); return; }
    try {
      const { data } = await api.get('/students', { params: { search: val, pageSize: 10, page: 1 } });
      setResults(data?.data || []);
    } catch {
      setResults([]);
    }
  };

  const selectStudent = (s) => {
    setStudent(s);
    setResults([]);
    setSearch('');
    setTicket(null);
    setBlocked(null);
    setExamId('');
  };

  const generateTicket = async () => {
    if (!student || !examId) { notification.error('Select a student and an exam'); return; }
    setLoading(true);
    setTicket(null);
    setBlocked(null);
    try {
      const { data } = await api.get(`/hall-tickets/${examId}/${student.id}`);
      setTicket(data);
    } catch (err) {
      if (err.response?.data?.code === 'fee_not_cleared') {
        setBlocked(err.response.data.details || {});
      } else {
        notification.error(err.response?.data?.error || 'Failed to generate hall ticket');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6 print:p-0">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #hall-ticket-print-area, #hall-ticket-print-area * { visibility: visible; }
            #hall-ticket-print-area { position: absolute; top: 0; left: 0; width: 100%; }
          }
        `}</style>

        <div className="flex justify-between items-center print:hidden">
          <h1 className="text-3xl font-bold text-white">Hall Ticket / Admit Card</h1>
          {ticket && (
            <Button variant="primary" onClick={() => window.print()}>
              <MdPrint className="inline mr-1" /> Print
            </Button>
          )}
        </div>

        <GlassCard className="p-4 print:hidden space-y-3">
          <div className="relative">
            <MdSearch className="absolute left-3 top-3 w-4 h-4 text-white/40" />
            <input className="input-glass w-full pl-9" placeholder="Search student by name..." value={search} onChange={(e) => runSearch(e.target.value)} />
          </div>
          {results.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {results.map((s) => (
                <button key={s.id} onClick={() => selectStudent(s)} className="w-full text-left px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-white/80 transition">
                  {s.first_name} {s.last_name} · Class {s.class_name}
                </button>
              ))}
            </div>
          )}

          {student && (
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-white/5 rounded-lg px-3 py-2 text-sm text-white">
                {student.first_name} {student.last_name} · Class {student.class_name}
              </div>
              <select className="input-glass" value={examId} onChange={(e) => setExamId(e.target.value)}>
                <option value="">-- Select Exam --</option>
                {exams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
              <Button variant="primary" loading={loading} onClick={generateTicket}>Generate</Button>
            </div>
          )}
        </GlassCard>

        {blocked && (
          <GlassCard className="p-8 text-center border border-red-500/30 print:hidden">
            <MdBlock className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-red-300 font-semibold mb-1">Hall Ticket Blocked — Fees Pending</p>
            <p className="text-white/50 text-sm">{blocked.pending_count} pending fee payment(s) totalling ₹{blocked.pending_amount}. Clear dues to generate the hall ticket.</p>
          </GlassCard>
        )}

        {ticket && (
          <div id="hall-ticket-print-area">
            <GlassCard className="p-6 bg-white max-w-xl mx-auto">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
                <div className="flex items-center gap-3">
                  {institution?.logo_url && <img src={fileHref(institution.logo_url)} alt="" className="w-12 h-12 rounded object-cover" />}
                  <div>
                    <p className="font-bold text-lg text-slate-800">{institution?.name || 'CyberMilo Institution'}</p>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Hall Ticket / Admit Card</p>
                  </div>
                </div>
                <img src={qrUrl(`HALLTICKET:${ticket.student.admission_no || ticket.student.id}:${ticket.exam.id}`)} alt="QR" className="w-16 h-16" />
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <p className="text-slate-500">Student: <span className="text-slate-800 font-semibold">{ticket.student.first_name} {ticket.student.last_name}</span></p>
                <p className="text-slate-500">Admission No: <span className="text-slate-800 font-semibold">{ticket.student.admission_no || '—'}</span></p>
                <p className="text-slate-500">Class: <span className="text-slate-800 font-semibold">{ticket.student.class_name}{ticket.student.section ? ` - ${ticket.student.section}` : ''}</span></p>
                <p className="text-slate-500">Exam: <span className="text-slate-800 font-semibold">{ticket.exam.title}</span></p>
                <p className="text-slate-500">Subject: <span className="text-slate-800 font-semibold">{ticket.exam.subject || '—'}</span></p>
                <p className="text-slate-500">Date: <span className="text-slate-800 font-semibold">{ticket.exam.exam_date ? formatDate(ticket.exam.exam_date) : '—'}</span></p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200 text-center">
                <p className="text-emerald-600 text-sm font-semibold">✓ Fees Cleared — Eligible to Appear</p>
              </div>
            </GlassCard>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
