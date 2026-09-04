import { useState } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import { useAppData } from '../../hooks/useAppData';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdSearch, MdPrint } from 'react-icons/md';
import { formatDate } from '../../utils/helpers';

export default function ReportCardsPage() {
  const { institution } = useAppData();
  const notification = useNotification();

  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [student, setStudent] = useState(null);
  const [examResults, setExamResults] = useState([]);
  const [loading, setLoading] = useState(false);

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

  const selectStudent = async (s) => {
    setResults([]);
    setSearch('');
    setLoading(true);
    try {
      const { data } = await api.get(`/report-cards/student/${s.id}`);
      setStudent(data.student);
      setExamResults(data.results || []);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load report card');
    } finally {
      setLoading(false);
    }
  };

  const totalObtained = examResults.reduce((sum, r) => sum + (Number(r.marks_obtained) || 0), 0);
  const totalMax = examResults.reduce((sum, r) => sum + (Number(r.total_marks) || 0), 0);
  const percentage = totalMax > 0 ? ((totalObtained / totalMax) * 100).toFixed(1) : '—';

  return (
    <MainLayout>
      <div className="p-6 space-y-6 print:p-0">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #report-card-print-area, #report-card-print-area * { visibility: visible; }
            #report-card-print-area { position: absolute; top: 0; left: 0; width: 100%; }
          }
        `}</style>

        <div className="flex justify-between items-center print:hidden">
          <h1 className="text-3xl font-bold text-white">Report Card Generator</h1>
          {student && (
            <Button variant="primary" onClick={() => window.print()}>
              <MdPrint className="inline mr-1" /> Print
            </Button>
          )}
        </div>

        <GlassCard className="p-4 print:hidden">
          <div className="relative">
            <MdSearch className="absolute left-3 top-3 w-4 h-4 text-white/40" />
            <input className="input-glass w-full pl-9" placeholder="Search student by name..." value={search} onChange={e => runSearch(e.target.value)} />
          </div>
          {results.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
              {results.map(s => (
                <button key={s.id} onClick={() => selectStudent(s)} className="w-full text-left px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-white/80 transition">
                  {s.first_name} {s.last_name} · Class {s.class_name}
                </button>
              ))}
            </div>
          )}
        </GlassCard>

        {loading ? (
          <div className="text-center py-12 text-white/50">Loading...</div>
        ) : !student ? (
          <GlassCard className="p-10 text-center text-white/40 print:hidden">Search and select a student to generate their report card.</GlassCard>
        ) : (
          <div id="report-card-print-area">
            <GlassCard className="p-6 bg-white">
              <div className="flex items-center gap-3 mb-6 border-b border-slate-200 pb-4">
                {institution?.logo_url && <img src={institution.logo_url} alt="" className="w-12 h-12 rounded object-cover" />}
                <div>
                  <p className="font-bold text-lg text-slate-800">{institution?.name || 'CyberMilo Institution'}</p>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Report Card</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-6 text-sm">
                <p className="text-slate-500">Student: <span className="text-slate-800 font-semibold">{student.first_name} {student.last_name}</span></p>
                <p className="text-slate-500">Admission No: <span className="text-slate-800 font-semibold">{student.admission_no || '—'}</span></p>
                <p className="text-slate-500">Class: <span className="text-slate-800 font-semibold">{student.class_name}{student.section ? ` - ${student.section}` : ''}</span></p>
                <p className="text-slate-500">Generated: <span className="text-slate-800 font-semibold">{formatDate(new Date())}</span></p>
              </div>

              {examResults.length === 0 ? (
                <p className="text-slate-400 text-center py-8">No exam results recorded for this student yet.</p>
              ) : (
                <table className="w-full text-sm mb-4">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-left">
                      <th className="py-2">Exam</th>
                      <th className="py-2">Subject</th>
                      <th className="py-2 text-right">Marks</th>
                      <th className="py-2 text-right">Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {examResults.map((r, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="py-2 text-slate-700">{r.exam_title}</td>
                        <td className="py-2 text-slate-700">{r.subject || '—'}</td>
                        <td className="py-2 text-right text-slate-700">{r.marks_obtained ?? '—'}{r.total_marks ? ` / ${r.total_marks}` : ''}</td>
                        <td className="py-2 text-right text-slate-700">{r.grade || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {examResults.length > 0 && (
                <div className="flex justify-end gap-6 pt-3 border-t border-slate-200 text-sm">
                  <p className="text-slate-500">Total: <span className="text-slate-800 font-bold">{totalObtained} / {totalMax}</span></p>
                  <p className="text-slate-500">Percentage: <span className="text-slate-800 font-bold">{percentage}{percentage !== '—' ? '%' : ''}</span></p>
                </div>
              )}
            </GlassCard>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
