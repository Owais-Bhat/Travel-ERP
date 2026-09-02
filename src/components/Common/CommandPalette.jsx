import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { MdSearch, MdLogout, MdPerson, MdSubdirectoryArrowLeft } from 'react-icons/md';
import { useAuth } from '../../hooks/useAuth';
import { useAppData } from '../../hooks/useAppData';
import { MENU_ITEMS } from '../../config';
import { canAccessPath } from '../../auth/permissions';
import { getFeatureByRoute } from '../../saas/features';

function flattenMenu(items) {
  const out = [];
  for (const item of items) {
    if (item.subItems) {
      for (const sub of item.subItems) {
        out.push({ key: `${item.key}.${sub.key}`, label: sub.label, group: item.label, path: sub.path });
      }
    } else {
      out.push({ key: item.key, label: item.label, group: 'Pages', path: item.path });
    }
  }
  return out;
}

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const { user, profile, logout } = useAuth();
  const { institution, hasFeature } = useAppData();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const role = profile?.role || user?.user_metadata?.role || 'student';
  const isSuperAdmin = role === 'super_admin';

  const commands = useMemo(() => {
    const canShowPath = (path) => {
      if (!canAccessPath(role, path)) return false;
      if (isSuperAdmin) return true;
      const feature = getFeatureByRoute(path);
      return !feature || !institution || hasFeature(feature.key);
    };

    const navCommands = flattenMenu(MENU_ITEMS[role] || MENU_ITEMS.student)
      .filter(cmd => canShowPath(cmd.path))
      .map(cmd => ({ ...cmd, run: () => navigate(cmd.path) }));

    return [
      ...navCommands,
      { key: 'profile', label: 'My Profile', group: 'Account', icon: MdPerson, run: () => navigate('/profile') },
      { key: 'logout', label: 'Sign Out', group: 'Account', icon: MdLogout, run: async () => { await logout(); navigate('/login'); } },
    ];
  }, [role, isSuperAdmin, institution, hasFeature, navigate, logout]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(cmd =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.group.toLowerCase().includes(q) ||
      (cmd.path || '').toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // Focus after the panel mounts
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => { setActiveIndex(0); }, [query]);

  useEffect(() => {
    const node = listRef.current?.children?.[activeIndex];
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  const runCommand = (cmd) => {
    onClose();
    cmd.run();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[activeIndex]) runCommand(filtered[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // Group results for section headers, preserving filter order
  const grouped = filtered.reduce((acc, cmd) => {
    (acc[cmd.group] = acc[cmd.group] || []).push(cmd);
    return acc;
  }, {});

  // Portalled to <body>: MainLayout's ancestors set `perspective` and
  // `will-change: transform` for the 3D shell, which gives fixed-position
  // descendants a new containing block instead of the viewport.
  return createPortal(
    <div
      className="fixed inset-0 z-[1100] flex items-start justify-center px-4 pt-[12vh] bg-slate-950/45 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-scale-in">
        <div className="flex items-center gap-3 px-4 border-b border-slate-200">
          <MdSearch className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages and actions..."
            className="flex-1 py-4 text-sm text-slate-900 placeholder-slate-400 bg-transparent outline-none"
          />
          <kbd className="from-sm block text-[10px] font-bold text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8 mb-0">
              No results for "{query}"
            </p>
          ) : (
            Object.entries(grouped).map(([group, cmds]) => (
              <div key={group}>
                <p className="px-3 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400 mb-0">
                  {group}
                </p>
                {cmds.map((cmd) => {
                  const index = filtered.indexOf(cmd);
                  const isActive = index === activeIndex;
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.key}
                      type="button"
                      onClick={() => runCommand(cmd)}
                      onMouseMove={() => setActiveIndex(index)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${
                        isActive ? 'bg-[#EEF7F6] text-[#0E7C7B]' : 'text-slate-600'
                      }`}
                    >
                      {Icon && <Icon className="w-4 h-4 shrink-0" />}
                      <span className="flex-1 font-semibold truncate">{cmd.label}</span>
                      {cmd.path && <span className="text-xs text-slate-400 truncate">{cmd.path}</span>}
                      {isActive && <MdSubdirectoryArrowLeft className="w-4 h-4 shrink-0 opacity-60" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-400">
          <span><kbd className="font-bold">&uarr;&darr;</kbd> navigate</span>
          <span><kbd className="font-bold">&crarr;</kbd> open</span>
          <span className="ml-auto">CyberMilo quick search</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
