'use client';

import { useCallback, useSyncExternalStore } from 'react';

// ─── Board themes ─────────────────────────────────────────────────────────────

export interface BoardTheme {
  id: string;
  label: string;
  dark: string;
  light: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  { id: 'classic', label: 'Classic', dark: '#b58863', light: '#f0d9b5' }, // Lichess brown (exact)
  { id: 'walnut', label: 'Green', dark: '#769656', light: '#eeeed2' }, // Chess.com green (exact)
  { id: 'ocean', label: 'Ocean', dark: '#4d8db0', light: '#d8eef8' },
  { id: 'midnight', label: 'Midnight', dark: '#5258a0', light: '#d6d8f2' },
  { id: 'slate', label: 'Slate', dark: '#6a7888', light: '#eaeff4' },
  { id: 'rose', label: 'Rose', dark: '#b05878', light: '#fae6ee' },
];

// ─── Settings shape ───────────────────────────────────────────────────────────

export type AnimationSpeed = 'off' | 'slow' | 'normal' | 'fast';

export interface BoardSettings {
  themeId: string;
  pieceSetId: string;
  showCoordinates: boolean;
  flipBoard: boolean;
  animationSpeed: AnimationSpeed;
  moveSound: boolean;
  engineLines: 1 | 2 | 3;
  engineEnabled: boolean;
  engineMoveTime: number;
  hideEngineInfo: boolean;
  hideArrows: boolean;
}

export const ANIMATION_MS: Record<AnimationSpeed, number> = {
  off: 0,
  slow: 400,
  normal: 200,
  fast: 80,
};

// ─── Defaults + storage ───────────────────────────────────────────────────────

const DEFAULTS: BoardSettings = {
  themeId: 'classic',
  pieceSetId: 'cburnett',
  showCoordinates: true,
  flipBoard: false,
  animationSpeed: 'normal',
  moveSound: true,
  engineLines: 1,
  engineEnabled: true,
  engineMoveTime: 8,
  hideEngineInfo: false,
  hideArrows: false,
};

const STORAGE_KEY = 'firstmove_board_settings';
let currentSettings: BoardSettings = DEFAULTS;
let hasLoadedSettings = false;
const listeners = new Set<() => void>();

function load(): BoardSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function persist(next: BoardSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

function emit(next: BoardSettings) {
  currentSettings = next;
  listeners.forEach(listener => listener());
}

function getSnapshot() {
  if (!hasLoadedSettings && typeof window !== 'undefined') {
    hasLoadedSettings = true;
    currentSettings = load();
  }

  return currentSettings;
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  function handleStorage(event: StorageEvent) {
    if (event.key !== STORAGE_KEY) return;
    emit(load());
  }

  window.addEventListener('storage', handleStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', handleStorage);
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBoardSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULTS);

  const setSettings = useCallback((patch: Partial<BoardSettings>) => {
    const next = { ...currentSettings, ...patch };
    persist(next);
    emit(next);
  }, []);

  const theme = BOARD_THEMES.find(t => t.id === settings.themeId) ?? BOARD_THEMES[0];
  const animationDuration = ANIMATION_MS[settings.animationSpeed];

  return { settings, setSettings, theme, animationDuration, hydrated: hasLoadedSettings };
}
