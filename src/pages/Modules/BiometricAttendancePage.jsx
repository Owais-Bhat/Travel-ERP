import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdAdd, MdDelete, MdClose, MdSearch, MdFingerprint, MdRefresh, MdContentCopy, MdCheck, MdUploadFile } from 'react-icons/md';

const WEBHOOK_URL = 'https://erp-api.networkingexperts.in/api/biometric-webhook';

export default function BiometricAttendancePage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [activeTab, setActiveTab] = useState('devices');

  // ─── Devices ────────────────────────────────────────────────────────
  const [devices, setDevices] = useState([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [deviceForm, setDeviceForm] = useState({ device_code: '', name: '', location: '' });
  const [deviceSaving, setDeviceSaving] = useState(false);
  const [revealedKey, setRevealedKey] = useState(null);
  const [copiedKeyFor, setCopiedKeyFor] = useState('');
  const [importingFor, setImportingFor] = useState('');

  // ─── Enrollments ────────────────────────────────────────────────────
  const [enrollments, setEnrollments] = useState([]);
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(true);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [personType, setPersonType] = useState('student');
  const [personSearch, setPersonSearch] = useState('');
  const [personResults, setPersonResults] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [biometricUid, setBiometricUid] = useState('');
  const [enrollSaving, setEnrollSaving] = useState(false);

  // ─── Punch log ──────────────────────────────────────────────────────
  const [punches, setPunches] = useState([]);
  const [punchesLoading, setPunchesLoading] = useState(true);

  const loadDevices = async () => {
    if (!profile?.institution_id) return;
    setDevicesLoading(true);
    try {
      const { data } = await api.get('/biometric/devices');
      setDevices(data || []);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load devices');
    } finally {
      setDevicesLoading(false);
    }
  };

  const loadEnrollments = async () => {
    if (!profile?.institution_id) return;
    setEnrollmentsLoading(true);
    try {
      const { data } = await api.get('/biometric/enrollments');
      setEnrollments(data || []);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load enrollments');
    } finally {
      setEnrollmentsLoading(false);
    }
  };

  const loadPunches = async () => {
    if (!profile?.institution_id) return;
    setPunchesLoading(true);
    try {
      const { data } = await api.get('/biometric/punches');
      setPunches(data || []);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load punch log');
    } finally {
      setPunchesLoading(false);
    }
  };

  useEffect(() => {
    if (!profile) return;
    if (activeTab === 'devices') loadDevices();
    if (activeTab === 'enrollments') { loadEnrollments(); if (devices.length === 0) loadDevices(); }
    if (activeTab === 'punches') loadPunches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, activeTab]);

  // ─── Device handlers ────────────────────────────────────────────────
  const handleSaveDevice = async () => {
    if (!deviceForm.device_code.trim() || !deviceForm.name.trim()) {
      notification.error('Device code and name are required'); return;
    }
    setDeviceSaving(true);
    try {
      const { data } = await api.post('/biometric/devices', {
        device_code: deviceForm.device_code.trim(), name: deviceForm.name.trim(), location: deviceForm.location.trim(),
      });
      setDevices(prev => [...prev, data]);
      setRevealedKey(data);
      notification.success('Device registered!');
      setShowDeviceModal(false);
      setDeviceForm({ device_code: '', name: '', location: '' });
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to register device');
    } finally {
      setDeviceSaving(false);
    }
  };

  const handleRotateKey = async (device) => {
    if (!window.confirm(`Rotate the API key for "${device.name}"? The old key stops working immediately.`)) return;
    try {
      const { data } = await api.post(`/biometric/devices/${device.id}/rotate-key`);
      setDevices(prev => prev.map(d => (d.id === device.id ? data : d)));
      setRevealedKey(data);
      notification.success('API key rotated');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to rotate key');
    }
  };

  const handleDeleteDevice = async (device) => {
    if (!window.confirm(`Remove device "${device.name}"?`)) return;
    try {
      await api.delete(`/biometric/devices/${device.id}`);
      setDevices(prev => prev.filter(d => d.id !== device.id));
      notification.success('Device removed');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to remove device');
    }
  };

  const handleImportCsv = async (device, file) => {
    if (!file) return;
    setImportingFor(device.id);
    const formData = new FormData();
    formData.append('file', file);
    try {
      // Let axios set the multipart boundary itself — pinning
      // Content-Type here would strip it and the upload would fail.
      const { data } = await api.post(`/biometric/devices/${device.id}/import-csv`, formData);
      notification.success(`Imported: ${data.matched} matched, ${data.unmatched} unenrolled ID(s) out of ${data.received} row(s).`);
      loadDevices();
      if (activeTab === 'punches') loadPunches();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to import file');
    } finally {
      setImportingFor('');
    }
  };

  const copyKey = async (device) => {
    await navigator.clipboard.writeText(device.api_key);
    setCopiedKeyFor(device.id);
    setTimeout(() => setCopiedKeyFor(''), 2000);
  };

  // ─── Enrollment handlers ────────────────────────────────────────────
  const openEnrollModal = () => {
    setPersonType('student');
    setPersonSearch('');
    setPersonResults([]);
    setSelectedPerson(null);
    setBiometricUid('');
    setShowEnrollModal(true);
  };

  const handlePersonSearch = async (val) => {
    setPersonSearch(val);
    setSelectedPerson(null);
    if (!val.trim() || val.length < 2) { setPersonResults([]); return; }
    try {
      if (personType === 'student') {
        const { data } = await api.get('/students', { params: { search: val, pageSize: 8, page: 1 } });
        setPersonResults(data?.data || []);
      } else {
        const { data } = await api.get('/teachers');
        const q = val.toLowerCase();
        setPersonResults((data || []).filter(t =>
          `${t.first_name} ${t.last_name}`.toLowerCase().includes(q)
        ).slice(0, 8));
      }
    } catch {
      setPersonResults([]);
    }
  };

  const handleSaveEnrollment = async () => {
    if (!selectedPerson) { notification.error('Select a student or teacher'); return; }
    if (!biometricUid.trim()) { notification.error('Enter the biometric ID/PIN from the device'); return; }
    setEnrollSaving(true);
    try {
      await api.post('/biometric/enrollments', {
        person_type: personType, person_id: selectedPerson.id, biometric_uid: biometricUid.trim(),
      });
      notification.success('Enrolled!');
      setShowEnrollModal(false);
      loadEnrollments();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to enroll');
    } finally {
      setEnrollSaving(false);
    }
  };

  const handleDeleteEnrollment = async (enrollment) => {
    if (!window.confirm(`Remove this enrollment?`)) return;
    try {
      await api.delete(`/biometric/enrollments/${enrollment.id}`);
      setEnrollments(prev => prev.filter(e => e.id !== enrollment.id));
      notification.success('Enrollment removed');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to remove enrollment');
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-3xl font-bold text-white">Biometric Attendance</h1>

        <GlassCard className="p-4 space-y-2">
          <p className="text-white/60 text-sm mb-0">
            <strong className="text-white/80">Live push:</strong> point your device's push-to-URL / middleware at this webhook. It authenticates with each device's own code + API key (below), not a login — any biometric device or agent software that can POST JSON can use it.
          </p>
          <code className="block bg-black/30 text-emerald-300 text-xs rounded-lg px-3 py-2 overflow-x-auto">
            POST {WEBHOOK_URL}
          </code>
          <p className="text-white/60 text-sm mb-0 pt-1">
            <strong className="text-white/80">No live push?</strong> Use "Import CSV/Excel export" on a device below — export attendance from your device's software (e.g. Realtime eTimeTrackLite), save as CSV, and upload it. Needs an ID column (Enroll No / User ID / PIN) and a date+time column.
          </p>
        </GlassCard>

        <div className="flex gap-2 border-b border-white/10">
          {[['devices', 'Devices'], ['enrollments', 'Enrollments'], ['punches', 'Punch Log']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition ${
                activeTab === key ? 'bg-white/10 text-white border-b-2 border-neon-cyan' : 'text-white/50 hover:text-white/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ─── DEVICES TAB ─────────────────────────────────────────── */}
        {activeTab === 'devices' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => setShowDeviceModal(true)}>
                <MdAdd className="inline mr-1" /> Register Device
              </Button>
            </div>

            {devicesLoading ? (
              <div className="text-center py-12 text-white/50">Loading...</div>
            ) : devices.length === 0 ? (
              <GlassCard className="p-10 text-center text-white/40">No biometric devices registered yet.</GlassCard>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {devices.map(device => (
                  <GlassCard key={device.id} className="p-5">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-white font-bold flex items-center gap-2">
                        <MdFingerprint className="text-neon-cyan w-5 h-5" /> {device.name}
                      </h3>
                      <button onClick={() => handleDeleteDevice(device)} className="text-red-400/60 hover:text-red-400 transition">
                        <MdDelete className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-white/50 text-sm mb-1">Code: {device.device_code} {device.location ? `· ${device.location}` : ''}</p>
                    <p className="text-white/40 text-xs mb-3">
                      {device.last_seen_at ? `Last punch received ${new Date(device.last_seen_at).toLocaleString('en-IN')}` : 'No punches received yet'}
                    </p>
                    <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                      <code className="text-xs text-white/70 flex-1 truncate">{device.api_key}</code>
                      <button onClick={() => copyKey(device)} className="text-white/50 hover:text-white shrink-0">
                        {copiedKeyFor === device.id ? <MdCheck className="w-4 h-4 text-emerald-400" /> : <MdContentCopy className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                      <button onClick={() => handleRotateKey(device)} className="text-xs text-amber-400/80 hover:text-amber-400 inline-flex items-center gap-1">
                        <MdRefresh className="w-3.5 h-3.5" /> Rotate key
                      </button>
                      <label className={`text-xs text-blue-400/80 hover:text-blue-400 inline-flex items-center gap-1 cursor-pointer ${importingFor === device.id ? 'opacity-50 pointer-events-none' : ''}`}>
                        <MdUploadFile className="w-3.5 h-3.5" /> {importingFor === device.id ? 'Importing...' : 'Import CSV/Excel export'}
                        <input
                          type="file"
                          accept=".csv,.txt"
                          className="hidden"
                          onChange={e => { handleImportCsv(device, e.target.files[0]); e.target.value = ''; }}
                        />
                      </label>
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── ENROLLMENTS TAB ─────────────────────────────────────── */}
        {activeTab === 'enrollments' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="primary" onClick={openEnrollModal}>
                <MdAdd className="inline mr-1" /> Enroll Student/Staff
              </Button>
            </div>

            {enrollmentsLoading ? (
              <div className="text-center py-12 text-white/50">Loading...</div>
            ) : enrollments.length === 0 ? (
              <GlassCard className="p-10 text-center text-white/40">No one enrolled yet. Map a student/teacher to their device biometric ID.</GlassCard>
            ) : (
              <GlassCard className="p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-3 px-4 text-white/50">Person</th>
                        <th className="text-left py-3 px-4 text-white/50">Type</th>
                        <th className="text-left py-3 px-4 text-white/50">Biometric ID</th>
                        <th className="text-center py-3 px-4 text-white/50">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrollments.map(e => (
                        <tr key={e.id} className="border-b border-white/5 hover:bg-white/3 transition">
                          <td className="py-3 px-4 text-white">
                            {e.first_name} {e.last_name}
                            {e.class_name && <span className="text-white/40 text-xs block">Class {e.class_name}</span>}
                            {e.employee_id && <span className="text-white/40 text-xs block">{e.employee_id}</span>}
                          </td>
                          <td className="py-3 px-4 text-white/60 capitalize">{e.person_type}</td>
                          <td className="py-3 px-4"><code className="text-white/70">{e.biometric_uid}</code></td>
                          <td className="py-3 px-4 text-center">
                            <button onClick={() => handleDeleteEnrollment(e)} className="text-red-400/60 hover:text-red-400 transition">
                              <MdDelete className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            )}
          </div>
        )}

        {/* ─── PUNCH LOG TAB ───────────────────────────────────────── */}
        {activeTab === 'punches' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={loadPunches}>
                <MdRefresh className="inline mr-1" /> Refresh
              </Button>
            </div>
            {punchesLoading ? (
              <div className="text-center py-12 text-white/50">Loading...</div>
            ) : punches.length === 0 ? (
              <GlassCard className="p-10 text-center text-white/40">No punches received yet. Once a device pushes data here, it'll show up in real time.</GlassCard>
            ) : (
              <GlassCard className="p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-3 px-4 text-white/50">Time</th>
                        <th className="text-left py-3 px-4 text-white/50">Device</th>
                        <th className="text-left py-3 px-4 text-white/50">Biometric ID</th>
                        <th className="text-left py-3 px-4 text-white/50">Matched To</th>
                        <th className="text-left py-3 px-4 text-white/50">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {punches.map(p => (
                        <tr key={p.id} className="border-b border-white/5 hover:bg-white/3 transition">
                          <td className="py-3 px-4 text-white/70">{new Date(p.punched_at).toLocaleString('en-IN')}</td>
                          <td className="py-3 px-4 text-white/60">{p.device_name}</td>
                          <td className="py-3 px-4"><code className="text-white/60">{p.biometric_uid}</code></td>
                          <td className="py-3 px-4 text-white">{p.matched ? `${p.first_name} ${p.last_name}` : '—'}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                              p.matched ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                            }`}>
                              {p.matched ? 'Matched' : 'Unenrolled ID'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            )}
          </div>
        )}

        {/* ─── REGISTER DEVICE MODAL ───────────────────────────────── */}
        {showDeviceModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Register Device</h3>
                <button onClick={() => setShowDeviceModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <Input label="Device Code" placeholder="e.g. GATE-01" required value={deviceForm.device_code} onChange={e => setDeviceForm(f => ({ ...f, device_code: e.target.value }))} />
              <Input label="Name" placeholder="e.g. Main Gate Scanner" required value={deviceForm.name} onChange={e => setDeviceForm(f => ({ ...f, name: e.target.value }))} />
              <Input label="Location (optional)" value={deviceForm.location} onChange={e => setDeviceForm(f => ({ ...f, location: e.target.value }))} />
              <div className="flex gap-2 pt-2">
                <Button variant="primary" loading={deviceSaving} onClick={handleSaveDevice}>Register</Button>
                <Button variant="secondary" onClick={() => setShowDeviceModal(false)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}

        {/* ─── API KEY REVEAL MODAL ────────────────────────────────── */}
        {revealedKey && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-md p-6">
              <h3 className="text-white font-bold text-lg mb-2">Device Ready</h3>
              <p className="text-white/60 text-sm mb-3">Configure your device/middleware with these values:</p>
              <div className="space-y-2 mb-4">
                <div className="bg-white/5 rounded-lg px-3 py-2">
                  <p className="text-white/40 text-xs mb-0.5">Device Code</p>
                  <code className="text-white text-sm">{revealedKey.device_code}</code>
                </div>
                <div className="bg-white/5 rounded-lg px-3 py-2">
                  <p className="text-white/40 text-xs mb-0.5">API Key</p>
                  <code className="text-white text-sm break-all">{revealedKey.api_key}</code>
                </div>
              </div>
              <Button variant="primary" onClick={() => setRevealedKey(null)}>Done</Button>
            </GlassCard>
          </div>,
          document.body
        )}

        {/* ─── ENROLL MODAL ────────────────────────────────────────── */}
        {showEnrollModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Enroll Student/Staff</h3>
                <button onClick={() => setShowEnrollModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>

              <label className="block text-sm font-medium mb-2">Type</label>
              <div className="flex gap-2 mb-3">
                {['student', 'teacher'].map(t => (
                  <button
                    key={t}
                    onClick={() => { setPersonType(t); setSelectedPerson(null); setPersonSearch(''); setPersonResults([]); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition ${
                      personType === t ? 'bg-blue-500/30 text-blue-300 border border-blue-500/40' : 'bg-white/5 text-white/50'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="mb-4 relative">
                <label className="block text-sm font-medium mb-2">{personType === 'student' ? 'Student' : 'Teacher'} <span className="text-red-400 ml-1">*</span></label>
                {selectedPerson ? (
                  <div className="flex items-center gap-2 p-2.5 bg-white/5 rounded-lg border border-white/10">
                    <span className="text-white text-sm flex-1">{selectedPerson.first_name} {selectedPerson.last_name}</span>
                    <button onClick={() => { setSelectedPerson(null); setPersonSearch(''); }} className="text-white/40 hover:text-white/70">
                      <MdClose className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <MdSearch className="absolute left-3 top-3 w-4 h-4 text-white/40" />
                      <input className="input-glass w-full pl-9" placeholder="Search by name..." value={personSearch} onChange={e => handlePersonSearch(e.target.value)} />
                    </div>
                    {personResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-gray-900/95 border border-white/10 rounded-lg overflow-hidden shadow-xl">
                        {personResults.map(p => (
                          <button key={p.id} className="w-full text-left px-4 py-2.5 hover:bg-white/10 text-sm text-white/80 transition" onClick={() => { setSelectedPerson(p); setPersonResults([]); }}>
                            {p.first_name} {p.last_name}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <Input label="Biometric ID / PIN (from device)" required value={biometricUid} onChange={e => setBiometricUid(e.target.value)} />

              <div className="flex gap-2 pt-2">
                <Button variant="primary" loading={enrollSaving} onClick={handleSaveEnrollment}>Enroll</Button>
                <Button variant="secondary" onClick={() => setShowEnrollModal(false)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}
      </div>
    </MainLayout>
  );
}
