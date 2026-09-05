import { useState, useEffect } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdWarning } from 'react-icons/md';

function riskColor(score) {
  if (score >= 70) return 'text-red-400 border-red-500/30 bg-red-500/10';
  if (score >= 40) return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
  return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
}

export default function EarlyWarningPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [atRisk, setAtRisk] = useState([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    if (!profile?.institution_id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/early-warning');
      setAtRisk(data.at_risk || []);
      setTotalStudents(data.total_students || 0);
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to load early-warning data';
      setError(message);
      notification.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (profile) load(); }, [profile]);

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">AI Early-Warning Alerts</h1>
          <p className="text-white/50 text-sm mt-1">Students flagged from attendance, exam performance, and overdue fees — rule-based, updates live.</p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-white/50">Loading...</div>
        ) : error ? (
          <GlassCard className="p-10 text-center">
            <p className="text-red-400 mb-3">{error}</p>
            <Button variant="secondary" onClick={load}>Retry</Button>
          </GlassCard>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <GlassCard className="p-4">
                <p className="text-white/50 text-xs uppercase tracking-wider mb-1">Total Students</p>
                <p className="text-2xl font-bold text-white">{totalStudents}</p>
              </GlassCard>
              <GlassCard className="p-4">
                <p className="text-white/50 text-xs uppercase tracking-wider mb-1">Flagged At-Risk</p>
                <p className="text-2xl font-bold text-red-400">{atRisk.length}</p>
              </GlassCard>
            </div>

            {atRisk.length === 0 ? (
              <GlassCard className="p-10 text-center text-white/40">No students currently flagged as at-risk. 🎉</GlassCard>
            ) : (
              <div className="space-y-3">
                {atRisk.map(s => (
                  <GlassCard key={s.id} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <MdWarning className="w-4 h-4 text-amber-400" />
                        <p className="text-white font-semibold">{s.first_name} {s.last_name}</p>
                        <span className="text-white/40 text-xs">Class {s.class_name}{s.section ? ` ${s.section}` : ''}</span>
                      </div>
                      <span className={`px-2 py-0.5 text-xs rounded border font-bold ${riskColor(s.risk_score)}`}>Risk {s.risk_score}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {s.reasons.map((r, i) => (
                        <span key={i} className="px-2 py-1 text-xs bg-white/5 text-white/60 rounded-lg">{r}</span>
                      ))}
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
