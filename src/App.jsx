import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppDataProvider } from './context/AppDataContext';
import { NotificationProvider } from './context/NotificationContext';
import NotificationCenter from './components/Common/NotificationCenter';
import ProtectedRoute from './components/Common/ProtectedRoute';
import RoleGate from './components/Common/RoleGate';
import FeatureGate from './components/Common/FeatureGate';
import UsageTracker from './components/Common/UsageTracker';
import BillingGate from './components/Common/BillingGate';

// Auth Pages
import LoginPage from './pages/Auth/LoginPage';
import RegisterPage from './pages/Auth/RegisterPage';
import ForgotPasswordPage from './pages/Auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/Auth/ResetPasswordPage';

// Dashboard
import DashboardPage from './pages/Dashboard/DashboardPage';
import AdminConsolePage from './pages/Admin/AdminConsolePage';

// Module Pages
import StudentsPage from './pages/Modules/StudentsPage';
import FeesPage from './pages/Modules/FeesPage';
import AttendancePage from './pages/Modules/AttendancePage';
import ExamsPage from './pages/Modules/ExamsPage';
import LmsPage from './pages/Modules/LmsPage';
import CommunicationPage from './pages/Modules/CommunicationPage';
import TransportPage from './pages/Modules/TransportPage';
import LibraryPage from './pages/Modules/LibraryPage';
import HostelPage from './pages/Modules/HostelPage';
import InventoryPage from './pages/Modules/InventoryPage';
import PayrollPage from './pages/Modules/PayrollPage';
import VideoClassesPage from './pages/Modules/VideoClassesPage';
import ReportsBuilderPage from './pages/Modules/ReportsBuilderPage';
import AdmissionsPage from './pages/Modules/AdmissionsPage';

// EIMS Modules
import ProgramsPage from './pages/Modules/ProgramsPage';
import CertificationsPage from './pages/Modules/CertificationsPage';
import ScholarshipsPage from './pages/Modules/ScholarshipsPage';
import ReferralsPage from './pages/Modules/ReferralsPage';
import LeadsPage from './pages/Modules/LeadsPage';
import DocumentsPage from './pages/Modules/DocumentsPage';
import ReportsPage from './pages/Modules/ReportsPage';

// AI Pages
import AiTutorPage from './pages/AI/AiTutorPage';
import CareerPathPage from './pages/AI/CareerPathPage';
import PerformanceAnalysisPage from './pages/AI/PerformanceAnalysisPage';
import FeeRecoveryPage from './pages/AI/FeeRecoveryPage';

// Settings & Profile
import SettingsPage from './pages/Settings/SettingsPage';
import ProfilePage from './pages/Profile/ProfilePage';

function GuardedPage({ path, feature, billing = true, children }) {
  let page = children;

  if (feature) {
    page = <FeatureGate feature={feature}>{page}</FeatureGate>;
  }

  if (billing) {
    page = <BillingGate>{page}</BillingGate>;
  }

  return (
    <ProtectedRoute>
      <RoleGate path={path}>{page}</RoleGate>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppDataProvider>
          <NotificationProvider>
            <NotificationCenter />
            <UsageTracker />
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              {/* Protected routes */}
              <Route
                path="/dashboard"
                element={
                  <GuardedPage path="/dashboard">
                    <DashboardPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/admin"
                element={
                  <GuardedPage path="/admin" billing={false}>
                    <AdminConsolePage />
                  </GuardedPage>
                }
              />
              <Route
                path="/admin/:tab"
                element={
                  <GuardedPage path="/admin" billing={false}>
                    <AdminConsolePage />
                  </GuardedPage>
                }
              />

              {/* Module Routes */}
              <Route
                path="/students"
                element={
                  <GuardedPage path="/students" feature="students">
                    <StudentsPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/fees"
                element={
                  <GuardedPage path="/fees" feature="fees">
                    <FeesPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/attendance"
                element={
                  <GuardedPage path="/attendance" feature="attendance">
                    <AttendancePage />
                  </GuardedPage>
                }
              />
              <Route
                path="/exams"
                element={
                  <GuardedPage path="/exams" feature="exams">
                    <ExamsPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/lms"
                element={
                  <GuardedPage path="/lms" feature="lms">
                    <LmsPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/communication"
                element={
                  <GuardedPage path="/communication" feature="communication">
                    <CommunicationPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/transport"
                element={
                  <GuardedPage path="/transport" feature="transport">
                    <TransportPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/hostel"
                element={
                  <GuardedPage path="/hostel" feature="hostel">
                    <HostelPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/library"
                element={
                  <GuardedPage path="/library" feature="library">
                    <LibraryPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/inventory"
                element={
                  <GuardedPage path="/inventory" feature="inventory">
                    <InventoryPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/payroll"
                element={
                  <GuardedPage path="/payroll" feature="payroll">
                    <PayrollPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/video-classes"
                element={
                  <GuardedPage path="/video-classes" feature="video_classes">
                    <VideoClassesPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/reports-builder"
                element={
                  <GuardedPage path="/reports-builder" feature="reports_builder">
                    <ReportsBuilderPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/admissions"
                element={
                  <GuardedPage path="/admissions" feature="admissions">
                    <AdmissionsPage />
                  </GuardedPage>
                }
              />

              {/* EIMS Module Routes */}
              <Route
                path="/programs"
                element={
                  <GuardedPage path="/programs" feature="programs">
                    <ProgramsPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/certifications"
                element={
                  <GuardedPage path="/certifications" feature="certifications">
                    <CertificationsPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/scholarships"
                element={
                  <GuardedPage path="/scholarships" feature="scholarships">
                    <ScholarshipsPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/referrals"
                element={
                  <GuardedPage path="/referrals" feature="referrals">
                    <ReferralsPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/leads"
                element={
                  <GuardedPage path="/leads" feature="leads">
                    <LeadsPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/documents"
                element={
                  <GuardedPage path="/documents" feature="documents">
                    <DocumentsPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/reports"
                element={
                  <GuardedPage path="/reports" feature="reports">
                    <ReportsPage />
                  </GuardedPage>
                }
              />

              {/* AI Routes */}
              <Route
                path="/ai-tutor"
                element={
                  <GuardedPage path="/ai-tutor" feature="ai_tutor">
                    <AiTutorPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/career-path"
                element={
                  <GuardedPage path="/career-path" feature="career_path">
                    <CareerPathPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/performance-analysis"
                element={
                  <GuardedPage path="/performance-analysis" feature="performance_analysis">
                    <PerformanceAnalysisPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/fee-recovery"
                element={
                  <GuardedPage path="/fee-recovery" feature="fee_recovery">
                    <FeeRecoveryPage />
                  </GuardedPage>
                }
              />

              {/* Settings & Profile */}
              <Route
                path="/settings"
                element={
                  <GuardedPage path="/settings" billing={false}>
                    <SettingsPage />
                  </GuardedPage>
                }
              />
              <Route
                path="/profile"
                element={
                  <GuardedPage path="/profile" billing={false}>
                    <ProfilePage />
                  </GuardedPage>
                }
              />

              {/* Redirect root to dashboard */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />

              {/* Catch all - redirect to login */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </NotificationProvider>
        </AppDataProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
