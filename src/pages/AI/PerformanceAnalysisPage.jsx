import { useState, useEffect } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { analyzePerformance } from '../../lib/openrouter';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import {
  MdAnalytics, MdAutoAwesome, MdSearch, MdClose,
  MdAdd, MdDelete, MdEdit,
} from 'react-icons/md';

const DEFAULT_SUBJECTS = ['Physics', 'Chemistry', 'Biology', 'Math', 'English', 'Social Studies'];

export default function PerformanceAnalysisPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  // Mode: 'search' or 'manual'
  const [mode, setMode] = useState('manual');

  // Student search
  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentLoading, setStudentLoading] = useState(false);

  // Manual entry rows: [{subject, marks, totalMarks, classAverage}]
  const [rows, setRows] = useState(
    DEFAULT_SUBJECTS.map(s => ({ subject: s, marks: '', totalMarks: '100', classAverage: '' }))
  );
  const [newSubject, setNewSubject] = useState('');

  // Analysis result
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [rawResult, setRawResult] = useState('');
  const [error, setError] = useState('');

  // ─── Search students ───────────────────────────────────────────────
  const handleStudentSearch = async (val) => {
    setStudentSearch(val);
    setSelectedStudent(null);
    if (!val.trim() || val.length < 2) { setStudentResults([]); return; }
    setStudentLoading(true);
    try {
      const { data } = await api.get('/students', { params: { search: val, pageSize: 8, page: 1 } });
      setStudentResults(data?.data || []);
    } catch {
      setStudentResults([]);
    } finally {
      setStudentLoading(false);
    }
  };

  // ─── Auto-load exam results for selected student ───────────────────
  const loadStudentResults = async (student) => {
    setSelectedStudent(student);
    setStudentResults([]);

    try {
      const { data } = await api.get(`/students/${student.id}/results`);
      const results = data || [];

      if (results.length > 0) {
        setRows(results.map((r) => ({
          subject: r.subject || r.exam_title || 'Unknown',
          marks: r.marks_obtained == null ? '' : String(r.marks_obtained),
          totalMarks: String(r.total_marks ?? '100'),
          classAverage: r.class_average == null ? '' : String(r.class_average),
        })));
        notification.success(`Loaded ${results.length} exam results`);
      } else {
        notification.info('No exam results found. You can enter marks manually below.');
      }
    } catch {
      notification.info('Could not load exam results. You can enter marks manually below.');
    }
  };

  // ─── Row management ────────────────────────────────────────────────
  const updateRow = (idx, field, value) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const removeRow = (idx) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const addRow = () => {
    if (!newSubject.trim()) return;
    setRows(prev => [...prev, { subject: newSubject.trim(), marks: '', totalMarks: '100', classAverage: '' }]);
    setNewSubject('');
  };

  // ─── Analyze ──────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    const validRows = rows.filter(r => r.subject && r.marks !== '' && r.totalMarks !== '');
    if (validRows.length === 0) {
      notification.error('Please enter at least one subject with marks');
      return;
    }

    const resultsArray = validRows.map(r => ({
      subject: r.subject,
      marks: parseFloat(r.marks) || 0,
      totalMarks: parseFloat(r.totalMarks) || 100,
      classAverage: r.classAverage ? parseFloat(r.classAverage) : null,
    }));

    setLoading(true);
    setError('');
    setResult(null);

    const response = await analyzePerformance(resultsArray);

    if (response.success === false) {
      setError(response.error || 'Analysis failed');
      notification.error('AI analysis failed');
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
      notification.success('Performance analysis complete!');
    }
    setLoading(false);
  };

  // ─── Radar chart data ──────────────────────────────────────────────
  const radarData = rows
    .filter(r => r.marks !== '' && r.totalMarks !== '')
    .map(r => ({
      subject: r.subject.length > 8 ? r.subject.substring(0, 8) + '…' : r.subject,
      score: Math.round((parseFloat(r.marks) / parseFloat(r.totalMarks)) * 100) || 0,
      classAvg: r.classAverage ? Math.round((parseFloat(r.classAverage) / parseFloat(r.totalMarks)) * 100) : 0,
    }));

  // ─── Line chart data (trajectory if AI provides it) ───────────────
  const trajectoryData = result?.improvementTrajectory || result?.improvement_trajectory || null;

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <MdAnalytics className="w-8 h-8 text-neon-cyan" />
          <h1 className="text-3xl font-bold text-white">AI Performance Analysis</h1>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode('search')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              mode === 'search' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            Student Search
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

        {/* Student search */}
        {mode === 'search' && (
          <GlassCard className="p-5">
            <h3 className="text-white font-bold mb-3">Search Student</h3>
            {selectedStudent ? (
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                <div>
                  <p className="text-white font-medium">
                    {selectedStudent.first_name} {selectedStudent.last_name}
                  </p>
                  <p className="text-white/50 text-sm">
                    {selectedStudent.admission_no} &middot; {selectedStudent.class_name}
                  </p>
                </div>
                <button
                  onClick={() => { setSelectedStudent(null); setStudentSearch(''); }}
                  className="ml-auto text-white/40 hover:text-white/70"
                >
                  <MdClose className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative max-w-sm">
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
                        onClick={() => loadStudentResults(s)}
                      >
                        {s.first_name} {s.last_name}
                        <span className="text-white/40 ml-2 text-xs">{s.admission_no} &middot; {s.class_name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {studentLoading && <p className="text-white/40 text-xs mt-1">Searching...</p>}
              </div>
            )}
          </GlassCard>
        )}

        {/* Marks entry table */}
        <GlassCard className="p-5">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            <MdEdit className="text-neon-cyan w-4 h-4" />
            Subject Marks
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 px-3 text-white/50 font-medium">Subject</th>
                  <th className="text-left py-2 px-3 text-white/50 font-medium">Marks Obtained</th>
                  <th className="text-left py-2 px-3 text-white/50 font-medium">Total Marks</th>
                  <th className="text-left py-2 px-3 text-white/50 font-medium">Class Average</th>
                  <th className="text-left py-2 px-3 text-white/50 font-medium">%</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const pct = row.marks && row.totalMarks
                    ? Math.round((parseFloat(row.marks) / parseFloat(row.totalMarks)) * 100)
                    : null;
                  return (
                    <tr key={idx} className="border-b border-white/5">
                      <td className="py-2 px-3">
                        <input
                          className="input-glass py-1.5 text-sm w-28"
                          value={row.subject}
                          onChange={e => updateRow(idx, 'subject', e.target.value)}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number" min="0"
                          className="input-glass py-1.5 text-sm w-20"
                          value={row.marks}
                          onChange={e => updateRow(idx, 'marks', e.target.value)}
                          placeholder="—"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number" min="1"
                          className="input-glass py-1.5 text-sm w-20"
                          value={row.totalMarks}
                          onChange={e => updateRow(idx, 'totalMarks', e.target.value)}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number" min="0"
                          className="input-glass py-1.5 text-sm w-20"
                          value={row.classAverage}
                          onChange={e => updateRow(idx, 'classAverage', e.target.value)}
                          placeholder="optional"
                        />
                      </td>
                      <td className="py-2 px-3">
                        {pct !== null && (
                          <span className={`font-semibold text-sm ${
                            pct >= 75 ? 'text-emerald-400' :
                            pct >= 50 ? 'text-amber-400' : 'text-red-400'
                          }`}>{pct}%</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <button onClick={() => removeRow(idx)} className="text-red-400/50 hover:text-red-400 transition">
                          <MdDelete className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Add subject row */}
          <div className="flex gap-2 mt-3">
            <input
              className="input-glass py-1.5 text-sm"
              placeholder="Add subject..."
              value={newSubject}
              onChange={e => setNewSubject(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addRow()}
            />
            <Button variant="secondary" size="sm" onClick={addRow}>
              <MdAdd />
            </Button>
          </div>
        </GlassCard>

        {/* Radar chart preview */}
        {radarData.length >= 3 && (
          <GlassCard className="p-5">
            <h3 className="text-white font-bold mb-4">Subject Performance Overview</h3>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }} />
                <Radar name="Score %" dataKey="score" stroke="#00e5ff" fill="#00e5ff" fillOpacity={0.15} strokeWidth={2} />
                {radarData.some(d => d.classAvg > 0) && (
                  <Radar name="Class Avg %" dataKey="classAvg" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.1} strokeWidth={1.5} strokeDasharray="4 2" />
                )}
                <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          </GlassCard>
        )}

        {/* Analyze button */}
        <div className="flex justify-center">
          <Button
            variant="primary"
            loading={loading}
            onClick={handleAnalyze}
            className="flex items-center gap-2 px-8"
          >
            <MdAutoAwesome /> Analyze Performance
          </Button>
        </div>

        {/* Error */}
        {error && (
          <GlassCard className="p-5 border border-red-500/30">
            <p className="text-red-400">{error}</p>
          </GlassCard>
        )}

        {/* Results */}
        {(result || rawResult) && !loading && (
          <div className="space-y-5">
            {result ? (
              <>
                {/* Strong + Weak subjects */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {(result.strongSubjects || result.strong_subjects) && (
                    <GlassCard className="p-5">
                      <h3 className="text-white font-bold mb-3 text-emerald-400">Strong Subjects</h3>
                      <ul className="space-y-1.5">
                        {(result.strongSubjects || result.strong_subjects || []).map((s, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-white/80">
                            <span className="text-emerald-400">✓</span>
                            {typeof s === 'object' ? s.subject || s.name || JSON.stringify(s) : s}
                          </li>
                        ))}
                      </ul>
                    </GlassCard>
                  )}
                  {(result.weakSubjects || result.weak_subjects) && (
                    <GlassCard className="p-5">
                      <h3 className="text-white font-bold mb-3 text-red-400">Weak Subjects</h3>
                      <ul className="space-y-1.5">
                        {(result.weakSubjects || result.weak_subjects || []).map((s, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-white/80">
                            <span className="text-red-400">!</span>
                            {typeof s === 'object' ? s.subject || s.name || JSON.stringify(s) : s}
                          </li>
                        ))}
                      </ul>
                    </GlassCard>
                  )}
                </div>

                {/* Improvement Trajectory chart */}
                {trajectoryData && Array.isArray(trajectoryData) && trajectoryData.length > 1 && (
                  <GlassCard className="p-5">
                    <h3 className="text-white font-bold mb-4">Improvement Trajectory</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={trajectoryData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis
                          dataKey={Object.keys(trajectoryData[0]).find(k => k !== 'score' && k !== 'value') || 'period'}
                          tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                        />
                        <YAxis tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} domain={[0, 100]} />
                        <Tooltip
                          contentStyle={{ background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                          labelStyle={{ color: '#fff' }}
                        />
                        <Line type="monotone" dataKey="score" stroke="#00e5ff" strokeWidth={2} dot={{ fill: '#00e5ff', r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </GlassCard>
                )}

                {/* Recommended Topics */}
                {(result.recommendedTopics || result.recommended_topics || result.remedialTopics || result.remedial_topics) && (
                  <GlassCard className="p-5">
                    <h3 className="text-white font-bold mb-3">Recommended Study Topics</h3>
                    <div className="flex flex-wrap gap-2">
                      {(result.recommendedTopics || result.recommended_topics || result.remedialTopics || result.remedial_topics || []).map((topic, i) => (
                        <span key={i} className="px-3 py-1.5 text-sm bg-purple-500/15 text-purple-300 border border-purple-500/25 rounded-lg">
                          {typeof topic === 'object' ? topic.topic || topic.subject || JSON.stringify(topic) : topic}
                        </span>
                      ))}
                    </div>
                  </GlassCard>
                )}

                {/* Predicted Score */}
                {(result.predictedBoardScore || result.predicted_board_score || result.predictedScore) && (
                  <GlassCard className="p-5">
                    <h3 className="text-white font-bold mb-2">Predicted Board Exam Score</h3>
                    <p className="text-3xl font-bold text-neon-cyan">
                      {result.predictedBoardScore || result.predicted_board_score || result.predictedScore}
                    </p>
                  </GlassCard>
                )}

                {/* Study Strategy */}
                {(result.studyStrategy || result.study_strategy || result.studyStrategySuggestions) && (
                  <GlassCard className="p-5">
                    <h3 className="text-white font-bold mb-3">Study Strategy</h3>
                    <ul className="space-y-2">
                      {(result.studyStrategy || result.study_strategy || result.studyStrategySuggestions || []).map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-white/75">
                          <span className="text-neon-cyan mt-0.5 shrink-0">→</span>
                          {typeof item === 'object' ? item.suggestion || item.strategy || JSON.stringify(item) : item}
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                )}
              </>
            ) : (
              <GlassCard className="p-5">
                <h3 className="text-white font-bold mb-3">AI Analysis</h3>
                <pre className="text-white/75 text-sm leading-relaxed whitespace-pre-wrap font-sans">{rawResult}</pre>
              </GlassCard>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
