import { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { formatDate } from '../../utils/helpers';
import {
  MdAdd,
  MdClose,
  MdEditNote,
  MdBarChart,
  MdSchool,
  MdUpdate,
} from 'react-icons/md';

// ─── constants ───────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().split('T')[0];

const EXAM_STATUS_COLORS = {
  upcoming: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  ongoing: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  completed: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
};

function calcGrade(marks, total) {
  const pct = total > 0 ? (marks / total) * 100 : 0;
  if (pct >= 91) return 'A+';
  if (pct >= 81) return 'A';
  if (pct >= 71) return 'B+';
  if (pct >= 61) return 'B';
  if (pct >= 51) return 'C';
  if (pct >= 41) return 'D';
  return 'F';
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content w-full"
        style={{ maxWidth: wide ? 760 : 520 }}
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExamsPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [activeTab, setActiveTab] = useState('exams'); // 'exams' | 'results'

  // ── exams state ────────────────────────────────────────────────────────────
  const [exams, setExams] = useState([]);
  const [loadingExams, setLoadingExams] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterClass, setFilterClass] = useState('');

  // create exam modal
  const [createModal, setCreateModal] = useState(false);
  const [examForm, setExamForm] = useState({
    title: '', subject: '', class_name: '', exam_date: '', total_marks: '', pass_marks: '',
  });
  const [savingExam, setSavingExam] = useState(false);

  // update status modal
  const [statusModal, setStatusModal] = useState(null);
  const [newStatus, setNewStatus] = useState('upcoming');
  const [savingStatus, setSavingStatus] = useState(false);

  // ── results state ──────────────────────────────────────────────────────────
  const [completedExams, setCompletedExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [selectedExam, setSelectedExam] = useState(null);
  const [results, setResults] = useState([]);
  const [loadingResults, setLoadingResults] = useState(false);

  // enter results modal
  const [enterModal, setEnterModal] = useState(false);
  const [classStudents, setClassStudents] = useState([]);
  const [marksInput, setMarksInput] = useState({}); // { student_id: marks }
  const [savingResults, setSavingResults] = useState(false);

  // ── loaders ────────────────────────────────────────────────────────────────

  const loadExams = useCallback(async () => {
    if (!profile?.institution_id) return;
    setLoadingExams(true);
    try {
      const { data } = await api.get('/exams');
      setExams(data || []);
      setCompletedExams((data || []).filter((e) => e.status === 'completed'));
    } catch (err) {
      notification.error('Failed to load exams: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoadingExams(false);
    }
  }, [profile?.institution_id]);

  const loadResults = useCallback(async (examId) => {
    if (!examId) { setResults([]); return; }
    setLoadingResults(true);
    try {
      const { data } = await api.get(`/exams/${examId}/results`);
      // The API returns the student's columns flat; the table reads them
      // from a nested `students` object, so shape them here.
      setResults((data || []).map((row) => ({
        ...row,
        students: {
          first_name: row.first_name,
          last_name: row.last_name,
          admission_no: row.admission_no,
        },
      })));
    } catch (err) {
      notification.error('Failed to load results: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoadingResults(false);
    }
  }, []);

  const loadClassStudents = useCallback(async (className) => {
    if (!className || !profile?.institution_id) return;
    try {
      const { data } = await api.get('/students', { params: { class_name: className, pageSize: 200, page: 1 } });
      const students = data?.data || [];
      setClassStudents(students);
      setMarksInput(Object.fromEntries(students.map((student) => [student.id, ''])));
    } catch {
      setClassStudents([]);
      setMarksInput({});
    }
  }, [profile?.institution_id]);

  useEffect(() => { loadExams(); }, [loadExams]);
  useEffect(() => {
    if (selectedExamId) {
      const exam = exams.find((e) => e.id === selectedExamId);
      setSelectedExam(exam || null);
      loadResults(selectedExamId);
    } else {
      setSelectedExam(null);
      setResults([]);
    }
  }, [selectedExamId, exams]);

  // ── derived ────────────────────────────────────────────────────────────────

  const examClasses = [...new Set(exams.map((e) => e.class_name).filter(Boolean))].sort();

  const filteredExams = exams.filter((e) => {
    if (filterStatus !== 'all' && e.status !== filterStatus) return false;
    if (filterClass && e.class_name !== filterClass) return false;
    return true;
  });

  const resultStats = (() => {
    if (!results.length || !selectedExam) return null;
    const total = results.length;
    const passed = results.filter(
      (r) => r.marks_obtained >= (selectedExam.pass_marks || 0)
    ).length;
    const avg = results.reduce((s, r) => s + (r.marks_obtained || 0), 0) / total;
    const highest = Math.max(...results.map((r) => r.marks_obtained || 0));
    return { total, passed, passPercent: ((passed / total) * 100).toFixed(1), avg: avg.toFixed(1), highest };
  })();

  // ── create exam ────────────────────────────────────────────────────────────

  const handleCreateExam = async () => {
    const { title, subject, class_name, exam_date, total_marks, pass_marks } = examForm;
    if (!title || !subject || !class_name || !exam_date || !total_marks || !pass_marks) {
      notification.error('Please fill all required fields');
      return;
    }
    setSavingExam(true);
    try {
      await api.post('/exams', {
        title,
        subject,
        class_name,
        exam_date,
        total_marks: parseInt(total_marks, 10),
        pass_marks: parseInt(pass_marks, 10),
        status: 'upcoming',
      });
      notification.success('Exam created successfully');
      setCreateModal(false);
      setExamForm({ title: '', subject: '', class_name: '', exam_date: '', total_marks: '', pass_marks: '' });
      loadExams();
    } catch (err) {
      notification.error('Failed to create exam: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingExam(false);
    }
  };

  // ── update status ──────────────────────────────────────────────────────────

  const handleUpdateStatus = async () => {
    if (!statusModal) return;
    setSavingStatus(true);
    try {
      await api.put(`/exams/${statusModal.id}`, { status: newStatus });
      notification.success('Exam status updated');
      setStatusModal(null);
      loadExams();
    } catch (err) {
      notification.error('Failed to update status: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingStatus(false);
    }
  };

  // ── enter results ──────────────────────────────────────────────────────────

  const openEnterResults = async () => {
    if (!selectedExam) return;
    await loadClassStudents(selectedExam.class_name);
    setEnterModal(true);
  };

  const handleSaveResults = async () => {
    if (!selectedExam) return;
    const entries = classStudents
      .filter((s) => marksInput[s.id] !== '' && marksInput[s.id] !== undefined)
      .map((s) => {
        const marks = parseInt(marksInput[s.id]) || 0;
        const grade = calcGrade(marks, selectedExam.total_marks);
        const isPassed = marks >= (selectedExam.pass_marks || 0);
        return {
          exam_id: selectedExam.id,
          student_id: s.id,
          marks_obtained: marks,
          grade,
          remarks: isPassed ? 'Pass' : 'Fail',
        };
      });

    if (!entries.length) {
      notification.error('Enter at least one student\'s marks');
      return;
    }

    setSavingResults(true);
    try {
      // POST /results is an upsert per student, so re-entering a mark
      // corrects it rather than duplicating the row.
      await Promise.all(entries.map((entry) => api.post(`/exams/${selectedExam.id}/results`, {
        student_id: entry.student_id,
        marks_obtained: entry.marks_obtained,
        grade: entry.grade,
        remarks: entry.remarks,
      })));
      notification.success(`Saved ${entries.length} result(s)`);
      setEnterModal(false);
      loadResults(selectedExam.id);
    } catch (err) {
      notification.error('Failed to save results: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingResults(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <MainLayout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h1 className="text-3xl font-bold text-white">Exams & Results</h1>
          {activeTab === 'exams' && (
            <Button variant="primary" size="sm" onClick={() => setCreateModal(true)}>
              <MdAdd className="mr-1 inline" /> Create Exam
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-fit border border-white/10">
          {['exams', 'results'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition capitalize ${
                activeTab === tab
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              {tab === 'exams' ? 'Exams' : 'Results'}
            </button>
          ))}
        </div>

        {/* ── EXAMS TAB ──────────────────────────────────────────────────── */}
        {activeTab === 'exams' && (
          <>
            {/* Filters */}
            <GlassCard className="p-4">
              <div className="flex flex-wrap gap-3 items-center">
                <select
                  className="input-glass py-2 text-sm"
                  style={{ width: 160 }}
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="all">All Status</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                </select>
                <select
                  className="input-glass py-2 text-sm"
                  style={{ width: 160 }}
                  value={filterClass}
                  onChange={(e) => setFilterClass(e.target.value)}
                >
                  <option value="">All Classes</option>
                  {examClasses.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <span className="text-white/40 text-sm">{filteredExams.length} exam(s)</span>
              </div>
            </GlassCard>

            {/* Exams Table */}
            <GlassCard className="p-0 overflow-hidden">
              {loadingExams ? (
                <div className="flex items-center justify-center py-20">
                  <div className="spinner" />
                  <span className="ml-3 text-white/60">Loading exams…</span>
                </div>
              ) : filteredExams.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <MdSchool className="w-12 h-12 text-white/20" />
                  <p className="text-white/50 text-lg">No exams found</p>
                  <Button variant="primary" size="sm" onClick={() => setCreateModal(true)}>
                    <MdAdd className="mr-1 inline" /> Create First Exam
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5">
                        <th className="text-left py-3 px-4 text-white/60 font-medium">Title</th>
                        <th className="text-left py-3 px-4 text-white/60 font-medium">Subject</th>
                        <th className="text-left py-3 px-4 text-white/60 font-medium">Class</th>
                        <th className="text-left py-3 px-4 text-white/60 font-medium">Exam Date</th>
                        <th className="text-center py-3 px-4 text-white/60 font-medium">Total Marks</th>
                        <th className="text-center py-3 px-4 text-white/60 font-medium">Pass Marks</th>
                        <th className="text-left py-3 px-4 text-white/60 font-medium">Status</th>
                        <th className="text-center py-3 px-4 text-white/60 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExams.map((exam) => (
                        <tr key={exam.id} className="border-b border-white/5 hover:bg-white/5 transition">
                          <td className="py-3 px-4 text-white font-medium">{exam.title}</td>
                          <td className="py-3 px-4 text-white/70">{exam.subject}</td>
                          <td className="py-3 px-4 text-white/70">{exam.class_name}</td>
                          <td className="py-3 px-4 text-white/70">{formatDate(exam.exam_date)}</td>
                          <td className="py-3 px-4 text-center text-white">{exam.total_marks}</td>
                          <td className="py-3 px-4 text-center text-white/70">{exam.pass_marks}</td>
                          <td className="py-3 px-4">
                            <span className={`badge text-xs ${EXAM_STATUS_COLORS[exam.status] || 'bg-gray-500/20 text-gray-300'}`}>
                              {exam.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => { setStatusModal(exam); setNewStatus(exam.status); }}
                              className="text-amber-400 hover:text-amber-300 transition text-xs flex items-center gap-1 mx-auto"
                            >
                              <MdUpdate className="w-4 h-4" /> Status
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassCard>
          </>
        )}

        {/* ── RESULTS TAB ────────────────────────────────────────────────── */}
        {activeTab === 'results' && (
          <>
            {/* Exam Selector */}
            <GlassCard className="p-4">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="flex-1 min-w-64">
                  <label className="block text-white/60 text-xs mb-1 uppercase tracking-wide">
                    Select Completed Exam
                  </label>
                  <select
                    className="input-glass py-2 text-sm w-full"
                    value={selectedExamId}
                    onChange={(e) => setSelectedExamId(e.target.value)}
                  >
                    <option value="">— Choose an exam —</option>
                    {completedExams.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title} · {e.subject} · {e.class_name} · {formatDate(e.exam_date)}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedExam && (
                  <Button variant="primary" size="sm" onClick={openEnterResults}>
                    <MdEditNote className="mr-1 inline" /> Enter / Update Results
                  </Button>
                )}
              </div>
            </GlassCard>

            {/* Stats strip */}
            {resultStats && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <GlassCard className="p-5">
                  <p className="text-white/60 text-xs uppercase tracking-wide mb-1">Students</p>
                  <p className="text-2xl font-bold text-white">{resultStats.total}</p>
                </GlassCard>
                <GlassCard className="p-5">
                  <p className="text-white/60 text-xs uppercase tracking-wide mb-1">Pass %</p>
                  <p className="text-2xl font-bold text-emerald-400">{resultStats.passPercent}%</p>
                </GlassCard>
                <GlassCard className="p-5">
                  <p className="text-white/60 text-xs uppercase tracking-wide mb-1">Class Average</p>
                  <p className="text-2xl font-bold text-blue-400">{resultStats.avg}</p>
                </GlassCard>
                <GlassCard className="p-5">
                  <p className="text-white/60 text-xs uppercase tracking-wide mb-1">Highest Score</p>
                  <p className="text-2xl font-bold text-amber-400">{resultStats.highest}</p>
                </GlassCard>
              </div>
            )}

            {/* Results Table */}
            {!selectedExamId ? (
              <GlassCard className="p-12 flex flex-col items-center gap-3">
                <MdBarChart className="w-12 h-12 text-white/20" />
                <p className="text-white/50 text-lg">Select an exam to view results</p>
              </GlassCard>
            ) : loadingResults ? (
              <GlassCard className="p-12 flex items-center justify-center gap-3">
                <div className="spinner" />
                <span className="text-white/60">Loading results…</span>
              </GlassCard>
            ) : results.length === 0 ? (
              <GlassCard className="p-12 flex flex-col items-center gap-3">
                <MdEditNote className="w-12 h-12 text-white/20" />
                <p className="text-white/50 text-lg">No results entered yet</p>
                <Button variant="primary" size="sm" onClick={openEnterResults}>
                  <MdEditNote className="mr-1 inline" /> Enter Results
                </Button>
              </GlassCard>
            ) : (
              <GlassCard className="p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5">
                        <th className="text-left py-3 px-4 text-white/60 font-medium">Student</th>
                        <th className="text-left py-3 px-4 text-white/60 font-medium">Adm#</th>
                        <th className="text-center py-3 px-4 text-white/60 font-medium">Marks</th>
                        <th className="text-center py-3 px-4 text-white/60 font-medium">Total</th>
                        <th className="text-center py-3 px-4 text-white/60 font-medium">%</th>
                        <th className="text-center py-3 px-4 text-white/60 font-medium">Grade</th>
                        <th className="text-center py-3 px-4 text-white/60 font-medium">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => {
                        const pct = selectedExam
                          ? ((r.marks_obtained / selectedExam.total_marks) * 100).toFixed(1)
                          : '—';
                        const passed = r.marks_obtained >= (selectedExam?.pass_marks || 0);
                        return (
                          <tr key={r.id} className="border-b border-white/5 hover:bg-white/5 transition">
                            <td className="py-3 px-4 text-white">
                              {r.students?.first_name} {r.students?.last_name}
                            </td>
                            <td className="py-3 px-4 text-white/70">{r.students?.admission_no}</td>
                            <td className="py-3 px-4 text-center text-white font-medium">{r.marks_obtained}</td>
                            <td className="py-3 px-4 text-center text-white/50">{selectedExam?.total_marks}</td>
                            <td className="py-3 px-4 text-center text-white/80">{pct}%</td>
                            <td className="py-3 px-4 text-center font-bold text-cyan-400">{r.grade}</td>
                            <td className="py-3 px-4 text-center">
                              <span className={`badge text-xs ${
                                passed
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-red-500/20 text-red-300 border border-red-500/30'
                              }`}>
                                {passed ? 'Pass' : 'Fail'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            )}
          </>
        )}
      </div>

      {/* ── Create Exam Modal ──────────────────────────────────────────────── */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create New Exam">
        <div className="space-y-1">
          <Input
            label="Exam Title"
            required
            value={examForm.title}
            onChange={(e) => setExamForm({ ...examForm, title: e.target.value })}
            placeholder="e.g. Unit Test 1 – Mathematics"
          />
          <Input
            label="Subject"
            required
            value={examForm.subject}
            onChange={(e) => setExamForm({ ...examForm, subject: e.target.value })}
            placeholder="e.g. Mathematics"
          />
          <Input
            label="Class"
            required
            value={examForm.class_name}
            onChange={(e) => setExamForm({ ...examForm, class_name: e.target.value })}
            placeholder="e.g. Class 10"
          />
          <Input
            label="Exam Date"
            type="date"
            required
            value={examForm.exam_date}
            onChange={(e) => setExamForm({ ...examForm, exam_date: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Total Marks"
              type="number"
              required
              value={examForm.total_marks}
              onChange={(e) => setExamForm({ ...examForm, total_marks: e.target.value })}
              placeholder="100"
            />
            <Input
              label="Pass Marks"
              type="number"
              required
              value={examForm.pass_marks}
              onChange={(e) => setExamForm({ ...examForm, pass_marks: e.target.value })}
              placeholder="35"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="primary" className="flex-1" loading={savingExam} onClick={handleCreateExam}>
              Create Exam
            </Button>
            <Button variant="secondary" onClick={() => setCreateModal(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* ── Update Status Modal ────────────────────────────────────────────── */}
      <Modal open={!!statusModal} onClose={() => setStatusModal(null)} title="Update Exam Status">
        {statusModal && (
          <div className="space-y-4">
            <p className="text-white/70 text-sm">
              Exam: <span className="text-white font-medium">{statusModal.title}</span>
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">New Status</label>
              <select
                className="input-glass"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
              >
                <option value="upcoming">Upcoming</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div className="flex gap-3">
              <Button variant="primary" className="flex-1" loading={savingStatus} onClick={handleUpdateStatus}>
                Update Status
              </Button>
              <Button variant="secondary" onClick={() => setStatusModal(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Enter Results Modal ────────────────────────────────────────────── */}
      <Modal open={enterModal} onClose={() => setEnterModal(false)} title="Enter Exam Results" wide>
        {selectedExam && (
          <div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 mb-4 text-sm text-white/70">
              <span className="text-white font-medium">{selectedExam.title}</span>
              {' · '}{selectedExam.subject} · {selectedExam.class_name}
              {' · '}Total marks: <span className="text-white">{selectedExam.total_marks}</span>
              {' · '}Pass marks: <span className="text-white">{selectedExam.pass_marks}</span>
            </div>

            {classStudents.length === 0 ? (
              <p className="text-white/50 text-center py-6">
                No students found for class "{selectedExam.class_name}"
              </p>
            ) : (
              <>
                <div className="overflow-y-auto" style={{ maxHeight: 380 }}>
                  <table className="w-full text-sm">
                    <thead className="sticky top-0">
                      <tr className="bg-slate-900/80 border-b border-white/10">
                        <th className="text-left py-2 px-4 text-white/60 font-medium">Student</th>
                        <th className="text-left py-2 px-4 text-white/60 font-medium">Adm#</th>
                        <th className="text-center py-2 px-4 text-white/60 font-medium">
                          Marks (/ {selectedExam.total_marks})
                        </th>
                        <th className="text-center py-2 px-4 text-white/60 font-medium">Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classStudents.map((s) => {
                        const marks = parseInt(marksInput[s.id]) || 0;
                        const grade = marksInput[s.id] !== '' ? calcGrade(marks, selectedExam.total_marks) : '—';
                        return (
                          <tr key={s.id} className="border-b border-white/5">
                            <td className="py-2 px-4 text-white">{s.first_name} {s.last_name}</td>
                            <td className="py-2 px-4 text-white/60">{s.admission_no}</td>
                            <td className="py-2 px-4 text-center">
                              <input
                                type="number"
                                min={0}
                                max={selectedExam.total_marks}
                                className="input-glass py-1 text-center text-sm"
                                style={{ width: 90 }}
                                placeholder="—"
                                value={marksInput[s.id] ?? ''}
                                onChange={(e) =>
                                  setMarksInput({ ...marksInput, [s.id]: e.target.value })
                                }
                              />
                            </td>
                            <td className="py-2 px-4 text-center font-bold text-cyan-400">{grade}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-3 mt-5">
                  <Button
                    variant="primary"
                    className="flex-1"
                    loading={savingResults}
                    onClick={handleSaveResults}
                  >
                    Save All Results
                  </Button>
                  <Button variant="secondary" onClick={() => setEnterModal(false)}>Cancel</Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </MainLayout>
  );
}
