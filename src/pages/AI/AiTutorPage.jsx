import { useState, useEffect, useRef } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useNotification } from '../../hooks/useNotification';
import { callAI } from '../../lib/openrouter';
import { MdSend, MdAutoAwesome, MdSchool, MdDelete } from 'react-icons/md';

const SUBJECTS = [
  'Mathematics', 'Science', 'English', 'Social Studies',
  'Hindi', 'Computer Science', 'Physics', 'Chemistry', 'Biology',
];

const GRADE_LEVELS = Array.from({ length: 12 }, (_, i) => `Class ${i + 1}`);

const SUBJECT_TOPICS = {
  Mathematics: ['Algebra', 'Geometry', 'Trigonometry', 'Calculus', 'Statistics', 'Number Theory', 'Probability'],
  Science: ['Motion & Force', 'Light & Sound', 'Electricity', 'Matter', 'Living World', 'Chemical Reactions'],
  English: ['Grammar', 'Comprehension', 'Essay Writing', 'Poetry', 'Vocabulary', 'Letter Writing'],
  'Social Studies': ['History of India', 'Geography', 'Civics', 'Economics', 'World History'],
  Hindi: ['व्याकरण', 'रचना', 'पाठ', 'काव्य', 'निबंध'],
  'Computer Science': ['Algorithms', 'Data Structures', 'Programming', 'Databases', 'Networking', 'OOP'],
  Physics: ['Mechanics', 'Thermodynamics', 'Optics', 'Electrostatics', 'Modern Physics', 'Waves'],
  Chemistry: ['Atomic Structure', 'Bonding', 'Reactions', 'Organic Chemistry', 'Electrochemistry', 'Equilibrium'],
  Biology: ['Cell Biology', 'Genetics', 'Evolution', 'Ecology', 'Human Physiology', 'Plant Biology'],
};

// Render text with basic markdown-like formatting
function FormattedText({ text }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        // Numbered list: "1. item" or "1) item"
        if (/^\d+[\.\)]\s/.test(line)) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-neon-cyan font-medium shrink-0">{line.match(/^\d+/)[0]}.</span>
              <span>{line.replace(/^\d+[\.\)]\s/, '')}</span>
            </div>
          );
        }
        // Bullet list
        if (/^[-•*]\s/.test(line)) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-neon-cyan shrink-0">•</span>
              <span>{line.replace(/^[-•*]\s/, '')}</span>
            </div>
          );
        }
        // Bold headers: **text**
        if (/\*\*(.+?)\*\*/.test(line)) {
          const parts = line.split(/(\*\*[^*]+\*\*)/g);
          return (
            <p key={i}>
              {parts.map((part, j) =>
                /^\*\*[^*]+\*\*$/.test(part)
                  ? <strong key={j} className="text-white font-semibold">{part.replace(/\*\*/g, '')}</strong>
                  : part
              )}
            </p>
          );
        }
        // Empty line
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

