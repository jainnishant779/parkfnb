/**
 * Light or dark, the way the operator console does it (ai/anpr/static/js/theme.js): light unless the person picked dark, remembered in
 * this browser under the same key, so one choice covers the console and this dashboard. The CSS defines dark only under
 * :root[data-theme="dark"], never in a prefers-color-scheme block. index.html applies the saved choice before the first paint.
 */
import { useCallback, useEffect, useState } from 'react';

const KEY = 'pf.theme';
export type Theme = 'light' | 'dark';

export const getTheme = (): Theme =>
  document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

function apply(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0F0F0F' : '#F3F3F3');
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private mode: this page only.
  }
  apply(theme);
}

/** The current theme and a toggle; follows the choice made in another tab. */
export function useTheme(): [Theme, () => void] {
  const [theme, set] = useState<Theme>(getTheme);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        apply(e.newValue === 'dark' ? 'dark' : 'light');
        set(getTheme());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const toggle = useCallback(() => {
    const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
    setTheme(next);
    set(next);
  }, []);
  return [theme, toggle];
}
