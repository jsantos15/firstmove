'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Board themes ─────────────────────────────────────────────────────────────

export interface BoardTheme {
  id: string;
  label: string;
  dark: string;
  light: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  { id: 'classic',  label: 'Classic',  dark: '#b58863', light: '#f0d9b5' }, // Lichess brown (exact)
  { id: 'walnut',   label: 'Green',    dark: '#769656', light: '#eeeed2' }, // Chess.com green (exact)
  { id: 'ocean',    label: 'Ocean',    dark: '#4d8db0', light: '#d8eef8' },
  { id: 'midnight', label: 'Midnight', dark: '#5258a0', light: '#d6d8f2' },
  { id: 'slate',    label: 'Slate',    dark: '#6a7888', light: '#eaeff4' },
  { id: 'rose',     label: 'Rose',     dark: '#b05878', light: '#fae6ee' },
];

// ─── Settings shape ───────────────────────────────────────────────────────────

export type AnimationSpeed = 'off' | 'slow' | 'normal' | 'fast';

export interface BoardSettings {
  themeId: string;
  pieceSetId: string;
  showCoordinates: boolean;
  animationSpeed: AnimationSpeed;
  moveSound: boolean;
}

export const ANIMATION_MS: Record<AnimationSpeed, number> = {
  off:    0,
  slow:   400,
  normal: 200,
  fast:   80,
};

// ─── Defaults + storage ───────────────────────────────────────────────────────

const DEFAULTS: BoardSettings = {
  themeId: 'classic',
  pieceSetId: 'cburnett',
  showCoordinates: true,
  animationSpeed: 'normal',
  moveSound: true,
};

const STORAGE_KEY = 'firstmove_board_settings';

function load(): BoardSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBoardSettings() {
  const [settings, setSettingsState] = useState<BoardSettings>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  // Sync from localStorage after first render (SSR-safe)
  useEffect(() => {
    setSettingsState(load());
    setHydrated(true);
  }, []);

  const setSettings = useCallback((patch: Partial<BoardSettings>) => {
    setSettingsState(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const theme = BOARD_THEMES.find(t => t.id === settings.themeId) ?? BOARD_THEMES[0];
  const animationDuration = ANIMATION_MS[settings.animationSpeed];

  return { settings, setSettings, theme, animationDuration, hydrated };
}
