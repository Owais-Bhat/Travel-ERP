import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdAdd, MdClose, MdDelete, MdVisibility } from 'react-icons/md';

const AUTHOR_ROLES = ['super_admin', 'admin', 'institution_admin', 'principal', 'staff'];
const TARGET_ROLES = ['all', 'student', 'parent', 'teacher', 'staff'];
const EMPTY_QUESTION = { question_text: '', question_type: 'text' };
const EMPTY_FORM = { title: '', description: '', target_role: 'all', questions: [{ ...EMPTY_QUESTION }] };

export default function SurveysPage() {
  const { profile } = useAuth();
  const notification = useNotification();
  const isAuthor = AUTHOR_ROLES.includes(profile?.role);

  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showBuilder, setShowBuilder] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [answering, setAnswering] = useState(null);
  const [answerQuestions, setAnswerQuestions] = useState([]);
  const [answerValues, setAnswerValues] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const [viewingResponses, setViewingResponses] = useState(null);
  const [responses, setResponses] = useState([]);

  const loadSurveys = async () => {
    if (!profile?.institution_id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/surveys');
      setSurveys(data || []);
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to load surveys';
      setError(message);
      notification.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (profile) loadSurveys(); }, [profile]);

  const updateQuestion = (i, patch) => setForm(f => ({ ...f, questions: f.questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)) }));
  const addQuestion = () => setForm(f => ({ ...f, questions: [...f.questions, { ...EMPTY_QUESTION }] }));
  const removeQuestion = (i) => setForm(f => ({ ...f, questions: f.questions.filter((_, idx) => idx !== i) }));

  const handleCreate = async () => {
    if (!form.title.trim()) { notification.error('Title is required'); return; }
    if (form.questions.some(q => !q.question_text.trim())) { notification.error('Every question needs text'); return; }
    setSaving(true);
    try {
      await api.post('/surveys', form);
      notification.success('Survey published!');
      setShowBuilder(false);
      setForm(EMPTY_FORM);
      loadSurveys();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to create survey');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async (survey) => {
    try {
      await api.patch(`/surveys/${survey.id}/close`);
      notification.success('Survey closed');
      loadSurveys();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to close');
    }
  };

  const handleDelete = async (survey) => {
    if (!window.confirm(`Delete "${survey.title}"?`)) return;
    try {
      await api.delete(`/surveys/${survey.id}`);
      setSurveys(prev => prev.filter(s => s.id !== survey.id));
      notification.success('Deleted');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const openAnswer = async (survey) => {
    try {
      const { data } = await api.get(`/surveys/${survey.id}`);
      setAnswering(survey);
      setAnswerQuestions(data.questions);
      setAnswerValues(new Array(data.questions.length).fill(''));
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load survey');
    }
  };

  const handleSubmitAnswer = async () => {
    if (answerValues.some(v => !String(v).trim())) { notification.error('Answer every question'); return; }
    setSubmitting(true);
    try {
      await api.post(`/surveys/${answering.id}/respond`, { answers: answerValues });
      notification.success('Response submitted!');
      setAnswering(null);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  };

  const openResponses = async (survey) => {
    try {
      const { data } = await api.get(`/surveys/${survey.id}/responses`);
      setViewingResponses(survey);
      setResponses(data);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load responses');
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">Feedback & Surveys</h1>
          {isAuthor && (
            <Button variant="primary" onClick={() => { setForm(EMPTY_FORM); setShowBuilder(true); }}>
              <MdAdd className="inline mr-1" /> New Survey
            </Button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-white/50">Loading...</div>
        ) : error ? (
          <GlassCard className="p-10 text-center">
            <p className="text-red-400 mb-3">{error}</p>
            <Button variant="secondary" onClick={loadSurveys}>Retry</Button>
          </GlassCard>
        ) : surveys.length === 0 ? (
          <GlassCard className="p-10 text-center text-white/40">No surveys yet.</GlassCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {surveys.map(s => (
              <GlassCard key={s.id} className="p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-white font-bold">{s.title}</h3>
                  {isAuthor && (
                    <button onClick={() => handleDelete(s)} className="text-red-400/60 hover:text-red-400 transition">
                      <MdDelete className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {s.description && <p className="text-white/50 text-sm mb-2 line-clamp-2">{s.description}</p>}
                <p className="text-white/40 text-xs mb-3">Target: {s.target_role}</p>
                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                  <span className={`px-2 py-0.5 text-[10px] rounded border font-medium capitalize ${s.status === 'open' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-white/10 text-white/40 border-white/20'}`}>{s.status}</span>
                  {isAuthor ? (
                    <div className="flex items-center gap-2">
                      <button onClick={() => openResponses(s)} className="text-blue-400 hover:text-blue-300 text-xs font-semibold inline-flex items-center gap-1">
                        <MdVisibility className="w-4 h-4" /> {s.response_count ?? 0}
                      </button>
                      {s.status === 'open' && <Button variant="secondary" onClick={() => handleClose(s)}>Close</Button>}
                    </div>
                  ) : (
                    s.status === 'open' && <Button variant="primary" onClick={() => openAnswer(s)}>Respond</Button>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        {showBuilder && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">New Survey</h3>
                <button onClick={() => setShowBuilder(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <Input label="Title" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              <label className="block text-white/60 text-sm mb-1.5">Description</label>
              <textarea className="input-glass w-full mb-3" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <label className="block text-white/60 text-sm mb-1.5">Target Audience</label>
              <select className="input-glass w-full mb-3" value={form.target_role} onChange={e => setForm(f => ({ ...f, target_role: e.target.value }))}>
                {TARGET_ROLES.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
              </select>

              <div className="space-y-3">
                {form.questions.map((q, qi) => (
                  <div key={qi} className="bg-white/5 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-white/70 text-sm font-semibold">Question {qi + 1}</p>
                      {form.questions.length > 1 && (
                        <button onClick={() => removeQuestion(qi)} className="text-red-400/60 hover:text-red-400"><MdDelete className="w-4 h-4" /></button>
                      )}
                    </div>
                    <input className="input-glass w-full mb-2" placeholder="Question text" value={q.question_text} onChange={e => updateQuestion(qi, { question_text: e.target.value })} />
                    <select className="input-glass w-full" value={q.question_type} onChange={e => updateQuestion(qi, { question_type: e.target.value })}>
                      <option value="text">Text Answer</option>
                      <option value="rating">Rating (1-5)</option>
                    </select>
                  </div>
                ))}
              </div>
              <button onClick={addQuestion} className="text-blue-400 text-sm mt-3">+ Add Question</button>

              <div className="flex gap-2 pt-4">
                <Button variant="primary" loading={saving} onClick={handleCreate}>Publish Survey</Button>
                <Button variant="secondary" onClick={() => setShowBuilder(false)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}

        {answering && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">{answering.title}</h3>
                <button onClick={() => setAnswering(null)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-3">
                {answerQuestions.map((q, qi) => (
                  <div key={q.id}>
                    <label className="block text-white/70 text-sm mb-1.5">{qi + 1}. {q.question_text}</label>
                    {q.question_type === 'rating' ? (
                      <select className="input-glass w-full" value={answerValues[qi]} onChange={e => setAnswerValues(a => a.map((v, i) => (i === qi ? e.target.value : v)))}>
                        <option value="">-- Select --</option>
                        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    ) : (
                      <textarea className="input-glass w-full" rows={2} value={answerValues[qi]} onChange={e => setAnswerValues(a => a.map((v, i) => (i === qi ? e.target.value : v)))} />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-4">
                <Button variant="primary" loading={submitting} onClick={handleSubmitAnswer}>Submit</Button>
                <Button variant="secondary" onClick={() => setAnswering(null)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}

        {viewingResponses && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Responses — {viewingResponses.title}</h3>
                <button onClick={() => setViewingResponses(null)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              {responses.length === 0 ? (
                <p className="text-white/40 text-center py-6">No responses yet.</p>
              ) : (
                <div className="space-y-3">
                  {responses.map(r => (
                    <div key={r.id} className="bg-white/5 rounded-lg p-3">
                      <p className="text-white font-semibold text-sm mb-1">{r.first_name} {r.last_name} <span className="text-white/40 text-xs capitalize">({r.role})</span></p>
                      <ul className="text-white/60 text-sm space-y-0.5">
                        {r.answers.map((a, i) => <li key={i}>• {a}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>,
          document.body
        )}
      </div>
    </MainLayout>
  );
}
