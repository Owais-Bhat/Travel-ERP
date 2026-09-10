import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAppData } from '../../hooks/useAppData';
import { canAccessPath } from '../../auth/permissions';
import GlassCard from './GlassCard';

export default function RoleGate({ path, children }) {
  const location = useLocation();
  const { profile, user, loading } = useAuth();
  const { institution } = useAppData();
  const role = profile?.role || user?.user_metadata?.role;
  const routePath = path || location.pathname;

  if (loading || !role) {
    return (
      <div className="min-h-screen bg-[#F7F8FB] flex items-center justify-center">
        <p className="text-slate-500">Loading permissions...</p>
      </div>
    );
  }

  // The static per-role list is available immediately and covers most
  // routes — check that first so a normal page doesn't wait on anything.
  // Only a route the static list DOESN'T cover needs `institution` (an
  // admin-granted extra beyond the role's baseline, see canAccessPath),
  // and that loads asynchronously right after the profile resolves — on a
  // hard reload/direct link there's a real window where it's still null
  // even though the tenant genuinely granted this route. Wait for it
  // rather than redirect away from a page the admin just enabled.
  if (canAccessPath(role, routePath)) {
    return children;
  }
  if (!institution && profile?.institution_id) {
    return (
      <div className="min-h-screen bg-[#F7F8FB] flex items-center justify-center">
        <p className="text-slate-500">Loading permissions...</p>
      </div>
    );
  }
  if (canAccessPath(role, routePath, institution)) {
    return children;
  }

  if (role === 'super_admin') {
    return <Navigate to="/admin" replace />;
  }

  if (routePath !== '/dashboard' && canAccessPath(role, '/dashboard', institution)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-[#F7F8FB] flex items-center justify-center p-6">
      <GlassCard className="max-w-lg p-8 text-center">
        <p className="text-[#E0644A] text-xs font-extrabold uppercase tracking-[0.18em] mb-3">
          Access Restricted
        </p>
        <h1 className="text-2xl font-bold text-slate-950 mb-3">This role cannot open this page</h1>
        <p className="text-slate-500 mb-0">
          Ask an institution admin to update your role if you need access.
        </p>
      </GlassCard>
    </div>
  );
}
