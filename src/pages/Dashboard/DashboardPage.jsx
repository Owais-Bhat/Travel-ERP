import MainLayout from '../../components/Layout/MainLayout';
import { useAuth } from '../../hooks/useAuth';
import AdminDashboard from './AdminDashboard';
import TeacherDashboard from './TeacherDashboard';
import StudentDashboard from './StudentDashboard';
import ParentDashboard from './ParentDashboard';

const DASHBOARD_BY_ROLE = {
  institution_admin: AdminDashboard,
  principal: AdminDashboard,
  staff: AdminDashboard,
  super_admin: AdminDashboard,
  teacher: TeacherDashboard,
  student: StudentDashboard,
  parent: ParentDashboard,
};

export default function DashboardPage() {
  const { profile } = useAuth();
  const Dashboard = DASHBOARD_BY_ROLE[profile?.role] || AdminDashboard;

  return (
    <MainLayout>
      <Dashboard profile={profile} />
    </MainLayout>
  );
}
