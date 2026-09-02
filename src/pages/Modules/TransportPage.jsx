import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import Badge from '../../components/Common/Badge';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import {
  MdAdd, MdDirectionsBus, MdPerson, MdEdit, MdDelete,
  MdClose, MdPhone, MdSearch, MdLocationOn, MdToggleOn, MdToggleOff,
} from 'react-icons/md';
import { formatDate } from '../../utils/helpers';

/** Stops come back as `{ name }` objects; older rows are bare strings. */
function stopLabel(stop) {
  if (!stop) return '';
  return typeof stop === 'string' ? stop : (stop.name || '');
}

export default function TransportPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [activeTab, setActiveTab] = useState('routes');

  // ─── Routes state ──────────────────────────────────────────────────
  const [routes, setRoutes] = useState([]);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);
  const [routeForm, setRouteForm] = useState({
    route_name: '', driver_name: '', driver_phone: '',
    vehicle_no: '', capacity: '', stops: [],
  });
  const [newStop, setNewStop] = useState('');
  const [routeSaving, setRouteSaving] = useState(false);

  // ─── Student assignment state ──────────────────────────────────────
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [assignedStudents, setAssignedStudents] = useState([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedStop, setSelectedStop] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);

  // ─── Load routes ───────────────────────────────────────────────────
  const loadRoutes = async () => {
    if (!profile?.institution_id) return;
    setRoutesLoading(true);
    try {
      const { data } = await api.get('/transport/routes');
      setRoutes(data || []);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load routes');
    } finally {
      setRoutesLoading(false);
    }
  };

  // ─── Load students assigned to route ──────────────────────────────
  const loadAssignedStudents = async (routeId) => {
    if (!routeId) { setAssignedStudents([]); return; }
    setAssignLoading(true);
    try {
      const { data } = await api.get(`/transport/routes/${routeId}`);
      // The API returns the student's columns flat alongside the assignment
      // id; this screen renders them from a nested `students` object.
      setAssignedStudents((data?.students || []).map((row) => ({
        id: row.assignment_id,
        student_id: row.id,
        pickup_stop: row.pickup_stop,
        students: {
          first_name: row.first_name,
          last_name: row.last_name,
          admission_no: row.admission_no,
          class_name: row.class_name,
        },
      })));
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load assigned students');
    } finally {
      setAssignLoading(false);
    }
  };

  useEffect(() => { if (profile) loadRoutes(); }, [profile]);

  useEffect(() => {
    if (selectedRouteId) loadAssignedStudents(selectedRouteId);
  }, [selectedRouteId]);

  // ─── Open route form ───────────────────────────────────────────────
  const openRouteModal = (route = null) => {
    if (route) {
      setEditingRoute(route);
      setRouteForm({
        route_name: route.route_name || '',
        driver_name: route.driver_name || '',
        driver_phone: route.driver_phone || '',
        vehicle_no: route.vehicle_no || '',
        capacity: route.capacity || '',
        stops: (route.stops || []).map(stopLabel).filter(Boolean),
      });
    } else {
      setEditingRoute(null);
      setRouteForm({ route_name: '', driver_name: '', driver_phone: '', vehicle_no: '', capacity: '', stops: [] });
    }
    setNewStop('');
    setShowRouteModal(true);
  };

  const handleAddStop = () => {
    if (!newStop.trim()) return;
    setRouteForm(f => ({ ...f, stops: [...f.stops, newStop.trim()] }));
    setNewStop('');
  };

  const handleRemoveStop = (idx) => {
    setRouteForm(f => ({ ...f, stops: f.stops.filter((_, i) => i !== idx) }));
  };

  // ─── Save route ────────────────────────────────────────────────────
  const handleSaveRoute = async () => {
    if (!routeForm.route_name.trim()) { notification.error('Route name is required'); return; }
    setRouteSaving(true);

    // institution_id comes from the session server-side; sending it here
    // would only be ignored by the validator.
    const payload = {
      route_name: routeForm.route_name.trim(),
      driver_name: routeForm.driver_name.trim(),
      driver_phone: routeForm.driver_phone.trim(),
      vehicle_no: routeForm.vehicle_no.trim(),
      capacity: parseInt(routeForm.capacity, 10) || 0,
      stops: routeForm.stops,
      is_active: editingRoute ? Boolean(editingRoute.is_active) : true,
    };

    try {
      const response = editingRoute
        ? await api.put(`/transport/routes/${editingRoute.id}`, payload)
        : await api.post('/transport/routes', payload);
      const saved = response.data;

      if (editingRoute) {
        setRoutes(prev => prev.map(r => (r.id === saved.id ? saved : r)));
        notification.success('Route updated!');
      } else {
        setRoutes(prev => [...prev, saved]);
        notification.success('Route created!');
      }
      setShowRouteModal(false);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to save route');
    } finally {
      setRouteSaving(false);
    }
  };

  // ─── Toggle route active ───────────────────────────────────────────
  const handleToggleActive = async (route) => {
    try {
      const { data } = await api.put(`/transport/routes/${route.id}`, { is_active: !route.is_active });
      setRoutes(prev => prev.map(r => (r.id === data.id ? data : r)));
      notification.success(`Route ${data.is_active ? 'activated' : 'deactivated'}`);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to update status');
    }
  };

  // ─── Delete route ──────────────────────────────────────────────────
  const handleDeleteRoute = async (route) => {
    if (!window.confirm(`Delete route "${route.route_name}"?`)) return;
    try {
      await api.delete(`/transport/routes/${route.id}`);
      setRoutes(prev => prev.filter(r => r.id !== route.id));
      if (selectedRouteId === route.id) { setSelectedRouteId(''); setAssignedStudents([]); }
      notification.success('Route deleted');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to delete route');
    }
  };

  // ─── Search students ───────────────────────────────────────────────
  const handleStudentSearch = async (val) => {
    setStudentSearch(val);
    setSelectedStudent(null);
    if (!val.trim() || val.length < 2) { setStudentResults([]); return; }
    try {
      const { data } = await api.get('/students', { params: { search: val, pageSize: 8, page: 1 } });
      const assignedIds = assignedStudents.map(a => a.student_id);
      setStudentResults((data?.data || []).filter(s => !assignedIds.includes(s.id)));
    } catch {
      setStudentResults([]);
    }
  };

  // ─── Assign student to route ───────────────────────────────────────
  const handleAssignStudent = async () => {
    if (!selectedStudent) { notification.error('Please select a student'); return; }
    if (!selectedStop) { notification.error('Please select a pickup stop'); return; }
    setAssignSaving(true);
    try {
      const { data } = await api.post(`/transport/routes/${selectedRouteId}/students`, {
        student_id: selectedStudent.id,
        pickup_stop: selectedStop,
      });

      setAssignedStudents(prev => [...prev, {
        id: data.id,
        student_id: selectedStudent.id,
        pickup_stop: selectedStop,
        students: {
          first_name: selectedStudent.first_name,
          last_name: selectedStudent.last_name,
          admission_no: selectedStudent.admission_no,
          class_name: selectedStudent.class_name,
        },
      }]);

      setRoutes(prev => prev.map(r => (
        r.id === selectedRouteId
          ? { ...r, assigned_count: (Number(r.assigned_count) || 0) + 1 }
          : r
      )));

      setSelectedStudent(null);
      setStudentSearch('');
      setStudentResults([]);
      setSelectedStop('');
      setShowAssignModal(false);
      notification.success('Student assigned!');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to assign student');
    } finally {
      setAssignSaving(false);
    }
  };

  // ─── Remove student from route ─────────────────────────────────────
  const handleRemoveStudentFromRoute = async (assignment) => {
    try {
      await api.delete(`/transport/assignments/${assignment.id}`);
      setAssignedStudents(prev => prev.filter(a => a.id !== assignment.id));
      setRoutes(prev => prev.map(r => (
        r.id === selectedRouteId
          ? { ...r, assigned_count: Math.max(0, (Number(r.assigned_count) || 0) - 1) }
          : r
      )));
      notification.success('Student removed from route');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to remove student');
    }
  };

  const selectedRouteObj = routes.find(r => r.id === selectedRouteId);

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-3xl font-bold text-white">Transport Management</h1>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-white/10">
          {['routes', 'assignment'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-medium rounded-t-lg capitalize transition ${
                activeTab === tab
                  ? 'bg-white/10 text-white border-b-2 border-neon-cyan'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              {tab === 'assignment' ? 'Student Assignment' : 'Routes'}
            </button>
          ))}
        </div>

        {/* ─── ROUTES TAB ────────────────────────────────────────────── */}
        {activeTab === 'routes' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <MdDirectionsBus className="text-neon-cyan" /> Routes ({routes.length})
              </h2>
              <Button variant="primary" onClick={() => openRouteModal()}>
                <MdAdd className="inline mr-1" /> Add Route
              </Button>
            </div>

            {routesLoading ? (
              <div className="text-center py-12 text-white/50">Loading routes...</div>
            ) : routes.length === 0 ? (
              <GlassCard className="p-10 text-center text-white/40">No routes configured yet.</GlassCard>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {routes.map(route => {
                  const studentCount = Number(route.assigned_count) || 0;
                  const capacity = route.capacity || 1;
                  const occupancy = Math.min(100, Math.round((studentCount / capacity) * 100));
                  return (
                    <GlassCard key={route.id} className="p-5">
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="text-white font-bold text-base">{route.route_name}</h3>
                        <div className="flex gap-1.5">
                          <button onClick={() => openRouteModal(route)} className="text-blue-400/70 hover:text-blue-400 transition">
                            <MdEdit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleToggleActive(route)} className={`transition ${route.is_active ? 'text-emerald-400' : 'text-gray-400'}`}>
                            {route.is_active ? <MdToggleOn className="w-5 h-5" /> : <MdToggleOff className="w-5 h-5" />}
                          </button>
                          <button onClick={() => handleDeleteRoute(route)} className="text-red-400/60 hover:text-red-400 transition">
                            <MdDelete className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-sm mb-3">
                        <div className="flex items-center gap-2 text-white/70">
                          <MdPerson className="w-4 h-4 shrink-0" />
                          <span>{route.driver_name || 'No driver assigned'}</span>
                        </div>
                        {route.driver_phone && (
                          <div className="flex items-center gap-2 text-white/60">
                            <MdPhone className="w-4 h-4 shrink-0" />
                            <span>{route.driver_phone}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-white/60">
                          <MdDirectionsBus className="w-4 h-4 shrink-0" />
                          <span>{route.vehicle_no || 'No vehicle'}</span>
                        </div>
                      </div>

                      {/* Capacity bar */}
                      <div className="mb-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-white/50">Students</span>
                          <span className="text-neon-cyan">{studentCount}/{capacity}</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${occupancy >= 90 ? 'bg-red-400' : occupancy >= 70 ? 'bg-amber-400' : 'bg-gradient-to-r from-primary-blue to-neon-cyan'}`}
                            style={{ width: `${occupancy}%` }}
                          />
                        </div>
                      </div>

                      {/* Stops */}
                      {route.stops && route.stops.length > 0 && (
                        <div>
                          <p className="text-white/40 text-xs mb-1.5 flex items-center gap-1">
                            <MdLocationOn className="w-3 h-3" /> {route.stops.length} stops
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {route.stops.slice(0, 4).map((stop, i) => (
                              <span key={i} className="px-1.5 py-0.5 text-xs bg-white/5 text-white/50 rounded">
                                {stopLabel(stop)}
                              </span>
                            ))}
                            {route.stops.length > 4 && (
                              <span className="px-1.5 py-0.5 text-xs bg-white/5 text-white/40 rounded">
                                +{route.stops.length - 4} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="mt-3 pt-3 border-t border-white/5">
                        <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                          route.is_active
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {route.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── STUDENT ASSIGNMENT TAB ────────────────────────────────── */}
        {activeTab === 'assignment' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="flex items-center gap-3">
                <label className="text-white/70 text-sm">Select Route:</label>
                <select
                  className="input-glass"
                  value={selectedRouteId}
                  onChange={e => setSelectedRouteId(e.target.value)}
                >
                  <option value="">-- Choose route --</option>
                  {routes.map(r => (
                    <option key={r.id} value={r.id}>{r.route_name}</option>
                  ))}
                </select>
              </div>
              {selectedRouteId && (
                <Button variant="primary" size="sm" onClick={() => setShowAssignModal(true)}>
                  <MdAdd className="inline mr-1" /> Assign Student
                </Button>
              )}
            </div>

            {selectedRouteId && selectedRouteObj && (
              <GlassCard className="p-4 flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="text-white/40 block text-xs">Driver</span>
                  <span className="text-white">{selectedRouteObj.driver_name || '—'}</span>
                </div>
                <div>
                  <span className="text-white/40 block text-xs">Vehicle</span>
                  <span className="text-white">{selectedRouteObj.vehicle_no || '—'}</span>
                </div>
                <div>
                  <span className="text-white/40 block text-xs">Capacity</span>
                  <span className="text-white">{assignedStudents.length}/{selectedRouteObj.capacity}</span>
                </div>
              </GlassCard>
            )}

            {selectedRouteId ? (
              assignLoading ? (
                <div className="text-center py-12 text-white/50">Loading students...</div>
              ) : (
                <GlassCard className="p-6">
                  <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                    <MdPerson className="text-neon-cyan" /> Assigned Students ({assignedStudents.length})
                  </h3>
                  {assignedStudents.length === 0 ? (
                    <p className="text-white/40 text-center py-6">No students assigned to this route yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-3 px-4 text-white/50">Student</th>
                            <th className="text-left py-3 px-4 text-white/50">Admission #</th>
                            <th className="text-left py-3 px-4 text-white/50">Class</th>
                            <th className="text-left py-3 px-4 text-white/50">Pickup Stop</th>
                            <th className="text-center py-3 px-4 text-white/50">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assignedStudents.map(assignment => (
                            <tr key={assignment.id} className="border-b border-white/5 hover:bg-white/3 transition">
                              <td className="py-3 px-4 text-white">
                                {assignment.students
                                  ? `${assignment.students.first_name} ${assignment.students.last_name}`
                                  : '—'}
                              </td>
                              <td className="py-3 px-4 text-white/70">
                                {assignment.students?.admission_no || '—'}
                              </td>
                              <td className="py-3 px-4 text-white/70">
                                {assignment.students?.class_name || '—'}
                              </td>
                              <td className="py-3 px-4">
                                <span className="px-2 py-0.5 text-xs bg-blue-500/15 text-blue-300 rounded">
                                  {assignment.pickup_stop || '—'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <button
                                  onClick={() => handleRemoveStudentFromRoute(assignment)}
                                  className="text-red-400/60 hover:text-red-400 transition"
                                >
                                  <MdDelete className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </GlassCard>
              )
            ) : (
              <GlassCard className="p-10 text-center text-white/30">
                <MdDirectionsBus className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Select a route to view assigned students</p>
              </GlassCard>
            )}
          </div>
        )}

        {/* ─── ADD/EDIT ROUTE MODAL ───────────────────────────────────── */}
        {/* Portalled to <body>: MainLayout's ancestors set `perspective` and
            `will-change: transform` for the 3D shell, which gives fixed-
            position descendants a new containing block instead of the
            viewport — an in-place backdrop here would land off-screen. */}
        {showRouteModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">
                  {editingRoute ? 'Edit Route' : 'Add New Route'}
                </h3>
                <button onClick={() => setShowRouteModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-0">
                <Input
                  label="Route Name" required
                  value={routeForm.route_name}
                  onChange={e => setRouteForm(f => ({ ...f, route_name: e.target.value }))}
                  placeholder="e.g. North Zone Route A"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Driver Name"
                    value={routeForm.driver_name}
                    onChange={e => setRouteForm(f => ({ ...f, driver_name: e.target.value }))}
                    placeholder="Driver name"
                  />
                  <Input
                    label="Driver Phone"
                    value={routeForm.driver_phone}
                    onChange={e => setRouteForm(f => ({ ...f, driver_phone: e.target.value }))}
                    placeholder="10-digit number"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Vehicle Number"
                    value={routeForm.vehicle_no}
                    onChange={e => setRouteForm(f => ({ ...f, vehicle_no: e.target.value }))}
                    placeholder="e.g. KA-01-AB-1234"
                  />
                  <Input
                    label="Capacity"
                    type="number"
                    value={routeForm.capacity}
                    onChange={e => setRouteForm(f => ({ ...f, capacity: e.target.value }))}
                    placeholder="Max students"
                  />
                </div>

                {/* Stops */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Stops</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      className="input-glass flex-1"
                      placeholder="Add a stop..."
                      value={newStop}
                      onChange={e => setNewStop(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddStop())}
                    />
                    <Button variant="secondary" size="sm" onClick={handleAddStop}>
                      <MdAdd />
                    </Button>
                  </div>
                  {routeForm.stops.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {routeForm.stops.map((stop, i) => (
                        <span key={i} className="flex items-center gap-1 px-2 py-1 bg-white/10 text-white/80 text-xs rounded-full">
                          <MdLocationOn className="w-3 h-3 text-neon-cyan" />
                          {stopLabel(stop)}
                          <button onClick={() => handleRemoveStop(i)} className="text-white/40 hover:text-white ml-0.5">
                            <MdClose className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="primary" loading={routeSaving} onClick={handleSaveRoute}>
                  {editingRoute ? 'Update Route' : 'Create Route'}
                </Button>
                <Button variant="secondary" onClick={() => setShowRouteModal(false)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}

        {/* ─── ASSIGN STUDENT MODAL ───────────────────────────────────── */}
        {showAssignModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Assign Student to Route</h3>
                <button onClick={() => setShowAssignModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>

              {/* Student search */}
              <div className="mb-4 relative">
                <label className="block text-sm font-medium mb-2">
                  Student <span className="text-red-400 ml-1">*</span>
                </label>
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

              {/* Stop selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  Pickup Stop <span className="text-red-400 ml-1">*</span>
                </label>
                <select
                  className="input-glass w-full"
                  value={selectedStop}
                  onChange={e => setSelectedStop(e.target.value)}
                >
                  <option value="">-- Select pickup stop --</option>
                  {(selectedRouteObj?.stops || []).map((stop, i) => (
                    <option key={i} value={stopLabel(stop)}>{stopLabel(stop)}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <Button variant="primary" loading={assignSaving} onClick={handleAssignStudent}>
                  Assign Student
                </Button>
                <Button variant="secondary" onClick={() => setShowAssignModal(false)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}
      </div>
    </MainLayout>
  );
}
