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
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find(o => o.value === value)?.label ?? value;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div ref={ref} className="relative w-36">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
          open
            ? 'border-amber-400/40 bg-white/8 text-white'
            : 'border-white/10 bg-white/5 text-gray-200 hover:border-white/20 hover:text-white'
        }`}
      >
        <span className="truncate">{selectedLabel}</span>
        <svg
          className={`h-3 w-3 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-full overflow-hidden rounded-lg border border-white/10 bg-[#1a1a2e] shadow-xl shadow-black/60">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`flex w-full items-center px-3 py-1.5 text-left text-xs transition-colors ${
                opt.value === value
                  ? 'bg-amber-400/15 text-amber-300'
                  : 'text-gray-300 hover:bg-white/8 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
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
        <div className="absolute bottom-full right-0 z-30 mb-3 w-72 rounded-2xl border border-white/10 bg-(--bg-panel) p-4 shadow-2xl shadow-black/50 backdrop-blur">
          <h3 className="mb-4 text-sm font-semibold text-white">Board settings</h3>

          <div className="space-y-3">
            <SettingRow label="Theme">
              <SettingSelect
                value={settings.themeId}
                onChange={v => setSettings({ themeId: v })}
                options={BOARD_THEMES.map(t => ({ value: t.id, label: t.label }))}
              />
            </SettingRow>

            <SettingRow label="Pieces">
              <SettingSelect
                value={settings.pieceSetId}
                onChange={v => setSettings({ pieceSetId: v })}
                options={PIECE_SETS.map(s => ({ value: s.id, label: s.label }))}
              />
            </SettingRow>

            <SettingRow label="Animation">
              <SettingSelect
                value={settings.animationSpeed}
                onChange={v => setSettings({ animationSpeed: v as typeof settings.animationSpeed })}
                options={(['off', 'slow', 'normal', 'fast'] as const).map(s => ({
                  value: s,
                  label: s.charAt(0).toUpperCase() + s.slice(1),
                }))}
              />
            </SettingRow>

            <SettingRow label="Coordinates">
              <SettingSelect
                value={settings.showCoordinates ? 'on' : 'off'}
                onChange={v => setSettings({ showCoordinates: v === 'on' })}
                options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]}
              />
            </SettingRow>

            <SettingRow label="Orientation">
              <SettingSelect
                value={settings.flipBoard ? 'flip' : 'normal'}
                onChange={v => setSettings({ flipBoard: v === 'flip' })}
                options={[
                  { value: 'normal', label: 'White on bottom' },
                  { value: 'flip', label: 'Black on bottom' },
                ]}
              />
            </SettingRow>

            <SettingRow label="Move sound">
              <SettingSelect
                value={settings.moveSound ? 'on' : 'off'}
                onChange={v => setSettings({ moveSound: v === 'on' })}
                options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]}
              />
            </SettingRow>

            <SettingRow label="Engine lines">
              <SettingSelect
                value={String(settings.engineLines)}
                onChange={v => setSettings({ engineLines: Number(v) as 1 | 2 | 3 })}
                options={[
                  { value: '1', label: '1 line' },
                  { value: '2', label: '2 lines' },
                  { value: '3', label: '3 lines' },
                ]}
              />
            </SettingRow>

            <SettingRow label="Coach">
              <SettingSelect
                value={coachSettings.persona}
                onChange={v => setCoachSettings({ persona: v as typeof coachSettings.persona })}
                options={COACH_PERSONA_OPTIONS.map(o => ({ value: o.id, label: o.label }))}
              />
            </SettingRow>
          </div>
        </div>
      )}
    </div>
  );
}
