'use client';

import { useState, useEffect } from 'react';

export type AppTheme = 'light' | 'dark' | 'dusk';

const STORAGE_KEY = 'firstmove_app_theme';
const DEFAULT: AppTheme = 'dark';

export function useAppTheme() {
  const [theme, setThemeState] = useState<AppTheme>(DEFAULT);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as AppTheme | null;
    if (stored) setThemeState(stored);
  }, []);

  function setTheme(t: AppTheme) {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
    document.documentElement.setAttribute('data-theme', t);
  }

  return { theme, setTheme };
}
