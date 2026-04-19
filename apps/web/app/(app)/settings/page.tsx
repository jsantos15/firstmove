'use client';

import { useRef, useState, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { useBoardSettings, BOARD_THEMES } from '@/hooks/useBoardSettings';
import { PIECE_SETS, getCustomPieces, getPreviewUrl, type PieceSetDef } from '@/lib/piecesets';
import { useAppTheme, type AppTheme } from '@/hooks/useAppTheme';

// ─── Appearance section ────────────────────────────────────────────────────────

const APP_THEME_OPTIONS: {
  id: AppTheme;
  label: string;
  colors: { sidebar: string; base: string; panel: string; text: string };
}[] = [
  { id: 'light', label: 'Light', colors: { sidebar: '#e4e6ed', base: '#f0f2f5', panel: '#ffffff', text: '#374151' } },
  { id: 'dark',  label: 'Dark',  colors: { sidebar: '#13151e', base: '#0f1117', panel: '#1a1d27', text: '#9ca3af' } },
  { id: 'dusk',  label: 'Dusk',  colors: { sidebar: '#1a1d2a', base: '#1c1f2e', panel: '#252838', text: '#8b95ad' } },
];

function AppearancePicker() {
  const { theme, setTheme } = useAppTheme();
  return (
    <div className="grid grid-cols-3 gap-3">
      {APP_THEME_OPTIONS.map(t => {
        const active = theme === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={`flex flex-col items-center gap-2.5 p-3 rounded-xl border transition-all ${
              active ? 'border-amber-400/60 bg-amber-400/10' : 'border-white/5 hover:border-white/20'
            }`}
          >
            {/* Mini app mockup */}
            <div
              className="w-full aspect-4/3 rounded-lg overflow-hidden flex shrink-0"
              style={{ backgroundColor: t.colors.base, border: `1px solid ${t.id === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.06)'}` }}
            >
              <div className="w-[30%] h-full p-1.5 flex flex-col gap-1" style={{ backgroundColor: t.colors.sidebar }}>
                <div className="w-3/4 h-1.5 rounded-sm" style={{ backgroundColor: t.colors.text, opacity: 0.7 }} />
                <div className="w-1/2 h-1 rounded-sm mt-0.5" style={{ backgroundColor: t.colors.text, opacity: 0.3 }} />
                <div className="w-1/2 h-1 rounded-sm" style={{ backgroundColor: t.colors.text, opacity: 0.3 }} />
              </div>
              <div className="flex-1 p-1.5 flex flex-col gap-1.5">
                <div className="w-2/3 h-1.5 rounded-sm" style={{ backgroundColor: t.colors.text, opacity: 0.5 }} />
                <div className="flex-1 rounded-md" style={{ backgroundColor: t.colors.panel, border: `1px solid ${t.id === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)'}` }} />
              </div>
            </div>
            <span className={`text-xs font-medium ${active ? 'text-amber-400' : 'text-gray-400'}`}>
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const ANIMATION_OPTIONS = [
  { value: 'off',    label: 'Off'    },
  { value: 'slow',   label: 'Slow'   },
  { value: 'normal', label: 'Normal' },
  { value: 'fast',   label: 'Fast'   },
] as const;

const PREVIEW_FEN = 'r1bqk2r/pppp1ppp/2n2n2/1B2p3/2b1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 1';
const PREVIEW_CODES = ['wK', 'wQ', 'bK', 'bQ'];

// ─── Piece preview strip ───────────────────────────────────────────────────────

function PiecePreviews({ set, size = 28 }: { set: PieceSetDef; size?: number }) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {PREVIEW_CODES.map(code => (
        <img
          key={code}
          src={getPreviewUrl(set, code)}
          alt={code}
          width={size}
          height={size}
          draggable={false}
          className="select-none"
        />
      ))}
    </div>
  );
}

// ─── Piece set dropdown ────────────────────────────────────────────────────────

function PieceSetDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeSet = PIECE_SETS.find(s => s.id === value) ?? PIECE_SETS[0];

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  return (
    <div ref={ref} className="relative w-full max-w-sm">

      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
          open
            ? 'border-amber-400/40 bg-amber-400/5'
            : 'border-white/10 bg-white/5 hover:border-white/20'
        }`}
      >
        <PiecePreviews set={activeSet} size={26} />
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-medium text-white">{activeSet.label}</p>
          <p className="text-xs text-gray-500">{activeSet.description}</p>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Dropdown list */}
      {open && (
        <div className="absolute bottom-full mb-1.5 left-0 right-0 rounded-xl border border-white/10 bg-[var(--bg-sidebar)] shadow-2xl shadow-black/60 z-30 py-1 max-h-72 overflow-y-auto">
          {PIECE_SETS.map(set => {
            const isActive = set.id === value;
            return (
              <button
                key={set.id}
                onClick={() => { onChange(set.id); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors ${
                  isActive ? 'bg-amber-400/10' : 'hover:bg-white/5'
                }`}
              >
                <PiecePreviews set={set} size={26} />
                <div className="flex-1 text-left min-w-0">
                  <p className={`text-sm font-medium ${isActive ? 'text-amber-400' : 'text-white'}`}>
                    {set.label}
                  </p>
                  <p className="text-xs text-gray-500">{set.description}</p>
                </div>
                {isActive && (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-400 shrink-0">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { settings, setSettings, theme, animationDuration } = useBoardSettings();
  const customPieces = getCustomPieces(settings.pieceSetId);

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: 'var(--bg-base)' }}>
      <div className="mx-auto max-w-3xl px-6 py-10 pb-16">

        <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
        <p className="text-sm text-gray-400 mb-10">Customize how the app looks and feels.</p>

        <div className="flex flex-col gap-8">

          {/* ── Appearance ────────────────────────────────────── */}
          <section className="rounded-xl border border-white/5 bg-[var(--bg-panel)] overflow-hidden">
            <div className="px-6 py-5 border-b border-white/5">
              <h2 className="text-base font-semibold text-white">Appearance</h2>
              <p className="text-xs text-gray-500 mt-0.5">Choose how FirstMove looks on your device.</p>
            </div>
            <div className="px-6 py-6">
              <AppearancePicker />
            </div>
          </section>

          {/* ── Board ─────────────────────────────────────────── */}
          <section className="rounded-xl border border-white/5 bg-[var(--bg-panel)] overflow-hidden">
            <div className="px-6 py-5 border-b border-white/5">
              <h2 className="text-base font-semibold text-white">Board</h2>
              <p className="text-xs text-gray-500 mt-0.5">Changes apply to all boards in the app.</p>
            </div>

            <div className="px-6 py-6 flex flex-col gap-8 lg:flex-row lg:gap-10">

              {/* Controls */}
              <div className="flex-1 flex flex-col gap-7">

                {/* Board theme */}
                <div>
                  <label className="block text-sm font-medium text-white mb-3">Board theme</label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {BOARD_THEMES.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setSettings({ themeId: t.id })}
                        className={`rounded-lg border p-2.5 flex flex-col items-center gap-2 transition-all ${
                          settings.themeId === t.id
                            ? 'border-amber-400/60 bg-amber-400/10'
                            : 'border-white/5 hover:border-white/20'
                        }`}
                      >
                        <div className="w-10 h-10 rounded overflow-hidden grid grid-cols-2 shrink-0">
                          <div style={{ backgroundColor: t.light }} />
                          <div style={{ backgroundColor: t.dark  }} />
                          <div style={{ backgroundColor: t.dark  }} />
                          <div style={{ backgroundColor: t.light }} />
                        </div>
                        <span className={`text-xs font-medium ${settings.themeId === t.id ? 'text-amber-400' : 'text-gray-400'}`}>
                          {t.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Piece set */}
                <div>
                  <label className="block text-sm font-medium text-white mb-3">Piece set</label>
                  <PieceSetDropdown
                    value={settings.pieceSetId}
                    onChange={pieceSetId => setSettings({ pieceSetId })}
                  />
                </div>

                {/* Coordinate labels */}
                <div>
                  <label className="block text-sm font-medium text-white mb-3">Coordinate labels</label>
                  <button
                    onClick={() => setSettings({ showCoordinates: !settings.showCoordinates })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.showCoordinates ? 'bg-amber-400' : 'bg-white/15'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      settings.showCoordinates ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                  <p className="text-xs text-gray-500 mt-2">Show a–h and 1–8 around the board edges.</p>
                </div>

                {/* Board orientation */}
                <div>
                  <label className="block text-sm font-medium text-white mb-3">Flip board</label>
                  <button
                    onClick={() => setSettings({ flipBoard: !settings.flipBoard })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.flipBoard ? 'bg-amber-400' : 'bg-white/15'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      settings.flipBoard ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                  <p className="text-xs text-gray-500 mt-2">Reverse the board orientation on web boards.</p>
                </div>

                {/* Move sound */}
                <div>
                  <label className="block text-sm font-medium text-white mb-3">Move sound</label>
                  <button
                    onClick={() => setSettings({ moveSound: !settings.moveSound })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.moveSound ? 'bg-amber-400' : 'bg-white/15'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      settings.moveSound ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                  <p className="text-xs text-gray-500 mt-2">Play a sound when a piece moves.</p>
                </div>

                {/* Animation speed */}
                <div>
                  <label className="block text-sm font-medium text-white mb-3">Piece animation</label>
                  <div className="flex rounded-lg border border-white/10 overflow-hidden w-fit">
                    {ANIMATION_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setSettings({ animationSpeed: opt.value })}
                        className={`px-4 py-1.5 text-xs font-medium transition-colors ${
                          settings.animationSpeed === opt.value
                            ? 'bg-amber-400/20 text-amber-400'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* Live preview */}
              <div className="shrink-0 flex flex-col items-center gap-3">
                <p className="text-xs text-gray-500 self-start lg:self-center">Preview</p>
                <div className="rounded-xl overflow-hidden ring-1 ring-white/10 pointer-events-none">
                  <Chessboard
                    position={PREVIEW_FEN}
                    boardWidth={220}
                    arePiecesDraggable={false}
                    boardOrientation={settings.flipBoard ? 'black' : 'white'}
                    showBoardNotation={settings.showCoordinates}
                    customDarkSquareStyle={{ backgroundColor: theme.dark }}
                    customLightSquareStyle={{ backgroundColor: theme.light }}
                    animationDuration={animationDuration}
                    customPieces={customPieces}
                  />
                </div>
              </div>

            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
