import { createContext, useState, useEffect, useContext, useCallback } from 'react';
import api from '../lib/api';
import { AuthContext } from './AuthContext';
import { getPlanFeatureMap, isFeatureEnabledForRole } from '../saas/features';

export const AppDataContext = createContext();

export function AppDataProvider({ children }) {
  const { profile } = useContext(AuthContext);

  // ── Core entity state ──────────────────────────────────────
  const [institution, setInstitution]   = useState(null);
  const [students, setStudents]         = useState([]);
  const [teachers, setTeachers]         = useState([]);
  const [classes, setClasses]           = useState([]);

  // ── Extended entity state ──────────────────────────────────
  const [fees, setFees]                 = useState([]);
  const [exams, setExams]               = useState([]);
  const [admissions, setAdmissions]     = useState([]);
  const [attendance, setAttendance]     = useState([]);
  const [dashboardData, setDashboardData] = useState(null);

  // ── UI state ───────────────────────────────────────────────
  const [isLoading, setIsLoading]       = useState(false);
  const [error, setError]               = useState(null);

  // ============================================================
  // Auto-load core data whenever the profile's institution changes
  // ============================================================
  useEffect(() => {
    const institutionId = profile?.institution_id;
    if (!institutionId) return;

    const bootstrap = async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          _loadInstitution(),
          _loadStudents(),
          _loadTeachers(),
          _loadClasses(),
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.institution_id]);

  // ============================================================
  // Private loaders (used inside the provider only)
  // ============================================================

  const _loadInstitution = async () => {
    const { data } = await api.get('/institutions/current');
    setInstitution(data);
  };

  const _loadStudents = async () => {
    const { data } = await api.get('/students');
    setStudents(data || []);
  };

  const _loadTeachers = async () => {
    const { data } = await api.get('/teachers');
    setTeachers(data || []);
  };

  const _loadClasses = async () => {
    const { data } = await api.get('/classes');
    setClasses(data || []);
  };

  // ============================================================
  // Public loaders (callable by consumers)
  // ============================================================

  const loadInstitution = useCallback(async () => {
    if (!profile?.institution_id) return;
    try {
      setIsLoading(true);
      await _loadInstitution();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setIsLoading(false);
    }
  }, [profile?.institution_id]);

  const loadStudents = useCallback(async () => {
    if (!profile?.institution_id) return;
    try {
      setIsLoading(true);
      await _loadStudents();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setIsLoading(false);
    }
  }, [profile?.institution_id]);

  const loadTeachers = useCallback(async () => {
    if (!profile?.institution_id) return;
    try {
      setIsLoading(true);
      await _loadTeachers();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setIsLoading(false);
    }
  }, [profile?.institution_id]);

  const loadClasses = useCallback(async () => {
    if (!profile?.institution_id) return;
    try {
      setIsLoading(true);
      await _loadClasses();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setIsLoading(false);
    }
  }, [profile?.institution_id]);

  // ── Dashboard ──────────────────────────────────────────────

  const loadDashboard = useCallback(async () => {
    if (!profile?.institution_id) return;
    try {
      setIsLoading(true);
      const { data } = await api.get('/dashboard/stats');
      setDashboardData(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setIsLoading(false);
    }
  }, [profile?.institution_id]);

  // ── Attendance ─────────────────────────────────────────────

  const loadAttendance = useCallback(async (date) => {
    if (!profile?.institution_id || !date) return;
    try {
      setIsLoading(true);
      const { data } = await api.get('/attendance', { params: { date } });
      setAttendance(data || []);
      return data || [];
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [profile?.institution_id]);

  const markAttendance = useCallback(async (records) => {
    try {
      setIsLoading(true);
      const { data } = await api.post('/attendance/mark', { records });
      return { success: true, data };
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Students CRUD ──────────────────────────────────────────

  const addStudent = useCallback(async (studentData) => {
    try {
      setIsLoading(true);
      const { data } = await api.post('/students', studentData);
      setStudents(prev => [data, ...prev]);
      return { success: true, data };
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateStudent = useCallback(async (id, updates) => {
    try {
      setIsLoading(true);
      const { data } = await api.put(`/students/${id}`, updates);
      setStudents(prev => prev.map(s => s.id === id ? data : s));
      return { success: true, data };
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteStudent = useCallback(async (id) => {
    try {
      setIsLoading(true);
      await api.delete(`/students/${id}`);
      setStudents(prev => prev.filter(s => s.id !== id));
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Teachers CRUD ──────────────────────────────────────────

  const addTeacher = useCallback(async (teacherData) => {
    try {
      setIsLoading(true);
      const { data } = await api.post('/teachers', teacherData);
      setTeachers(prev => [data, ...prev]);
      return { success: true, data };
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteTeacher = useCallback(async (id) => {
    try {
      setIsLoading(true);
      await api.delete(`/teachers/${id}`);
      setTeachers(prev => prev.filter(t => t.id !== id));
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Fees ───────────────────────────────────────────────────

  const loadFees = useCallback(async () => {
    if (!profile?.institution_id) return;
    try {
      setIsLoading(true);
      const { data } = await api.get('/fees');
      setFees(data || []);
      return data || [];
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [profile?.institution_id]);

  const addFeePayment = useCallback(async (feeData) => {
    try {
      setIsLoading(true);
      const { data } = await api.post('/fees', feeData);
      setFees(prev => [data, ...prev]);
      return { success: true, data };
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateFeePayment = useCallback(async (id, updates) => {
    try {
      setIsLoading(true);
      const { data } = await api.put(`/fees/${id}`, updates);
      setFees(prev => prev.map(f => f.id === id ? data : f));
      return { success: true, data };
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Exams ──────────────────────────────────────────────────

  const loadExams = useCallback(async () => {
    if (!profile?.institution_id) return;
    try {
      setIsLoading(true);
      const { data } = await api.get('/exams');
      setExams(data || []);
      return data || [];
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [profile?.institution_id]);

  const addExam = useCallback(async (examData) => {
    try {
      setIsLoading(true);
      const { data } = await api.post('/exams', examData);
      setExams(prev => [data, ...prev]);
      return { success: true, data };
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateExam = useCallback(async (id, updates) => {
    try {
      setIsLoading(true);
      const { data } = await api.put(`/exams/${id}`, updates);
      setExams(prev => prev.map(e => e.id === id ? data : e));
      return { success: true, data };
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Admissions ─────────────────────────────────────────────

  const loadAdmissions = useCallback(async () => {
    if (!profile?.institution_id) return;
    try {
      setIsLoading(true);
      const { data } = await api.get('/admissions');
      setAdmissions(data || []);
      return data || [];
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [profile?.institution_id]);

  const addAdmission = useCallback(async (admissionData) => {
    try {
      setIsLoading(true);
      const { data } = await api.post('/admissions', admissionData);
      setAdmissions(prev => [data, ...prev]);
      return { success: true, data };
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateAdmission = useCallback(async (id, updates) => {
    try {
      setIsLoading(true);
      const { data } = await api.put(`/admissions/${id}`, updates);
      setAdmissions(prev => prev.map(a => a.id === id ? data : a));
      return { success: true, data };
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Activity Log ───────────────────────────────────────────

  const logActivity = useCallback(async (action, description, entity_type = null, entity_id = null) => {
    if (!profile?.institution_id) return;
    try {
      await api.post('/activity', { action, description, entity_type, entity_id });
    } catch (err) {
      // Activity logging is non-critical — swallow the error silently
      console.warn('logActivity failed:', err.message);
    }
  }, [profile?.institution_id]);

  const featureMap = getPlanFeatureMap(
    institution?.subscription_plan || 'free',
    institution?.settings?.modules || {}
  );
  const hasFeature = useCallback(
    (featureKey) => isFeatureEnabledForRole(institution, profile?.role, featureKey),
    [institution, profile?.role]
  );

  // ── Context value ──────────────────────────────────────────

  const value = {
    // State
    institution,
    students,
    teachers,
    classes,
    fees,
    exams,
    admissions,
    attendance,
    dashboardData,
    featureMap,
    hasFeature,
    isLoading,
    error,

    // Loaders
    loadInstitution,
    loadStudents,
    loadTeachers,
    loadClasses,
    loadDashboard,
    loadAttendance,
    loadFees,
    loadExams,
    loadAdmissions,

    // Student CRUD
    addStudent,
    updateStudent,
    deleteStudent,

    // Teacher CRUD
    addTeacher,
    deleteTeacher,

    // Attendance
    markAttendance,

    // Fee CRUD
    addFeePayment,
    updateFeePayment,

    // Exam CRUD
    addExam,
    updateExam,

    // Admission CRUD
    addAdmission,
    updateAdmission,

    // Activity log
    logActivity,

    // Legacy setters (kept for backward compatibility)
    setStudents,
    setTeachers,
    setClasses,
  };

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
}