export default function AiTutorPage() {
  const notification = useNotification();
  const [chatMessages, setChatMessages] = useState([
    { id: 1, role: 'assistant', text: 'Hello! I am your AI Tutor. Select a subject and grade level, then ask me anything. I can explain concepts, solve problems step by step, and guide you through the Indian school curriculum (CBSE/ICSE).' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState('Mathematics');
  const [gradeLevel, setGradeLevel] = useState('Class 10');
  const chatEndRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, loading]);

  const handleSend = async (overrideInput) => {
    const userText = (overrideInput || input).trim();
    if (!userText || loading) return;

    const userMsg = { id: Date.now(), role: 'user', text: userText };
    setChatMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Build message history for API (exclude the initial greeting)
    const history = [...chatMessages.filter(m => m.role !== 'assistant' || m.id !== 1), userMsg];
    const apiMessages = history.map(m => ({ role: m.role, content: m.text }));

    const systemPrompt = `You are an expert AI tutor for Indian school students. You are teaching ${subject} to a student in ${gradeLevel}. Explain concepts clearly with examples relevant to the Indian curriculum (CBSE/ICSE). Use simple language, provide step-by-step solutions, and encourage the student. When listing steps or points, use numbered lists. Keep explanations concise but complete.`;

    const result = await callAI(apiMessages, {
      systemPrompt,
      temperature: 0.7,
      maxTokens: 700,
    });

    if (result.success === false) {
      notification.error(`AI error: ${result.error || 'Failed to get response'}`);
      setChatMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        text: 'Sorry, I encountered an error. Please try again.',
        isError: true,
      }]);
    } else {
      setChatMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        text: result.data,
      }]);
    }

    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = () => {
    setChatMessages([{
      id: Date.now(),
      role: 'assistant',
      text: `Chat cleared. I am ready to help you with ${subject} for ${gradeLevel}. What would you like to learn?`,
    }]);
    setInput('');
  };

  const handleTopicClick = (topic) => {
    if (!loading) handleSend(`Explain ${topic} in ${subject} for ${gradeLevel} students`);
  };

  const topics = SUBJECT_TOPICS[subject] || [];

  return (
    <MainLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MdAutoAwesome className="w-8 h-8 text-neon-cyan" />
            <h1 className="text-3xl font-bold text-white">AI Tutor</h1>
          </div>
          <Button variant="secondary" size="sm" onClick={handleClearChat}>
            <MdDelete className="inline mr-1 w-4 h-4" /> Clear Chat
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 h-[calc(100vh-200px)] min-h-[500px]">
          {/* Chat area */}
          <div className="lg:col-span-3 flex flex-col">
            <GlassCard className="flex-1 flex flex-col p-0 overflow-hidden">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-blue to-neon-cyan flex items-center justify-center text-xs font-bold text-white mr-2 shrink-0 mt-0.5">
                        AI
                      </div>
                    )}
                    <div className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary-blue/40 text-white rounded-br-sm'
                        : msg.isError
                        ? 'bg-red-500/15 text-red-300 rounded-bl-sm border border-red-500/20'
                        : 'bg-white/8 text-white/90 rounded-bl-sm'
                    }`}>
                      {msg.role === 'assistant' ? (
                        <FormattedText text={msg.text} />
                      ) : (
                        msg.text
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-blue to-neon-cyan flex items-center justify-center text-xs font-bold text-white mr-2 shrink-0">
                      AI
                    </div>
                    <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-white/8 text-white/60 text-sm">
                      <span className="inline-flex gap-1">
                        <span className="animate-bounce [animation-delay:0ms]">.</span>
                        <span className="animate-bounce [animation-delay:150ms]">.</span>
                        <span className="animate-bounce [animation-delay:300ms]">.</span>
                      </span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input area */}
              <div className="border-t border-white/10 p-4 flex gap-2">
                <textarea
                  className="input-glass flex-1 resize-none min-h-[42px] max-h-28 py-2.5"
                  placeholder={`Ask about ${subject}...`}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  rows={1}
                />
                <Button
                  variant="primary"
                  onClick={() => handleSend()}
                  disabled={loading || !input.trim()}
                  className="self-end"
                >
                  <MdSend />
                </Button>
              </div>
            </GlassCard>
          </div>

          {/* Sidebar */}
          <div className="space-y-4 flex flex-col">
            <GlassCard className="p-4">
              <h3 className="text-white font-bold mb-3 flex items-center gap-2 text-sm">
                <MdSchool className="text-neon-cyan" /> Subject & Grade
              </h3>
              <div className="space-y-2">
                <select
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="input-glass w-full text-sm"
                  disabled={loading}
                >
                  {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                </select>
                <select
                  value={gradeLevel}
                  onChange={e => setGradeLevel(e.target.value)}
                  className="input-glass w-full text-sm"
                  disabled={loading}
                >
                  {GRADE_LEVELS.map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
            </GlassCard>

            <GlassCard className="p-4 flex-1 overflow-y-auto">
              <h3 className="text-white font-bold mb-3 text-sm">Quick Topics</h3>
              <div className="space-y-1.5">
                {topics.map(topic => (
                  <button
                    key={topic}
                    onClick={() => handleTopicClick(topic)}
                    disabled={loading}
                    className="w-full text-left px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-white/75 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
