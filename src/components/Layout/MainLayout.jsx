import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import TopBar from './TopBar';
import Sidebar from './Sidebar';
import CommandPalette from '../Common/CommandPalette';
import { DepthField, PageTransition, AnimatePresence } from '../Common/Motion';

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
