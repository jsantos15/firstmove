'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { COACH_PERSONAS, type CoachPersona } from '@firstmove/core';

export interface CoachPersonaOption {
  id: CoachPersona;
  label: string;
  description: string;
}

export interface CoachSettings {
  persona: CoachPersona;
}

export const COACH_PERSONA_OPTIONS: CoachPersonaOption[] = [
  {
    id: 'friendly',
    label: 'Friendly',
    description: 'Warm, encouraging feedback.',
  },
  {
    id: 'neutral',
    label: 'Balanced',
    description: 'Direct and steady guidance.',
  },
  {
    id: 'strict',
    label: 'Strict',
    description: 'Sharper correction with less padding.',
  },
  {
    id: 'calm',
    label: 'Calm',
    description: 'Quiet, composed explanations.',
  },
  {
    id: 'hype',
    label: 'Hype',
    description: 'High-energy positive feedback.',
  },
  {
    id: 'beginner',
    label: 'Beginner',
    description: 'Plain-language coaching.',
  },
  {
    id: 'technical',
    label: 'Technical',
    description: 'More precise chess framing.',
  },
];

const DEFAULTS: CoachSettings = {
  persona: 'neutral',
};

const STORAGE_KEY = 'firstmove_coach_settings';
let currentSettings: CoachSettings = DEFAULTS;
let hasLoadedSettings = false;
const listeners = new Set<() => void>();

function isCoachPersona(value: unknown): value is CoachPersona {
  return typeof value === 'string' && (COACH_PERSONAS as readonly string[]).includes(value);
}

function sanitizeSettings(value: Partial<CoachSettings>): CoachSettings {
  return {
    persona: isCoachPersona(value.persona) ? value.persona : DEFAULTS.persona,
  };
}

function load(): CoachSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeSettings({ ...DEFAULTS, ...JSON.parse(raw) }) : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function persist(next: CoachSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

function emit(next: CoachSettings) {
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

export function useCoachSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULTS);

  const setSettings = useCallback((patch: Partial<CoachSettings>) => {
    const next = sanitizeSettings({ ...currentSettings, ...patch });
    persist(next);
    emit(next);
  }, []);

  const personaOption =
    COACH_PERSONA_OPTIONS.find(option => option.id === settings.persona) ??
    COACH_PERSONA_OPTIONS[1];

  return { settings, setSettings, personaOption, hydrated: hasLoadedSettings };
}
