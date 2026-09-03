import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import {
  MdAdd, MdHome, MdEdit, MdDelete, MdClose, MdSearch, MdLogout,
} from 'react-icons/md';
import { formatDate } from '../../utils/helpers';

const EMPTY_HOSTEL = { name: '', warden_name: '', warden_phone: '', address: '' };
const EMPTY_ROOM = { room_number: '', room_type: '', capacity: 1 };

export default function HostelPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [activeTab, setActiveTab] = useState('hostels');

  // ─── Hostels + rooms state ─────────────────────────────────────────
  const [hostels, setHostels] = useState([]);
  const [hostelsLoading, setHostelsLoading] = useState(true);
  const [hostelsError, setHostelsError] = useState('');
  const [showHostelModal, setShowHostelModal] = useState(false);
  const [editingHostel, setEditingHostel] = useState(null);
  const [hostelForm, setHostelForm] = useState(EMPTY_HOSTEL);
  const [hostelSaving, setHostelSaving] = useState(false);

  const [expandedHostelId, setExpandedHostelId] = useState('');
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [roomForm, setRoomForm] = useState(EMPTY_ROOM);
  const [roomSaving, setRoomSaving] = useState(false);

  // ─── Allocations state ─────────────────────────────────────────────
  const [allocations, setAllocations] = useState([]);
  const [allocationsLoading, setAllocationsLoading] = useState(true);
  const [allocationFilter, setAllocationFilter] = useState('active');
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [allocateRoom, setAllocateRoom] = useState(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [allocateSaving, setAllocateSaving] = useState(false);

  const loadHostels = async () => {
    if (!profile?.institution_id) return;
    setHostelsLoading(true);
    setHostelsError('');
    try {
      const { data } = await api.get('/hostel/hostels');
      setHostels(data || []);
    } catch (err) {
      // Distinguish "nothing here yet" from "we could not load it" — falling
      // through to the empty state on a failed request hides real outages.
      const message = err.response?.data?.error || 'Failed to load hostels';
      setHostelsError(message);
      notification.error(message);
    } finally {
      setHostelsLoading(false);
    }
  };

  const loadRooms = async (hostelId) => {
    setRoomsLoading(true);
    try {
      const { data } = await api.get('/hostel/rooms', { params: { hostel_id: hostelId } });
      setRooms(data || []);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load rooms');
    } finally {
      setRoomsLoading(false);
    }
  };

  const loadAllocations = async (status = allocationFilter) => {
    if (!profile?.institution_id) return;
    setAllocationsLoading(true);
    try {
      const { data } = await api.get('/hostel/allocations', { params: status ? { status } : {} });
      setAllocations(data || []);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load allocations');
    } finally {
      setAllocationsLoading(false);
    }
  };

  useEffect(() => { if (profile) loadHostels(); }, [profile]);
  useEffect(() => { if (profile && activeTab === 'allocations') loadAllocations(); }, [profile, activeTab]);

  const toggleHostelRooms = (hostel) => {
    if (expandedHostelId === hostel.id) {
      setExpandedHostelId('');
      setRooms([]);
    } else {
      setExpandedHostelId(hostel.id);
      loadRooms(hostel.id);
    }
  };

  // ─── Hostel CRUD ───────────────────────────────────────────────────
  const openHostelModal = (hostel = null) => {
    if (hostel) {
      setEditingHostel(hostel);
      setHostelForm({
        name: hostel.name || '', warden_name: hostel.warden_name || '',
        warden_phone: hostel.warden_phone || '', address: hostel.address || '',
      });
    } else {
      setEditingHostel(null);
      setHostelForm(EMPTY_HOSTEL);
    }
    setShowHostelModal(true);
  };

  const handleSaveHostel = async () => {
    if (!hostelForm.name.trim()) { notification.error('Hostel name is required'); return; }
    setHostelSaving(true);
    const payload = {
      name: hostelForm.name.trim(),
      warden_name: hostelForm.warden_name.trim(),
      warden_phone: hostelForm.warden_phone.trim(),
      address: hostelForm.address.trim(),
    };
    try {
      const response = editingHostel
        ? await api.put(`/hostel/hostels/${editingHostel.id}`, payload)
        : await api.post('/hostel/hostels', payload);
      const saved = response.data;
      setHostels(prev => (editingHostel
        ? prev.map(h => (h.id === saved.id ? { ...h, ...saved } : h))
        : [...prev, { ...saved, room_count: 0, occupied_count: 0 }]));
      notification.success(editingHostel ? 'Hostel updated!' : 'Hostel added!');
      setShowHostelModal(false);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to save hostel');
    } finally {
      setHostelSaving(false);
    }
  };

  const handleDeleteHostel = async (hostel) => {
    if (!window.confirm(`Delete "${hostel.name}"? This also removes its rooms.`)) return;
    try {
      await api.delete(`/hostel/hostels/${hostel.id}`);
      setHostels(prev => prev.filter(h => h.id !== hostel.id));
      notification.success('Hostel deleted');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to delete hostel');
    }
  };

  // ─── Room CRUD ─────────────────────────────────────────────────────
  const openRoomModal = (hostelId, room = null) => {
    setExpandedHostelId(hostelId);
    if (room) {
      setEditingRoom(room);
      setRoomForm({ room_number: room.room_number || '', room_type: room.room_type || '', capacity: room.capacity || 1 });
    } else {
      setEditingRoom(null);
      setRoomForm(EMPTY_ROOM);
    }
    setShowRoomModal(true);
  };

  const handleSaveRoom = async () => {
    if (!roomForm.room_number.trim()) { notification.error('Room number is required'); return; }
    setRoomSaving(true);
    const payload = {
      hostel_id: expandedHostelId,
      room_number: roomForm.room_number.trim(),
      room_type: roomForm.room_type.trim(),
      capacity: parseInt(roomForm.capacity, 10) || 1,
    };
    try {
      const response = editingRoom
        ? await api.put(`/hostel/rooms/${editingRoom.id}`, payload)
        : await api.post('/hostel/rooms', payload);
      const saved = response.data;
      setRooms(prev => (editingRoom ? prev.map(r => (r.id === saved.id ? { ...r, ...saved } : r)) : [...prev, { ...saved, occupied_count: 0 }]));
      setHostels(prev => prev.map(h => (h.id === expandedHostelId && !editingRoom ? { ...h, room_count: Number(h.room_count) + 1 } : h)));
      notification.success(editingRoom ? 'Room updated!' : 'Room added!');
      setShowRoomModal(false);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to save room');
    } finally {
      setRoomSaving(false);
    }
  };

  const handleDeleteRoom = async (room) => {
    if (!window.confirm(`Delete room "${room.room_number}"?`)) return;
    try {
      await api.delete(`/hostel/rooms/${room.id}`);
      setRooms(prev => prev.filter(r => r.id !== room.id));
      setHostels(prev => prev.map(h => (h.id === expandedHostelId ? { ...h, room_count: Math.max(0, Number(h.room_count) - 1) } : h)));
      notification.success('Room deleted');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to delete room');
    }
  };

  // ─── Allocation workflow ───────────────────────────────────────────
  const openAllocateModal = (room) => {
    setAllocateRoom(room);
    setSelectedStudent(null);
    setStudentSearch('');
    setStudentResults([]);
    setShowAllocateModal(true);
  };

  const handleStudentSearch = async (val) => {
    setStudentSearch(val);
    setSelectedStudent(null);
    if (!val.trim() || val.length < 2) { setStudentResults([]); return; }
    try {
      const { data } = await api.get('/students', { params: { search: val, pageSize: 8, page: 1 } });
      setStudentResults(data?.data || []);
    } catch {
      setStudentResults([]);
    }
  };

  const handleAllocate = async () => {
    if (!selectedStudent) { notification.error('Please select a student'); return; }
    setAllocateSaving(true);
    try {
      await api.post('/hostel/allocations', { room_id: allocateRoom.id, student_id: selectedStudent.id });
      setRooms(prev => prev.map(r => (r.id === allocateRoom.id ? { ...r, occupied_count: Number(r.occupied_count) + 1 } : r)));
      notification.success(`${selectedStudent.first_name} allocated to room ${allocateRoom.room_number}`);
      setShowAllocateModal(false);
      if (activeTab === 'allocations') loadAllocations();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to allocate room');
    } finally {
      setAllocateSaving(false);
    }
  };

  const handleVacate = async (allocation) => {
    if (!window.confirm(`Vacate ${allocation.first_name} ${allocation.last_name} from room ${allocation.room_number}?`)) return;
    try {
      const { data } = await api.post(`/hostel/allocations/${allocation.id}/vacate`);
      setAllocations(prev => prev.map(a => (a.id === allocation.id ? { ...a, ...data } : a)));
      notification.success('Student vacated');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to vacate');
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-3xl font-bold text-white">Hostel</h1>

        <div className="flex gap-2 border-b border-white/10">
          {['hostels', 'allocations'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-medium rounded-t-lg capitalize transition ${
                activeTab === tab
                  ? 'bg-white/10 text-white border-b-2 border-neon-cyan'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              {tab === 'hostels' ? 'Hostels & Rooms' : 'Room Allocations'}
            </button>
          ))}
        </div>

        {/* ─── HOSTELS TAB ─────────────────────────────────────────── */}
        {activeTab === 'hostels' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <MdHome className="text-neon-cyan" /> Hostels ({hostels.length})
              </h2>
              <Button variant="primary" onClick={() => openHostelModal()}>
                <MdAdd className="inline mr-1" /> Add Hostel
              </Button>
            </div>

            {hostelsLoading ? (
              <div className="text-center py-12 text-white/50">Loading hostels...</div>
            ) : hostelsError ? (
              <GlassCard className="p-10 text-center">
                <p className="text-red-300 font-semibold mb-1">Could not load hostels</p>
                <p className="text-white/50 text-sm mb-4">{hostelsError}</p>
                <Button variant="secondary" size="sm" onClick={loadHostels}>Retry</Button>
              </GlassCard>
            ) : hostels.length === 0 ? (
              <GlassCard className="p-10 text-center text-white/40">No hostels configured yet.</GlassCard>
            ) : (
              <div className="space-y-4">
                {hostels.map(hostel => (
                  <GlassCard key={hostel.id} className="p-5">
                    <div className="flex flex-wrap justify-between items-start gap-3 mb-3">
                      <div>
                        <h3 className="text-white font-bold text-base">{hostel.name}</h3>
                        <p className="text-white/60 text-sm mt-0.5">
                          {hostel.warden_name ? `Warden: ${hostel.warden_name}` : 'No warden assigned'}
                          {hostel.warden_phone ? ` · ${hostel.warden_phone}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-blue-300">
                          {hostel.occupied_count}/{hostel.room_count} rooms occupied
                        </span>
                        <button onClick={() => openHostelModal(hostel)} className="text-blue-400/70 hover:text-blue-400 transition">
                          <MdEdit className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteHostel(hostel)} className="text-red-400/60 hover:text-red-400 transition">
                          <MdDelete className="w-4 h-4" />
                        </button>
                        <Button variant="secondary" size="sm" onClick={() => toggleHostelRooms(hostel)}>
                          {expandedHostelId === hostel.id ? 'Hide Rooms' : 'View Rooms'}
                        </Button>
                      </div>
                    </div>

                    {expandedHostelId === hostel.id && (
                      <div className="pt-3 border-t border-white/10">
                        <div className="flex justify-between items-center mb-3">
                          <p className="text-white/70 text-sm font-semibold">Rooms</p>
                          <Button variant="secondary" size="sm" onClick={() => openRoomModal(hostel.id)}>
                            <MdAdd className="inline mr-1" /> Add Room
                          </Button>
                        </div>
                        {roomsLoading ? (
                          <p className="text-white/40 text-sm py-4 text-center">Loading rooms...</p>
                        ) : rooms.length === 0 ? (
                          <p className="text-white/40 text-sm py-4 text-center">No rooms in this hostel yet.</p>
                        ) : (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {rooms.map(room => {
                              const full = Number(room.occupied_count) >= room.capacity;
                              return (
                                <div key={room.id} className="rounded-lg bg-white/5 p-3 border border-white/10">
                                  <div className="flex justify-between items-start mb-1">
                                    <span className="text-white font-semibold text-sm">{room.room_number}</span>
                                    <div className="flex gap-1">
                                      <button onClick={() => openRoomModal(hostel.id, room)} className="text-blue-400/60 hover:text-blue-400"><MdEdit className="w-3.5 h-3.5" /></button>
                                      <button onClick={() => handleDeleteRoom(room)} className="text-red-400/50 hover:text-red-400"><MdDelete className="w-3.5 h-3.5" /></button>
                                    </div>
                                  </div>
                                  {room.room_type && <p className="text-white/50 text-xs mb-1">{room.room_type}</p>}
                                  <p className={`text-xs font-semibold mb-2 ${full ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {room.occupied_count}/{room.capacity} occupied
                                  </p>
                                  <Button variant="secondary" size="sm" disabled={full} onClick={() => openAllocateModal(room)} className="w-full !text-xs !py-1">
                                    Allocate
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </GlassCard>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── ALLOCATIONS TAB ─────────────────────────────────────── */}
        {activeTab === 'allocations' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {[{ v: 'active', label: 'Active' }, { v: '', label: 'All' }, { v: 'vacated', label: 'Vacated' }].map(opt => (
                <button
                  key={opt.v}
                  onClick={() => { setAllocationFilter(opt.v); loadAllocations(opt.v); }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                    allocationFilter === opt.v ? 'bg-blue-500/30 text-blue-300 border border-blue-500/40' : 'text-white/50 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {allocationsLoading ? (
              <div className="text-center py-12 text-white/50">Loading...</div>
            ) : allocations.length === 0 ? (
              <GlassCard className="p-10 text-center text-white/40">No allocation records found.</GlassCard>
            ) : (
              <GlassCard className="p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-3 px-4 text-white/50">Student</th>
                        <th className="text-left py-3 px-4 text-white/50">Hostel / Room</th>
                        <th className="text-left py-3 px-4 text-white/50">Allocated</th>
                        <th className="text-left py-3 px-4 text-white/50">Status</th>
                        <th className="text-center py-3 px-4 text-white/50">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocations.map(alloc => (
                        <tr key={alloc.id} className="border-b border-white/5 hover:bg-white/3 transition">
                          <td className="py-3 px-4 text-white">
                            {alloc.first_name} {alloc.last_name}
                            <span className="text-white/40 text-xs block">{alloc.admission_no} &middot; {alloc.class_name}</span>
                          </td>
                          <td className="py-3 px-4 text-white/70">{alloc.hostel_name} &middot; {alloc.room_number}</td>
                          <td className="py-3 px-4 text-white/60">{formatDate(alloc.allocated_at)}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                              alloc.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-500/20 text-gray-400'
                            }`}>
                              {alloc.status === 'active' ? 'Active' : `Vacated ${formatDate(alloc.vacated_at)}`}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {alloc.status === 'active' && (
                              <button
                                onClick={() => handleVacate(alloc)}
                                className="text-red-400/60 hover:text-red-400 transition inline-flex items-center gap-1 text-xs font-semibold"
                              >
                                <MdLogout className="w-4 h-4" /> Vacate
                              </button>
                            )}
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

        {/* ─── ADD/EDIT HOSTEL MODAL ───────────────────────────────── */}
        {showHostelModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">{editingHostel ? 'Edit Hostel' : 'Add Hostel'}</h3>
                <button onClick={() => setShowHostelModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-0">
                <Input label="Hostel Name" required value={hostelForm.name} onChange={e => setHostelForm(f => ({ ...f, name: e.target.value }))} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Warden Name" value={hostelForm.warden_name} onChange={e => setHostelForm(f => ({ ...f, warden_name: e.target.value }))} />
                  <Input label="Warden Phone" value={hostelForm.warden_phone} onChange={e => setHostelForm(f => ({ ...f, warden_phone: e.target.value }))} />
                </div>
                <Input label="Address" value={hostelForm.address} onChange={e => setHostelForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="primary" loading={hostelSaving} onClick={handleSaveHostel}>
                  {editingHostel ? 'Update Hostel' : 'Add Hostel'}
                </Button>
                <Button variant="secondary" onClick={() => setShowHostelModal(false)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}

        {/* ─── ADD/EDIT ROOM MODAL ─────────────────────────────────── */}
        {showRoomModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">{editingRoom ? 'Edit Room' : 'Add Room'}</h3>
                <button onClick={() => setShowRoomModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-0">
                <Input label="Room Number" required value={roomForm.room_number} onChange={e => setRoomForm(f => ({ ...f, room_number: e.target.value }))} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Room Type" placeholder="e.g. Twin sharing" value={roomForm.room_type} onChange={e => setRoomForm(f => ({ ...f, room_type: e.target.value }))} />
                  <Input label="Capacity" type="number" min="1" value={roomForm.capacity} onChange={e => setRoomForm(f => ({ ...f, capacity: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="primary" loading={roomSaving} onClick={handleSaveRoom}>
                  {editingRoom ? 'Update Room' : 'Add Room'}
                </Button>
                <Button variant="secondary" onClick={() => setShowRoomModal(false)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}

        {/* ─── ALLOCATE STUDENT MODAL ──────────────────────────────── */}
        {showAllocateModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Allocate Room {allocateRoom?.room_number}</h3>
                <button onClick={() => setShowAllocateModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-4 relative">
                <label className="block text-sm font-medium mb-2">Student <span className="text-red-400 ml-1">*</span></label>
                {selectedStudent ? (
                  <div className="flex items-center gap-2 p-2.5 bg-white/5 rounded-lg border border-white/10">
                    <span className="text-white text-sm flex-1">
                      {selectedStudent.first_name} {selectedStudent.last_name}
                      <span className="text-white/40 ml-2 text-xs">{selectedStudent.admission_no} &middot; {selectedStudent.class_name}</span>
                    </span>
                    <button onClick={() => { setSelectedStudent(null); setStudentSearch(''); }} className="text-white/40 hover:text-white/70">
                      <MdClose className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <MdSearch className="absolute left-3 top-3 w-4 h-4 text-white/40" />
                      <input
                        className="input-glass w-full pl-9"
                        placeholder="Search by name or admission no..."
                        value={studentSearch}
                        onChange={e => handleStudentSearch(e.target.value)}
                      />
                    </div>
                    {studentResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-gray-900/95 border border-white/10 rounded-lg overflow-hidden shadow-xl">
                        {studentResults.map(s => (
                          <button
                            key={s.id}
                            className="w-full text-left px-4 py-2.5 hover:bg-white/10 text-sm text-white/80 transition"
                            onClick={() => { setSelectedStudent(s); setStudentResults([]); }}
                          >
                            {s.first_name} {s.last_name}
                            <span className="text-white/40 ml-2 text-xs">{s.admission_no} &middot; {s.class_name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="primary" loading={allocateSaving} onClick={handleAllocate}>Allocate</Button>
                <Button variant="secondary" onClick={() => setShowAllocateModal(false)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}
      </div>
    </MainLayout>
  );
}
