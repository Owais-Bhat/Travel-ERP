import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAppData } from '../../hooks/useAppData';
import { MENU_ITEMS } from '../../config';
import { canAccessPath } from '../../auth/permissions';
import { getFeatureByRoute } from '../../saas/features';
import Avatar from '../Common/Avatar';
import { motion, AnimatePresence, spring } from '../Common/Motion';
import {
  MdClose, MdChevronRight,
  MdDashboard, MdBusiness, MdCreditCard, MdTrendingUp, MdSettings,
  MdPeople, MdPerson, MdAccountBalance, MdAccessTime, MdBook,
  MdDirectionsBus, MdChat, MdBarChart, MdAutoAwesome, MdSchool,
  MdGrade, MdNotifications, MdLogout, MdLightbulb, MdAdminPanelSettings,
  MdWorkspacePremium, MdCardGiftcard, MdHandshake, MdContactPhone,
  MdFolderShared, MdAssessment, MdMenuBook, MdBadge, MdCalendarMonth,
  MdGavel, MdEventBusy, MdMeetingRoom,
} from 'react-icons/md';

const ICON_MAP = {
  MdDashboard, MdBusiness, MdCreditCard, MdTrendingUp, MdSettings,
  MdPeople, MdPerson, MdAccountBalance, MdAccessTime, MdBook,
  MdDirectionsBus, MdChat, MdBarChart, MdAutoAwesome, MdSchool,
  MdGrade, MdNotifications, MdLogout, MdLightbulb, MdAdminPanelSettings,
  MdWorkspacePremium, MdCardGiftcard, MdHandshake, MdContactPhone,
  MdFolderShared, MdAssessment, MdMenuBook, MdBadge, MdCalendarMonth,
  MdGavel, MdEventBusy, MdMeetingRoom,
};

/**
 * Navigation rail.
 *
 * Nav items are carved wells when active and flush when not, so the current
 * location reads as pressed into the material — the same affordance the
 * buttons use, applied to state rather than interaction.
 */
