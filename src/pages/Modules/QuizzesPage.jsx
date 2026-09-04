import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdAdd, MdClose, MdDelete, MdPlayArrow, MdSearch } from 'react-icons/md';

const AUTHOR_ROLES = ['super_admin', 'admin', 'institution_admin', 'principal', 'teacher'];
const EMPTY_QUESTION = { question_text: '', options: ['', ''], correct_index: 0, points: 1 };
const EMPTY_FORM = { title: '', subject: '', class_name: '', time_limit_minutes: 30, questions: [{ ...EMPTY_QUESTION }] };

export default function QuizzesPage() {
  const { profile } = useAuth();
  const notification = useNotification();
  const isAuthor = AUTHOR_ROLES.includes(profile?.role);

  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showBuilder, setShowBuilder] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [takingQuiz, setTakingQuiz] = useState(null);
  const [takingQuestions, setTakingQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const loadQuizzes = async () => {
    if (!profile?.institution_id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/quizzes');
      setQuizzes(data || []);
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to load quizzes';
      setError(message);
      notification.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (profile) loadQuizzes(); }, [profile]);

  const updateQuestion = (i, patch) => {
    setForm(f => ({ ...f, questions: f.questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)) }));
  };
  const updateOption = (qi, oi, value) => {
    setForm(f => ({
      ...f,
      questions: f.questions.map((q, idx) => (idx === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? value : o)) } : q)),
    }));
  };
  const addOption = (qi) => updateQuestion(qi, { options: [...form.questions[qi].options, ''] });
  const addQuestion = () => setForm(f => ({ ...f, questions: [...f.questions, { ...EMPTY_QUESTION, options: ['', ''] }] }));
  const removeQuestion = (i) => setForm(f => ({ ...f, questions: f.questions.filter((_, idx) => idx !== i) }));

  const handleCreate = async () => {
    if (!form.title.trim()) { notification.error('Title is required'); return; }
    for (const q of form.questions) {
      if (!q.question_text.trim() || q.options.some(o => !o.trim())) {
        notification.error('Every question needs text and filled options'); return;
      }
    }
    setSaving(true);
    try {
      await api.post('/quizzes', form);
      notification.success('Quiz created as draft!');
      setShowBuilder(false);
      setForm(EMPTY_FORM);
      loadQuizzes();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to create quiz');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (quiz) => {
    try {
      await api.patch(`/quizzes/${quiz.id}/publish`);
      notification.success('Published!');
      loadQuizzes();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to publish');
    }
  };

  const handleDelete = async (quiz) => {
    if (!window.confirm(`Delete "${quiz.title}"?`)) return;
    try {
      await api.delete(`/quizzes/${quiz.id}`);
      setQuizzes(prev => prev.filter(q => q.id !== quiz.id));
      notification.success('Deleted');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const openTake = async (quiz) => {
    try {
      const { data } = await api.get(`/quizzes/${quiz.id}`);
      setTakingQuiz(quiz);
      setTakingQuestions(data.questions);
      setAnswers(new Array(data.questions.length).fill(null));
      setSelectedStudent(null);
      setStudentSearch('');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load quiz');
    }
  };

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

  const handleSubmitAttempt = async () => {
    if (!selectedStudent) { notification.error('Select the student taking this quiz'); return; }
    if (answers.some(a => a === null)) { notification.error('Answer every question'); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post(`/quizzes/${takingQuiz.id}/attempt`, { student_id: selectedStudent.id, answers });
      notification.success(`Submitted! Score: ${data.score}/${data.max_score}`);
      setTakingQuiz(null);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to submit attempt');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">Online Quiz / Test Module</h1>
          {isAuthor && (
            <Button variant="primary" onClick={() => { setForm(EMPTY_FORM); setShowBuilder(true); }}>
              <MdAdd className="inline mr-1" /> Create Quiz
            </Button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-white/50">Loading...</div>
        ) : error ? (
          <GlassCard className="p-10 text-center">
            <p className="text-red-400 mb-3">{error}</p>
            <Button variant="secondary" onClick={loadQuizzes}>Retry</Button>
          </GlassCard>
        ) : quizzes.length === 0 ? (
          <GlassCard className="p-10 text-center text-white/40">No quizzes yet.</GlassCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {quizzes.map(q => (
              <GlassCard key={q.id} className="p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-white font-bold">{q.title}</h3>
                  {isAuthor && (
                    <button onClick={() => handleDelete(q)} className="text-red-400/60 hover:text-red-400 transition">
                      <MdDelete className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-white/50 text-sm mb-1">{q.subject || 'General'}{q.class_name ? ` · Class ${q.class_name}` : ''}</p>
                <p className="text-white/40 text-xs mb-3">{q.question_count} question(s) · {q.time_limit_minutes} min</p>
                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                  <span className={`px-2 py-0.5 text-[10px] rounded border font-medium capitalize ${q.status === 'published' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-white/10 text-white/40 border-white/20'}`}>{q.status}</span>
                  {isAuthor && q.status === 'draft' && (
                    <Button variant="secondary" onClick={() => handlePublish(q)}>Publish</Button>
                  )}
                  {q.status === 'published' && (
                    <button onClick={() => openTake(q)} className="text-blue-400 hover:text-blue-300 text-xs font-semibold inline-flex items-center gap-1">
                      <MdPlayArrow className="w-4 h-4" /> Take Quiz
                    </button>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        {showBuilder && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Create Quiz</h3>
                <button onClick={() => setShowBuilder(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <Input label="Title" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              <div className="grid grid-cols-3 gap-3">
                <Input label="Subject" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
                <Input label="Class" value={form.class_name} onChange={e => setForm(f => ({ ...f, class_name: e.target.value }))} />
                <Input label="Time Limit (min)" type="number" value={form.time_limit_minutes} onChange={e => setForm(f => ({ ...f, time_limit_minutes: e.target.value }))} />
              </div>

              <div className="space-y-4 mt-3">
                {form.questions.map((q, qi) => (
                  <div key={qi} className="bg-white/5 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-white/70 text-sm font-semibold">Question {qi + 1}</p>
                      {form.questions.length > 1 && (
                        <button onClick={() => removeQuestion(qi)} className="text-red-400/60 hover:text-red-400"><MdDelete className="w-4 h-4" /></button>
                      )}
                    </div>
                    <input className="input-glass w-full mb-2" placeholder="Question text" value={q.question_text} onChange={e => updateQuestion(qi, { question_text: e.target.value })} />
                    <div className="space-y-1.5 mb-2">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <input type="radio" checked={q.correct_index === oi} onChange={() => updateQuestion(qi, { correct_index: oi })} />
                          <input className="input-glass flex-1" placeholder={`Option ${oi + 1}`} value={opt} onChange={e => updateOption(qi, oi, e.target.value)} />
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => addOption(qi)} className="text-blue-400 text-xs">+ Add Option</button>
                      <div className="flex items-center gap-1.5">
                        <span className="text-white/40 text-xs">Points:</span>
                        <input type="number" min="1" className="input-glass w-16 text-xs py-1" value={q.points} onChange={e => updateQuestion(qi, { points: e.target.value })} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={addQuestion} className="text-blue-400 text-sm mt-3">+ Add Question</button>

              <div className="flex gap-2 pt-4">
                <Button variant="primary" loading={saving} onClick={handleCreate}>Create Quiz (Draft)</Button>
                <Button variant="secondary" onClick={() => setShowBuilder(false)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}

        {takingQuiz && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">{takingQuiz.title}</h3>
                <button onClick={() => setTakingQuiz(null)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>

              {!selectedStudent ? (
                <div className="relative mb-4">
                  <MdSearch className="absolute left-3 top-3 w-4 h-4 text-white/40" />
                  <input className="input-glass w-full pl-9" placeholder="Search student taking this quiz..." value={studentSearch} onChange={e => searchStudents(e.target.value)} />
                  {studentResults.length > 0 && (
                    <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                      {studentResults.map(s => (
                        <button key={s.id} onClick={() => { setSelectedStudent(s); setStudentResults([]); }} className="w-full text-left px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-white/80 transition">
                          {s.first_name} {s.last_name} · Class {s.class_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between bg-white/5 rounded-lg p-3 mb-4">
                    <p className="text-white text-sm font-semibold">{selectedStudent.first_name} {selectedStudent.last_name}</p>
                    <button onClick={() => setSelectedStudent(null)} className="text-white/40 hover:text-white/70 text-xs">Change</button>
                  </div>
                  <div className="space-y-4">
                    {takingQuestions.map((q, qi) => (
                      <div key={q.id} className="bg-white/5 rounded-lg p-3">
                        <p className="text-white/80 text-sm font-semibold mb-2">{qi + 1}. {q.question_text}</p>
                        <div className="space-y-1.5">
                          {q.options.map((opt, oi) => (
                            <label key={oi} className="flex items-center gap-2 text-white/70 text-sm">
                              <input type="radio" checked={answers[qi] === oi} onChange={() => setAnswers(a => a.map((v, i) => (i === qi ? oi : v)))} />
                              {opt}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button variant="primary" loading={submitting} onClick={handleSubmitAttempt}>Submit</Button>
                    <Button variant="secondary" onClick={() => setTakingQuiz(null)}>Cancel</Button>
                  </div>
                </>
              )}
            </GlassCard>
          </div>,
          document.body
        )}
      </div>
    </MainLayout>
  );
}
