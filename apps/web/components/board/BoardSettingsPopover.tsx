'use client';

import { useState, useEffect, useRef } from 'react';
import { BOARD_THEMES, useBoardSettings } from '@/hooks/useBoardSettings';
import { COACH_PERSONA_OPTIONS, useCoachSettings } from '@/hooks/useCoachSettings';
import { PIECE_SETS } from '@/lib/piecesets';

export function ToggleChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
          : 'border-white/10 bg-white/5 text-gray-300 hover:border-white/20 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

export function BoardSettingsPopover() {
  const { settings, setSettings } = useBoardSettings();
  const { settings: coachSettings, setSettings: setCoachSettings } = useCoachSettings();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div ref={popoverRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className={`inline-flex h-12 w-12 items-center justify-center text-gray-300 transition-colors ${
          open ? 'text-amber-300' : 'hover:text-white'
        }`}
        aria-label="Board settings"
        title="Board settings"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-6 w-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-30 mb-3 w-80 rounded-2xl border border-white/10 bg-(--bg-panel) p-4 shadow-2xl shadow-black/50 backdrop-blur">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white">Board settings</h3>
            <p className="mt-1 text-xs text-gray-500">Quick adjustments for this session.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-gray-500">
                Theme
              </label>
              <div className="grid grid-cols-3 gap-2">
                {BOARD_THEMES.map(theme => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setSettings({ themeId: theme.id })}
                    className={`rounded-xl border p-2 transition-colors ${
                      settings.themeId === theme.id
                        ? 'border-amber-400/40 bg-amber-400/10'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="mb-2 grid h-8 grid-cols-2 overflow-hidden rounded-md">
                      <div style={{ backgroundColor: theme.light }} />
                      <div style={{ backgroundColor: theme.dark }} />
                      <div style={{ backgroundColor: theme.dark }} />
                      <div style={{ backgroundColor: theme.light }} />
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        settings.themeId === theme.id ? 'text-amber-300' : 'text-gray-300'
                      }`}
                    >
                      {theme.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-gray-500">
                Piece set
              </label>
              <div className="grid grid-cols-3 gap-2">
                {PIECE_SETS.map(set => (
                  <button
                    key={set.id}
                    type="button"
                    onClick={() => setSettings({ pieceSetId: set.id })}
                    className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                      settings.pieceSetId === set.id
                        ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                        : 'border-white/10 bg-white/5 text-gray-300 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    {set.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-gray-500">
                Animation
              </label>
              <div className="flex overflow-hidden rounded-xl border border-white/10">
                {(['off', 'slow', 'normal', 'fast'] as const).map(speed => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => setSettings({ animationSpeed: speed })}
                    className={`flex-1 px-3 py-2 text-xs font-medium capitalize transition-colors ${
                      settings.animationSpeed === speed
                        ? 'bg-amber-400/15 text-amber-300'
                        : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {speed}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-gray-500">
                Coach
              </label>
              <div className="grid grid-cols-2 gap-2">
                {COACH_PERSONA_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setCoachSettings({ persona: option.id })}
                    className={`rounded-xl border p-2 text-left transition-colors ${
                      coachSettings.persona === option.id
                        ? 'border-amber-400/40 bg-amber-400/10'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <span
                      className={`block text-xs font-medium ${
                        coachSettings.persona === option.id ? 'text-amber-300' : 'text-gray-300'
                      }`}
                    >
                      {option.label}
                    </span>
                    <span className="mt-1 block text-[10px] leading-4 text-gray-500">
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <ToggleChip
                label="Coords"
                active={settings.showCoordinates}
                onClick={() => setSettings({ showCoordinates: !settings.showCoordinates })}
              />
              <ToggleChip
                label="Flip"
                active={settings.flipBoard}
                onClick={() => setSettings({ flipBoard: !settings.flipBoard })}
              />
              <ToggleChip
                label="Sound"
                active={settings.moveSound}
                onClick={() => setSettings({ moveSound: !settings.moveSound })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