export default function Sidebar({ isOpen, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, logout } = useAuth();
  const { institution, hasFeature } = useAppData();
  const [expanded, setExpanded] = useState({});

  const role = profile?.role || user?.user_metadata?.role || 'student';
  const isSuperAdmin = role === 'super_admin';
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'User';

  // Custom branding: a tenant's own logo/primary color, when they've set
  // one in Settings > Branding. Super admin always sees the stock mark —
  // branding is a tenant-level concept, not a platform one.
  const brandLogoUrl = !isSuperAdmin ? institution?.logo_url : null;
  const brandPrimaryColor = !isSuperAdmin ? institution?.settings?.branding?.primary_color : null;

  useEffect(() => {
    const root = document.documentElement;
    if (brandPrimaryColor) {
      root.style.setProperty('--neu-primary', brandPrimaryColor);
    } else {
      root.style.removeProperty('--neu-primary');
    }
    return () => root.style.removeProperty('--neu-primary');
  }, [brandPrimaryColor]);

  const canShowPath = (path) => {
    if (!canAccessPath(role, path)) return false;
    if (isSuperAdmin) return true;
    const feature = getFeatureByRoute(path);
    return !feature || !institution || hasFeature(feature.key);
  };

  const filterMenuItem = (item) => {
    if (item.subItems) {
      const subItems = item.subItems.filter((sub) => canShowPath(sub.path));
      return subItems.length ? { ...item, subItems } : null;
    }
    return canShowPath(item.path) ? item : null;
  };

  const menuItems = (MENU_ITEMS[role] || MENU_ITEMS.student)
    .map(filterMenuItem)
    .filter(Boolean);

  const isActive = (path) => location.pathname === path;
  const hasActive = (subs) => subs?.some((sub) => location.pathname === sub.path);

  // Open whichever group contains the current route.
  useEffect(() => {
    const owner = menuItems.find((item) => item.subItems && hasActive(item.subItems));
    if (owner) setExpanded((state) => ({ ...state, [owner.key]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const go = (path) => {
    navigate(path);
    if (window.innerWidth < 1024) onClose();
  };

  const getIcon = (name) => {
    const Icon = ICON_MAP[name];
    return Icon ? <Icon className="w-5 h-5" /> : null;
  };

  const activeStyle = {
    boxShadow: 'var(--neu-inset)',
    color: isSuperAdmin ? 'var(--neu-violet)' : 'var(--neu-primary)',
    fontWeight: 700,
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 upto-lg z-40"
            style={{ background: 'color-mix(in srgb, var(--neu-bg-deep) 70%, transparent)', backdropFilter: 'blur(6px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 flex flex-col shrink-0
          transform transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        style={{ background: 'var(--neu-bg)', boxShadow: 'var(--neu-e2)' }}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-5 py-5 shrink-0">
          <div className="flex items-center gap-3">
            {brandLogoUrl ? (
              <img
                src={brandLogoUrl}
                alt="Institution logo"
                className="w-10 h-10 rounded-2xl object-cover shrink-0"
                style={{ boxShadow: 'var(--neu-e2)' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                style={{
                  background: isSuperAdmin
                    ? 'linear-gradient(145deg, var(--neu-violet), var(--neu-primary))'
                    : 'linear-gradient(145deg, var(--neu-teal), var(--neu-primary))',
                  boxShadow: 'var(--neu-e2)',
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white">
                  <path d="M12 3L2 8l10 5 10-5-10-5z" fill="currentColor" opacity="0.92" />
                  <path d="M2 16l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
            )}
            <div>
              <span
                className="text-base font-bold font-display tracking-tight"
                style={{ color: 'var(--neu-ink)' }}
              >
                {isSuperAdmin ? 'CyberMilo HQ' : 'CyberMilo'}
              </span>
              {isSuperAdmin && (
                <p
                  className="text-[10px] uppercase tracking-[0.18em] mb-0"
                  style={{ color: 'var(--neu-violet)' }}
                >
                  Platform
                </p>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="neu-btn neu-btn-ghost neu-btn-icon upto-lg"
            aria-label="Close navigation"
          >
            <MdClose className="w-5 h-5" />
          </button>
        </div>

        {/* Who am I */}
        <div className="px-4 pb-4 shrink-0">
          <button
            onClick={() => go('/profile')}
            className="w-full flex items-center gap-3 p-2.5 neu-inset"
            style={{ borderRadius: 'var(--neu-radius)' }}
          >
            <Avatar name={fullName} src={profile?.avatar_url} size="sm" />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold truncate mb-0" style={{ color: 'var(--neu-ink)' }}>
                {fullName}
              </p>
              <p className="text-xs capitalize truncate mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
                {isSuperAdmin ? 'Platform owner' : String(role).replace(/_/g, ' ')}
              </p>
            </div>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
          {menuItems.map((item) => (
            <div key={item.key}>
              {item.subItems ? (
                <>
                  <button
                    onClick={() => setExpanded((state) => ({ ...state, [item.key]: !state[item.key] }))}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm transition-all"
                    style={{
                      borderRadius: 'var(--neu-radius)',
                      color: 'var(--neu-ink-soft)',
                      ...(hasActive(item.subItems) ? activeStyle : {}),
                    }}
                    aria-expanded={Boolean(expanded[item.key])}
                  >
                    <span className="flex items-center gap-3">
                      {getIcon(item.iconName)}
                      <span>{item.label}</span>
                    </span>
                    <MdChevronRight
                      className={`w-4 h-4 transition-transform duration-200 ${expanded[item.key] ? 'rotate-90' : ''}`}
                    />
                  </button>

                  <AnimatePresence initial={false}>
                    {expanded[item.key] && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <div
                          className="mt-1 ml-5 pl-3 space-y-1 pb-1"
                          style={{ borderLeft: '1px solid var(--neu-line)' }}
                        >
                          {item.subItems.map((sub) => (
                            <button
                              key={sub.key}
                              onClick={() => go(sub.path)}
                              className="w-full text-left px-3 py-2 text-sm transition-all"
                              style={{
                                borderRadius: 'var(--neu-radius-sm)',
                                color: 'var(--neu-ink-muted)',
                                ...(isActive(sub.path) ? activeStyle : {}),
                              }}
                            >
                              {sub.label}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <button
                  onClick={() => go(item.path)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-all"
                  style={{
                    borderRadius: 'var(--neu-radius)',
                    color: 'var(--neu-ink-soft)',
                    ...(isActive(item.path) ? activeStyle : {}),
                  }}
                  aria-current={isActive(item.path) ? 'page' : undefined}
                >
                  {getIcon(item.iconName)}
                  <span>{item.label}</span>
                  {isActive(item.path) && (
                    <motion.span
                      layoutId="nav-active-dot"
                      transition={spring}
                      className="ml-auto w-1.5 h-1.5 rounded-full"
                      style={{ background: 'currentColor' }}
                    />
                  )}
                </button>
              )}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 pb-4 pt-3 shrink-0" style={{ borderTop: '1px solid var(--neu-line)' }}>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="neu-btn neu-btn-ghost w-full !justify-start"
            style={{ color: 'var(--neu-ink-muted)' }}
          >
            <MdLogout className="w-5 h-5" />
            <span>Sign out</span>
          </button>
          <p className="text-center text-xs mt-3 mb-0" style={{ color: 'var(--neu-ink-muted)', opacity: 0.7 }}>
            {isSuperAdmin ? 'CyberMilo SaaS Console' : 'CyberMilo ERP v1.0'}
          </p>
        </div>
      </aside>
    </>
  );
}
