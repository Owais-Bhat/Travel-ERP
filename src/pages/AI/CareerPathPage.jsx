import { useState } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useNotification } from '../../hooks/useNotification';
import { recommendCareerPath } from '../../lib/openrouter';
import { MdTrendingUp, MdAutoAwesome, MdArrowForward, MdArrowBack, MdPrint, MdSchool, MdStar } from 'react-icons/md';

const STRENGTHS_OPTIONS = [
  'Mathematics', 'Science', 'Language', 'Art', 'Sports',
  'Leadership', 'Technology', 'Business',
];

const INTERESTS_OPTIONS = [
  'Engineering', 'Medicine', 'Commerce', 'Law', 'Arts',
  'Sports', 'Teaching', 'Entrepreneurship',
];

const SUBJECT_FIELDS = ['Physics', 'Chemistry', 'Biology', 'Math', 'English'];

const STREAMS = ['Science (PCM)', 'Science (PCB)', 'Commerce', 'Arts/Humanities', 'Undecided'];

const PERSONALITY_TYPES = [
  'Analytical / Logical', 'Creative / Artistic', 'Social / Communicative',
  'Practical / Hands-on', 'Leadership / Ambitious',
];

export default function CareerPathPage() {
  const notification = useNotification();
  const [step, setStep] = useState(1);
  const TOTAL_STEPS = 4;

  // Form data
  const [basicInfo, setBasicInfo] = useState({ name: '', className: '', streamPreference: 'Undecided' });
  const [strengths, setStrengths] = useState([]);
  const [interests, setInterests] = useState([]);
  const [scores, setScores] = useState({ Physics: '', Chemistry: '', Biology: '', Math: '', English: '' });
  const [personalityType, setPersonalityType] = useState('Analytical / Logical');

  // Result state
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [rawResult, setRawResult] = useState('');
  const [error, setError] = useState('');

  const toggleChip = (setter, value) => {
    setter(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  };

  const handleGenerate = async () => {
    if (!basicInfo.name.trim()) { notification.error('Please enter student name'); return; }
    if (strengths.length === 0) { notification.error('Please select at least one strength'); return; }
    if (interests.length === 0) { notification.error('Please select at least one interest'); return; }

    setLoading(true);
    setError('');
    setResult(null);

    const aptitudeScores = {};
    SUBJECT_FIELDS.forEach(subject => {
      if (scores[subject]) aptitudeScores[subject] = `${scores[subject]}%`;
    });

    const studentProfile = {
      strengths,
      weaknesses: STRENGTHS_OPTIONS.filter(s => !strengths.includes(s)),
      interests,
      aptitudeScores,
      academicPerformance: basicInfo.streamPreference,
      personalityType,
    };

    const response = await recommendCareerPath(studentProfile);

    if (response.success === false) {
      setError(response.error || 'Failed to generate career recommendation');
      notification.error('AI analysis failed');
    } else {
      setRawResult(response.data);
      try {
        // Try to extract JSON from markdown code block or raw JSON
        const jsonMatch = response.data.match(/```json\s*([\s\S]*?)```/) ||
                          response.data.match(/```\s*([\s\S]*?)```/) ||
                          [null, response.data];
        const parsed = JSON.parse(jsonMatch[1].trim());
        setResult(parsed);
      } catch {
        setResult(null); // will show raw
      }
      notification.success('Career path analysis complete!');
      setStep(TOTAL_STEPS + 1); // show results
    }
    setLoading(false);
  };

  const StepIndicator = () => (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(s => (
        <div key={s} className="flex items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition ${
            s < step ? 'bg-emerald-500/30 text-emerald-300' :
            s === step ? 'bg-neon-cyan/30 text-neon-cyan ring-2 ring-neon-cyan/50' :
            'bg-white/5 text-white/30'
          }`}>{s}</div>
          {s < TOTAL_STEPS && <div className={`w-8 h-0.5 ${s < step ? 'bg-emerald-500/40' : 'bg-white/10'}`} />}
        </div>
      ))}
      <span className="ml-2 text-white/50 text-sm">
        {step === 1 ? 'Basic Info' : step === 2 ? 'Strengths' : step === 3 ? 'Interests' : 'Scores'}
      </span>
    </div>
  );

  const showResults = step > TOTAL_STEPS;

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <MdTrendingUp className="w-8 h-8 text-neon-cyan" />
          <h1 className="text-3xl font-bold text-white">AI Career Path Recommendation</h1>
        </div>

        {!showResults ? (
          <GlassCard className="p-6 max-w-2xl mx-auto">
            <StepIndicator />

            {/* Step 1: Basic Info */}
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-white mb-4">Step 1: Basic Information</h2>
                <Input
                  label="Student Name" required
                  value={basicInfo.name}
                  onChange={e => setBasicInfo(f => ({ ...f, name: e.target.value }))}
                  placeholder="Full name"
                />
                <Input
                  label="Class / Grade"
                  value={basicInfo.className}
                  onChange={e => setBasicInfo(f => ({ ...f, className: e.target.value }))}
                  placeholder="e.g. Class 10"
                />
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Stream Preference</label>
                  <select
                    className="input-glass w-full"
                    value={basicInfo.streamPreference}
                    onChange={e => setBasicInfo(f => ({ ...f, streamPreference: e.target.value }))}
                  >
                    {STREAMS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Personality Type</label>
                  <select
                    className="input-glass w-full"
                    value={personalityType}
                    onChange={e => setPersonalityType(e.target.value)}
                  >
                    {PERSONALITY_TYPES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Step 2: Strengths */}
            {step === 2 && (
              <div>
                <h2 className="text-lg font-bold text-white mb-2">Step 2: Strengths</h2>
                <p className="text-white/50 text-sm mb-4">Select all that apply</p>
                <div className="flex flex-wrap gap-2">
                  {STRENGTHS_OPTIONS.map(item => (
                    <button
                      key={item}
                      onClick={() => toggleChip(setStrengths, item)}
                      className={`px-3 py-2 rounded-full text-sm font-medium transition ${
                        strengths.includes(item)
                          ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50'
                          : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                {strengths.length > 0 && (
                  <p className="mt-3 text-white/40 text-xs">Selected: {strengths.join(', ')}</p>
                )}
              </div>
            )}

            {/* Step 3: Interests */}
            {step === 3 && (
              <div>
                <h2 className="text-lg font-bold text-white mb-2">Step 3: Career Interests</h2>
                <p className="text-white/50 text-sm mb-4">Select fields you are interested in</p>
                <div className="flex flex-wrap gap-2">
                  {INTERESTS_OPTIONS.map(item => (
                    <button
                      key={item}
                      onClick={() => toggleChip(setInterests, item)}
                      className={`px-3 py-2 rounded-full text-sm font-medium transition ${
                        interests.includes(item)
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50'
                          : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                {interests.length > 0 && (
                  <p className="mt-3 text-white/40 text-xs">Selected: {interests.join(', ')}</p>
                )}
              </div>
            )}

            {/* Step 4: Academic Scores */}
            {step === 4 && (
              <div>
                <h2 className="text-lg font-bold text-white mb-2">Step 4: Academic Scores</h2>
                <p className="text-white/50 text-sm mb-4">Enter percentage scores (leave blank if not applicable)</p>
                <div className="grid grid-cols-2 gap-3">
                  {SUBJECT_FIELDS.map(subject => (
                    <Input
                      key={subject}
                      label={subject}
                      type="number"
                      min="0" max="100"
                      value={scores[subject]}
                      onChange={e => setScores(s => ({ ...s, [subject]: e.target.value }))}
                      placeholder="0-100"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between mt-6 pt-4 border-t border-white/10">
              <Button
                variant="secondary"
                onClick={() => setStep(s => s - 1)}
                disabled={step === 1}
              >
                <MdArrowBack className="inline mr-1" /> Back
              </Button>
              {step < TOTAL_STEPS ? (
                <Button variant="primary" onClick={() => setStep(s => s + 1)}>
                  Next <MdArrowForward className="inline ml-1" />
                </Button>
              ) : (
                <Button variant="primary" loading={loading} onClick={handleGenerate}>
                  <MdAutoAwesome className="inline mr-1" /> Generate Career Path
                </Button>
              )}
            </div>
          </GlassCard>
        ) : (
          /* Results */
          <div className="space-y-5">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">
                Career Analysis for {basicInfo.name}
              </h2>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => { setStep(1); setResult(null); }}>
                  New Analysis
                </Button>
                <Button variant="secondary" size="sm" onClick={() => window.print()}>
                  <MdPrint className="inline mr-1" /> Print
                </Button>
              </div>
            </div>

            {error && (
              <GlassCard className="p-5 border border-red-500/30">
                <p className="text-red-400">{error}</p>
              </GlassCard>
            )}

            {result ? (
              <>
                {/* Recommended Streams */}
                {(result.recommendedStreams || result.recommended_streams || result['Recommended Streams']) && (
                  <GlassCard className="p-5">
                    <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                      <MdSchool className="text-neon-cyan" /> Recommended Streams
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {(result.recommendedStreams || result.recommended_streams || result['Recommended Streams'] || []).map((stream, i) => (
                        <span key={i} className="px-3 py-1.5 bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30 rounded-full text-sm font-medium">
                          {typeof stream === 'object' ? stream.stream || stream.name || JSON.stringify(stream) : stream}
                        </span>
                      ))}
                    </div>
                  </GlassCard>
                )}

                {/* Top Career Paths */}
                {(result.careerPaths || result.career_paths || result['Top 5 Career Paths'] || result.topCareerPaths) && (
                  <GlassCard className="p-5">
                    <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                      <MdTrendingUp className="text-neon-cyan" /> Top Career Paths
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {(result.careerPaths || result.career_paths || result['Top 5 Career Paths'] || result.topCareerPaths || []).map((path, i) => (
                        <div key={i} className="p-4 bg-white/5 rounded-xl border border-white/10">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h4 className="text-white font-semibold text-sm">
                              {typeof path === 'object' ? path.career || path.name || path.title || `Career ${i+1}` : path}
                            </h4>
                            <span className="px-2 py-0.5 text-xs bg-neon-cyan/10 text-neon-cyan rounded font-medium shrink-0">
                              #{i + 1}
                            </span>
                          </div>
                          {typeof path === 'object' && (path.description || path.reason || path.details) && (
                            <p className="text-white/55 text-xs leading-relaxed">
                              {path.description || path.reason || path.details}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                )}

                {/* Colleges */}
                {(result.colleges || result.collegesToTarget || result['Colleges to Target']) && (
                  <GlassCard className="p-5">
                    <h3 className="text-white font-bold mb-3">Colleges to Target</h3>
                    <div className="flex flex-wrap gap-2">
                      {(result.colleges || result.collegesToTarget || result['Colleges to Target'] || []).map((college, i) => (
                        <span key={i} className="px-3 py-1.5 bg-blue-500/15 text-blue-300 border border-blue-500/20 rounded-lg text-sm">
                          {typeof college === 'object' ? college.name || JSON.stringify(college) : college}
                        </span>
                      ))}
                    </div>
                  </GlassCard>
                )}

                {/* Entrance Exams */}
                {(result.entranceExams || result.entrance_exams || result['Entrance Exams']) && (
                  <GlassCard className="p-5">
                    <h3 className="text-white font-bold mb-3">Entrance Exams to Prepare</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {(result.entranceExams || result.entrance_exams || result['Entrance Exams'] || []).map((exam, i) => (
                        <div key={i} className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg text-sm text-orange-300">
                          {typeof exam === 'object' ? exam.exam || exam.name || JSON.stringify(exam) : exam}
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                )}

                {/* Study Plan / Skill Development */}
                {(result.studyPlan || result.study_plan || result.skillDevelopment || result['Skill Development Plan'] || result['Study Plan']) && (
                  <GlassCard className="p-5">
                    <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                      <MdStar className="text-amber-400" /> Study Plan & Skill Development
                    </h3>
                    <ul className="space-y-2">
                      {(
                        result.studyPlan || result.study_plan ||
                        result.skillDevelopment || result['Skill Development Plan'] ||
                        result['Study Plan'] || []
                      ).map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-white/75">
                          <span className="text-amber-400 mt-0.5 shrink-0">•</span>
                          <span>{typeof item === 'object' ? item.step || item.skill || JSON.stringify(item) : item}</span>
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                )}
              </>
            ) : rawResult ? (
              /* Fallback: raw text if JSON parse failed */
              <GlassCard className="p-5">
                <h3 className="text-white font-bold mb-3">AI Analysis</h3>
                <pre className="text-white/75 text-sm leading-relaxed whitespace-pre-wrap font-sans">{rawResult}</pre>
              </GlassCard>
            ) : null}
          </div>
        )}

        {/* Loading overlay — portalled to <body>: MainLayout's ancestors set
            `perspective` and `will-change: transform` for the 3D shell,
            which gives fixed-position descendants a new containing block
            instead of the viewport, landing an in-place overlay off-screen. */}
        {loading && createPortal(
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center z-50">
            <div className="w-16 h-16 border-4 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin mb-4" />
            <p className="text-white text-lg font-medium">Analyzing career profile...</p>
            <p className="text-white/50 text-sm mt-1">This may take a few seconds</p>
          </div>,
          document.body
        )}
      </div>
    </MainLayout>
  );
}
