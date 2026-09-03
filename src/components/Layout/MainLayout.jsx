import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MdLogout } from 'react-icons/md';
import TopBar from './TopBar';
import Sidebar from './Sidebar';
import CommandPalette from '../Common/CommandPalette';
import { DepthField, PageTransition, AnimatePresence } from '../Common/Motion';
import { setToken } from '../../lib/api';

const IMPERSONATION_TOKEN_KEY = 'cybermilo_impersonation_origin_token';
const IMPERSONATION_NAME_KEY = 'cybermilo_impersonation_origin_name';

/** Banner shown while viewing the app as an impersonated tenant admin. */
function ImpersonationBanner() {
  const originName = sessionStorage.getItem(IMPERSONATION_NAME_KEY);
  if (!sessionStorage.getItem(IMPERSONATION_TOKEN_KEY)) return null;

  const exit = () => {
    const originToken = sessionStorage.getItem(IMPERSONATION_TOKEN_KEY);
    sessionStorage.removeItem(IMPERSONATION_TOKEN_KEY);
    sessionStorage.removeItem(IMPERSONATION_NAME_KEY);
    setToken(originToken);
    window.location.href = '/admin/institutions';
  };

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2 text-sm font-semibold shrink-0"
      style={{ background: 'var(--neu-amber)', color: '#1a1200' }}
    >
      <span>Viewing as {originName || 'a tenant admin'} — support session in progress.</span>
      <button
        type="button"
        onClick={exit}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1 font-bold"
        style={{ background: 'rgba(0,0,0,0.12)' }}
      >
        <MdLogout className="w-4 h-4" /> Exit impersonation
      </button>
    </div>
  );
}

/**
 * App shell.
 *
 * The whole shell is one 3D scene: the sidebar and top bar sit on the front
 * plane, ambient shapes drift behind, and routed content transitions in on
 * its own Z plane.
 */
export default function MainLayout({ children }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const contentRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close the drawer whenever the route changes on mobile, and start each
  // route at the top — the content region scrolls, not the window, so a new
  // page would otherwise open at the previous page's scroll offset.
  useEffect(() => {
    setSidebarOpen(false);
    contentRef.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [location.pathname]);

  return (
    <div
      className="scene flex h-screen overflow-hidden"
      style={{ background: 'var(--neu-bg)', color: 'var(--neu-ink)' }}
    >
      <DepthField />

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
        <ImpersonationBanner />
        <TopBar
          onMenuToggle={() => setSidebarOpen((open) => !open)}
          onSearchOpen={() => setPaletteOpen(true)}
        />

        <main ref={contentRef} className="app-content layer-3d flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <PageTransition key={location.pathname}>{children}</PageTransition>
          </AnimatePresence>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
