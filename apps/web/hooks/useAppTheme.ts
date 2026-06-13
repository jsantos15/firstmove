'use client';

import { useState, useEffect } from 'react';

export type AppTheme = 'light' | 'dark' | 'dusk';

const STORAGE_KEY = 'firstmove_app_theme';
const DEFAULT: AppTheme = 'dark';
const THEMES = new Set<AppTheme>(['light', 'dark', 'dusk']);

function readStoredTheme(): AppTheme {
  if (typeof window === 'undefined') return DEFAULT;
  const stored = localStorage.getItem(STORAGE_KEY);
  return THEMES.has(stored as AppTheme) ? (stored as AppTheme) : DEFAULT;
}

export function useAppTheme() {
  const [theme, setThemeState] = useState<AppTheme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  function setTheme(t: AppTheme) {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
    document.documentElement.setAttribute('data-theme', t);
  }

  return { theme, setTheme };
}
