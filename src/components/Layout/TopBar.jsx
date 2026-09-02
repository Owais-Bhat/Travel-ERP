import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MdMenu, MdSettings, MdLogout, MdPerson, MdSearch,
  MdDarkMode, MdLightMode,
} from 'react-icons/md';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { canAccessPath } from '../../auth/permissions';
import NotificationBell from '../Common/NotificationBell';
import Avatar from '../Common/Avatar';
import { motion, AnimatePresence, spring } from '../Common/Motion';

export default function TopBar({ onMenuToggle, onSearchOpen }) {
  const navigate = useNavigate();
  const { user, logout, profile } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const role = profile?.role || user?.user_metadata?.role || 'student';
  const canOpenSettings = canAccessPath(role, '/settings');
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'User';

  useEffect(() => {
    if (!showDropdown) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setShowDropdown(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showDropdown]);

  const handleLogout = async () => {
    setShowDropdown(false);
    await logout();
    navigate('/login');
  };

  return (
    <header
      className="relative z-20 px-4 sm:px-6 py-3 flex items-center justify-between shrink-0"
      style={{ background: 'var(--neu-bg)', boxShadow: 'var(--neu-e1)' }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="neu-btn neu-btn-ghost neu-btn-icon upto-lg"
          aria-label="Toggle navigation"
        >
          <MdMenu className="w-5 h-5" />
        </button>

        <div>
          <h2
            className="text-base sm:text-lg font-bold font-display mb-0"
            style={{ color: 'var(--neu-ink)' }}
          >
            CyberMilo
          </h2>
          <p className="text-xs from-sm block mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
            Education operations workspace
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-2.5">
        {onSearchOpen && (
          <>
            <button
              onClick={onSearchOpen}
              className="from-md flex items-center gap-2.5 pl-3.5 pr-2 py-2 w-60 neu-inset"
              style={{ color: 'var(--neu-ink-muted)', fontSize: '0.875rem' }}
            >
              <MdSearch className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">Search anything…</span>
              <kbd
                className="text-[10px] font-bold rounded px-1.5 py-0.5"
                style={{ background: 'var(--neu-bg)', boxShadow: 'var(--neu-e1)', color: 'var(--neu-ink-muted)' }}
              >
                Ctrl K
              </kbd>
            </button>
            <button
              onClick={onSearchOpen}
              className="neu-btn neu-btn-ghost neu-btn-icon upto-md"
              aria-label="Search"
            >
              <MdSearch className="w-5 h-5" />
            </button>
          </>
        )}

        <button
          onClick={toggleTheme}
          className="neu-btn neu-btn-ghost neu-btn-icon"
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          title={isDark ? 'Light theme' : 'Dark theme'}
        >
          <motion.span
            key={isDark ? 'dark' : 'light'}
            initial={{ rotate: -70, opacity: 0, scale: 0.7 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            transition={spring}
            style={{ display: 'flex' }}
          >
            {isDark ? <MdLightMode className="w-5 h-5" /> : <MdDarkMode className="w-5 h-5" />}
          </motion.span>
        </button>

        <NotificationBell />

        {canOpenSettings && (
          <button
            onClick={() => navigate('/settings')}
            className="neu-btn neu-btn-ghost neu-btn-icon from-sm inline-flex"
            aria-label="Settings"
          >
            <MdSettings className="w-5 h-5" />
          </button>
        )}

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown((open) => !open)}
            className="neu-btn neu-btn-ghost flex items-center gap-2 !px-2 !py-1.5"
            aria-haspopup="menu"
            aria-expanded={showDropdown}
          >
            <Avatar name={fullName} src={profile?.avatar_url} size="sm" />
            <span
              className="text-sm font-semibold from-sm block"
              style={{ color: 'var(--neu-ink-soft)' }}
            >
              {profile?.first_name || 'User'}
            </span>
          </button>

          <AnimatePresence>
            {showDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
                <motion.div
                  role="menu"
                  className="absolute right-0 mt-3 w-60 z-50 neu-card !p-0 overflow-hidden"
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={spring}
                >
                  <div className="p-4" style={{ borderBottom: '1px solid var(--neu-line)' }}>
                    <p className="text-sm font-semibold mb-0" style={{ color: 'var(--neu-ink)' }}>
                      {fullName}
                    </p>
                    <p className="text-xs truncate mb-1" style={{ color: 'var(--neu-ink-muted)' }}>
                      {user?.email}
                    </p>
                    <span
                      className="text-xs capitalize font-semibold"
                      style={{ color: 'var(--neu-primary)' }}
                    >
                      {String(role).replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="p-2">
                    <button
                      role="menuitem"
                      onClick={() => { setShowDropdown(false); navigate('/profile'); }}
                      className="neu-btn neu-btn-ghost w-full !justify-start"
                    >
                      <MdPerson className="w-4 h-4" /> My profile
                    </button>

                    {canOpenSettings && (
                      <button
                        role="menuitem"
                        onClick={() => { setShowDropdown(false); navigate('/settings'); }}
                        className="neu-btn neu-btn-ghost w-full !justify-start"
                      >
                        <MdSettings className="w-4 h-4" /> Settings
                      </button>
                    )}

                    <div style={{ borderTop: '1px solid var(--neu-line)' }} className="mt-2 pt-2">
                      <button
                        role="menuitem"
                        onClick={handleLogout}
                        className="neu-btn neu-btn-ghost w-full !justify-start"
                        style={{ color: 'var(--neu-danger)' }}
                      >
                        <MdLogout className="w-4 h-4" /> Sign out
                      </button>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
