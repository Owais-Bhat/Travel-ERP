import { useState, useEffect } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import { useAuth } from '../../hooks/useAuth';
import { useAppData } from '../../hooks/useAppData';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdSearch, MdPrint } from 'react-icons/md';

function qrUrl(data) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=110x110&margin=0&data=${encodeURIComponent(data)}`;
}

function IdCard({ institution, person, personType }) {
  const isStudent = personType === 'student';
  const qrPayload = isStudent
    ? `STUDENT:${person.admission_no || person.id}`
    : `STAFF:${person.employee_id || person.id}`;

  return (
    <div
      className="id-card w-[340px] h-[210px] rounded-2xl p-4 flex flex-col justify-between shrink-0"
      style={{ background: 'linear-gradient(145deg, #1b2333, #2a3550)', color: 'white' }}
    >
      <div className="flex items-center gap-2">
        {institution?.logo_url ? (
          <img src={institution.logo_url} alt="" className="w-8 h-8 rounded object-cover" onError={e => { e.target.style.display = 'none'; }} />
        ) : (
          <div className="w-8 h-8 rounded bg-white/20" />
        )}
        <div className="min-w-0">
          <p className="font-bold text-sm truncate mb-0">{institution?.name || 'CyberMilo Institution'}</p>
          <p className="text-[10px] text-white/50 uppercase tracking-wide mb-0">{isStudent ? 'Student ID' : 'Staff ID'}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {person.photo_url ? (
          <img src={person.photo_url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-white/10 flex items-center justify-center text-xl font-bold shrink-0">
            {person.first_name?.[0]}{person.last_name?.[0]}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-base truncate mb-0">{person.first_name} {person.last_name}</p>
          {isStudent ? (
            <>
              <p className="text-xs text-white/60 mb-0">Class {person.class_name}{person.section ? ` - ${person.section}` : ''}</p>
              <p className="text-xs text-white/50 mb-0">Adm# {person.admission_no || '—'}</p>
            </>
          ) : (
            <>
              <p className="text-xs text-white/60 mb-0">{person.qualification || 'Staff'}</p>
              <p className="text-xs text-white/50 mb-0">ID: {person.employee_id || '—'}</p>
            </>
          )}
        </div>
        <img src={qrUrl(qrPayload)} alt="QR" className="w-14 h-14 bg-white rounded p-1 shrink-0" />
      </div>
    </div>
  );
}

export default function IdCardsPage() {
  const { profile } = useAuth();
  const { institution } = useAppData();
  const notification = useNotification();

  const [personType, setPersonType] = useState('student');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]);

  const runSearch = async (val) => {
    setSearch(val);
    if (!val.trim() || val.length < 2) { setResults([]); return; }
    try {
      if (personType === 'student') {
        const { data } = await api.get('/students', { params: { search: val, pageSize: 10, page: 1 } });
        setResults(data?.data || []);
      } else {
        const { data } = await api.get('/teachers');
        const q = val.toLowerCase();
        setResults((data || []).filter(t => `${t.first_name} ${t.last_name}`.toLowerCase().includes(q)).slice(0, 10));
      }
    } catch {
      setResults([]);
    }
  };

  useEffect(() => { setResults([]); setSearch(''); }, [personType]);

  const addToSelection = (person) => {
    if (selected.some(p => p.id === person.id)) return;
    setSelected(prev => [...prev, { ...person, __type: personType }]);
  };

  const removeFromSelection = (id) => setSelected(prev => prev.filter(p => p.id !== id));

  const handlePrint = () => {
    if (selected.length === 0) { notification.error('Select at least one person'); return; }
    window.print();
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6 print:p-0">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #id-card-print-area, #id-card-print-area * { visibility: visible; }
            #id-card-print-area { position: absolute; top: 0; left: 0; display: flex; flex-wrap: wrap; gap: 12px; }
          }
        `}</style>

        <div className="flex justify-between items-center print:hidden">
          <h1 className="text-3xl font-bold text-white">ID Card Generator</h1>
          <Button variant="primary" onClick={handlePrint} disabled={selected.length === 0}>
            <MdPrint className="inline mr-1" /> Print ({selected.length})
          </Button>
        </div>

        <GlassCard className="p-4 print:hidden">
          <div className="flex gap-2 mb-3">
            {['student', 'teacher'].map(t => (
              <button
                key={t}
                onClick={() => setPersonType(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition ${
                  personType === t ? 'bg-blue-500/30 text-blue-300 border border-blue-500/40' : 'bg-white/5 text-white/50'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="relative">
            <MdSearch className="absolute left-3 top-3 w-4 h-4 text-white/40" />
            <input className="input-glass w-full pl-9" placeholder={`Search ${personType}s by name...`} value={search} onChange={e => runSearch(e.target.value)} />
          </div>
          {results.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
              {results.map(p => (
                <button key={p.id} onClick={() => addToSelection(p)} className="w-full text-left px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-white/80 transition">
                  {p.first_name} {p.last_name} {p.class_name ? `· Class ${p.class_name}` : ''}
                </button>
              ))}
            </div>
          )}
        </GlassCard>

        {selected.length === 0 ? (
          <GlassCard className="p-10 text-center text-white/40 print:hidden">Search and select students/staff to generate their ID cards.</GlassCard>
        ) : (
          <div id="id-card-print-area" className="flex flex-wrap gap-4">
            {selected.map(person => (
              <div key={person.id} className="relative group">
                <IdCard institution={institution} person={person} personType={person.__type} />
                <button
                  onClick={() => removeFromSelection(person.id)}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white text-xs opacity-0 group-hover:opacity-100 transition print:hidden"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
