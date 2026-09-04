import { useState, useEffect } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdDownload, MdPlayArrow } from 'react-icons/md';

export default function ReportsBuilderPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [types, setTypes] = useState([]);
  const [selectedType, setSelectedType] = useState('students');
  const [filters, setFilters] = useState({});
  const [exams, setExams] = useState([]);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!profile?.institution_id) return;
    api.get('/reports-builder/types').then(({ data }) => setTypes(data.types || [])).catch(() => {});
  }, [profile]);

  useEffect(() => {
    if (selectedType === 'exam_results' && profile?.institution_id) {
      api.get('/exams', { params: { status: 'completed' } }).then(({ data }) => setExams(data || [])).catch(() => setExams([]));
    }
  }, [selectedType, profile]);

  const currentType = types.find(t => t.key === selectedType);

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    try {
      const params = { type: selectedType, ...filters };
      const { data } = await api.get('/reports-builder/run', { params });
      setResult(data);
      if ((data.rows || []).length === 0) notification.info?.('No rows matched these filters');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to run report');
    } finally {
      setRunning(false);
    }
  };

  const handleExportCsv = () => {
    if (!result) return;
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [result.columns.join(','), ...result.rows.map(row => row.map(escape).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedType}_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-3xl font-bold text-white">Custom Report Builder</h1>

        <GlassCard className="p-5">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-white/60 text-xs mb-1.5">Report Type</label>
              <select
                className="input-glass"
                value={selectedType}
                onChange={e => { setSelectedType(e.target.value); setFilters({}); setResult(null); }}
              >
                {types.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>

            {currentType?.filters.includes('class_name') && (
              <div>
                <label className="block text-white/60 text-xs mb-1.5">Class</label>
                <input className="input-glass" placeholder="e.g. 10" value={filters.class_name || ''} onChange={e => setFilters(f => ({ ...f, class_name: e.target.value }))} />
              </div>
            )}
            {currentType?.filters.includes('status') && (
              <div>
                <label className="block text-white/60 text-xs mb-1.5">Status</label>
                <input className="input-glass" placeholder="active / pending..." value={filters.status || ''} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} />
              </div>
            )}
            {currentType?.filters.includes('from') && (
              <div>
                <label className="block text-white/60 text-xs mb-1.5">From</label>
                <input type="date" className="input-glass" value={filters.from || ''} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
              </div>
            )}
            {currentType?.filters.includes('to') && (
              <div>
                <label className="block text-white/60 text-xs mb-1.5">To</label>
                <input type="date" className="input-glass" value={filters.to || ''} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
              </div>
            )}
            {currentType?.filters.includes('exam_id') && (
              <div>
                <label className="block text-white/60 text-xs mb-1.5">Exam</label>
                <select className="input-glass" value={filters.exam_id || ''} onChange={e => setFilters(f => ({ ...f, exam_id: e.target.value }))}>
                  <option value="">-- Select exam --</option>
                  {exams.map(ex => <option key={ex.id} value={ex.id}>{ex.title} · {ex.subject}</option>)}
                </select>
              </div>
            )}

            <Button variant="primary" loading={running} onClick={handleRun}>
              <MdPlayArrow className="inline mr-1" /> Run Report
            </Button>
          </div>
        </GlassCard>

        {result && (
          <GlassCard className="p-0 overflow-hidden">
            <div className="flex justify-between items-center px-5 py-4 border-b border-white/10">
              <p className="text-white/70 text-sm font-semibold">{result.rows.length} row(s)</p>
              <Button variant="secondary" size="sm" onClick={handleExportCsv} disabled={result.rows.length === 0}>
                <MdDownload className="inline mr-1" /> Export CSV
              </Button>
            </div>
            {result.rows.length === 0 ? (
              <p className="text-white/40 text-center py-10">No data matched these filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      {result.columns.map(col => (
                        <th key={col} className="text-left py-3 px-4 text-white/50">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/3 transition">
                        {row.map((cell, j) => (
                          <td key={j} className="py-2.5 px-4 text-white/80">{cell ?? '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        )}
      </div>
    </MainLayout>
  );
}
