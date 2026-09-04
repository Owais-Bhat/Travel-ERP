import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAppData } from '../../hooks/useAppData';
import GlassCard from './GlassCard';

export default function FeatureGate({ feature, children }) {
  const { profile } = useAuth();
  const { institution, hasFeature } = useAppData();

  if (profile?.role === 'super_admin') {
    return children;
  }

  if (!feature || hasFeature(feature)) {
    return children;
  }

  // `institution` loads asynchronously (AppDataContext fetches it after the
  // profile resolves), so on a hard reload/direct link there's a window
  // where it's still null even though the tenant genuinely has this
  // feature. Only treat "no institution" as real once we've actually had a
  // profile with an institution_id and still come up empty — otherwise this
  // redirect fires on every fresh load before the fetch finishes, which
  // reads as "the feature you enabled isn't there" when it's just not
  // loaded yet.
  if (!institution) {
    if (profile?.institution_id) {
      return (
        <div className="min-h-screen bg-[#F7F8FB] flex items-center justify-center">
          <p className="text-slate-500">Loading...</p>
        </div>
      );
    }
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-[#F7F8FB] flex items-center justify-center p-6">
      <GlassCard className="max-w-lg p-8 text-center">
        <p className="text-[#0E7C7B] text-xs font-extrabold uppercase tracking-[0.18em] mb-3">
          Feature Locked
        </p>
        <h1 className="text-2xl font-bold text-slate-950 mb-3">This module is not enabled</h1>
        <p className="text-slate-500 mb-0">
          Ask your institution admin or CyberMilo Super Admin to enable this feature for your plan.
        </p>
      </GlassCard>
    </div>
  );
}
