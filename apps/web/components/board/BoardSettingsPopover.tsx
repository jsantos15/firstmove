'use client';

import { useState, useEffect, useRef } from 'react';
import { BOARD_THEMES, useBoardSettings } from '@/hooks/useBoardSettings';
import { COACH_PERSONA_OPTIONS, useCoachSettings } from '@/hooks/useCoachSettings';
import { PIECE_SETS } from '@/lib/piecesets';

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-gray-400">{label}</span>
      {children}
    </div>
  );
}

function SettingSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none cursor-pointer rounded-lg border border-white/10 bg-white/5 py-1.5 pl-3 pr-7 text-xs text-gray-200 outline-none transition-colors focus:border-amber-400/40"
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}

export function BoardSettingsPopover({ onAnalyzePosition }: { onAnalyzePosition?: () => void }) {
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
        <div className="absolute bottom-full right-0 z-30 mb-3 w-72 rounded-2xl border border-white/10 bg-(--bg-panel) p-4 shadow-2xl shadow-black/50 backdrop-blur">
          <h3 className="mb-4 text-sm font-semibold text-white">Board settings</h3>

          <div className="space-y-3">
            <SettingRow label="Theme">
              <SettingSelect value={settings.themeId} onChange={v => setSettings({ themeId: v })}>
                {BOARD_THEMES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </SettingSelect>
            </SettingRow>

            <SettingRow label="Pieces">
              <SettingSelect value={settings.pieceSetId} onChange={v => setSettings({ pieceSetId: v })}>
                {PIECE_SETS.map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </SettingSelect>
            </SettingRow>

            <SettingRow label="Animation">
              <SettingSelect
                value={settings.animationSpeed}
                onChange={v => setSettings({ animationSpeed: v as typeof settings.animationSpeed })}
              >
                {(['off', 'slow', 'normal', 'fast'] as const).map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </SettingSelect>
            </SettingRow>

            <SettingRow label="Coordinates">
              <SettingSelect
                value={settings.showCoordinates ? 'on' : 'off'}
                onChange={v => setSettings({ showCoordinates: v === 'on' })}
              >
                <option value="on">On</option>
                <option value="off">Off</option>
              </SettingSelect>
            </SettingRow>

            <SettingRow label="Orientation">
              <SettingSelect
                value={settings.flipBoard ? 'flip' : 'normal'}
                onChange={v => setSettings({ flipBoard: v === 'flip' })}
              >
                <option value="normal">White on bottom</option>
                <option value="flip">Black on bottom</option>
              </SettingSelect>
            </SettingRow>

            <SettingRow label="Move sound">
              <SettingSelect
                value={settings.moveSound ? 'on' : 'off'}
                onChange={v => setSettings({ moveSound: v === 'on' })}
              >
                <option value="on">On</option>
                <option value="off">Off</option>
              </SettingSelect>
            </SettingRow>

            <SettingRow label="Coach">
              <SettingSelect
                value={coachSettings.persona}
                onChange={v => setCoachSettings({ persona: v as typeof coachSettings.persona })}
              >
                {COACH_PERSONA_OPTIONS.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </SettingSelect>
            </SettingRow>
          </div>

          {onAnalyzePosition && (
            <div className="mt-4 border-t border-white/8 pt-4">
              <button
                type="button"
                onClick={() => { onAnalyzePosition(); setOpen(false); }}
                className="flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-xs font-medium text-gray-300 transition-colors hover:border-white/20 hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-gray-500">
                  <path d="M3 3v18h18" />
                  <path d="m19 9-5 5-4-4-3 3" />
                </svg>
                Analyze current position
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
