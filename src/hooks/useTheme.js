import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'cybermilo_theme';

function readStoredTheme() {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    // Private mode / blocked storage — fall back to the system preference.
    return null;
  }
}

function systemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Light/dark switch for the neumorphic palette.
 *
 * Writes `data-theme` on <html>, which is what neumorphism.css keys off.
 * An explicit choice is remembered; with no choice the OS preference wins
 * and keeps tracking it.
 */
export function useTheme() {
  const [theme, setThemeState] = useState(() => readStoredTheme() || systemTheme());
  const [isExplicit, setIsExplicit] = useState(() => readStoredTheme() !== null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    // Keeps form controls and scrollbars in the matching scheme.
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    if (isExplicit || typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event) => setThemeState(event.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [isExplicit]);

  const setTheme = useCallback((next) => {
    setThemeState(next);
    setIsExplicit(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not fatal — the theme just will not survive a reload.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme, isDark: theme === 'dark' };
}

export default useTheme;
