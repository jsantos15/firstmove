'use client';

import { useState, use, useEffect, useRef } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { OpeningDifficulty, OpeningVariation } from '@firstmove/core';
import { PracticeBoard, type PracticeMode } from '@/components/board/PracticeBoard';
import { useOpening } from '@/hooks/useOpenings';
import { MoveList } from '@/components/board/MoveList';
import { DifficultyBadge, ColorBadge } from '@/components/ui/Badge';
import { useAuth } from '@/app/providers';
import { useAllProgress, MASTERY_LABELS, MASTERY_COLORS } from '@/hooks/useProgress';
import { BOARD_THEMES, useBoardSettings } from '@/hooks/useBoardSettings';
import { PIECE_SETS } from '@/lib/piecesets';
import type { CoachFeedback, CoachFeedbackTone } from '@/lib/coachFeedback';

interface PageProps {
  params: Promise<{ id: string }>;
}

type VariationWithMeta = OpeningVariation & {
  engineChecked?: boolean;
  evalCpByPly?: number[];
  finalEvalCp?: number;
  finalEvalPerspective?: 'white' | 'black';
  isMainLine?: boolean;
  lineDifficulty?: OpeningDifficulty;
};

const COACH_TONE_STYLES: Record<CoachFeedbackTone, string> = {
  neutral: 'border-sky-200/70 bg-sky-50 text-sky-700',
  positive: 'border-emerald-200/80 bg-emerald-50 text-emerald-700',
  payoff: 'border-amber-200/90 bg-amber-50 text-amber-700',
  warning: 'border-orange-200/90 bg-orange-50 text-orange-700',
  negative: 'border-red-200/90 bg-red-50 text-red-700',
  complete: 'border-green-200/90 bg-green-50 text-green-700',
};

function asVariationWithMeta(variation: OpeningVariation): VariationWithMeta {
  return variation as VariationWithMeta;
}

function formatDifficultyLabel(value?: OpeningDifficulty) {
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function BoardSettingsPopover() {
  const { settings, setSettings } = useBoardSettings();
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
          open
            ? 'text-amber-300'
            : 'hover:text-white'
        }`}
        aria-label="Board settings"
        title="Board settings"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-30 mb-3 w-80 rounded-2xl border border-white/10 bg-[var(--bg-panel)] p-4 shadow-2xl shadow-black/50 backdrop-blur">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white">Board settings</h3>
            <p className="mt-1 text-xs text-gray-500">Quick adjustments for this practice session.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-gray-500">Theme</label>
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
                    <span className={`text-xs font-medium ${
                      settings.themeId === theme.id ? 'text-amber-300' : 'text-gray-300'
                    }`}>
                      {theme.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-gray-500">Piece set</label>
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
              <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-gray-500">Animation</label>
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

function ToggleChip({
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

export default function PracticePage({ params }: PageProps) {
  const { id } = use(params);
  const { data: opening, isLoading } = useOpening(id);
  const { user } = useAuth();
  const { data: progress } = useAllProgress();
  const [selectedVariationId, setSelectedVariationId] = useState('');
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [mode, setMode] = useState<PracticeMode>('learn');
  const [coachFeedback, setCoachFeedback] = useState<CoachFeedback | null>(null);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!opening) notFound();

  const activeVariationId = selectedVariationId || opening.variations[0]?.id;
  const selectedVariation = opening.variations.find(v => v.id === activeVariationId) ?? opening.variations[0];
  const coachBubbleText = coachFeedback?.message ?? opening.description;
  const coachBubbleLabel = coachFeedback?.label ?? 'Jazmin';
  const coachBubbleTitle = coachFeedback?.title ?? opening.name;
  const coachToneClass = coachFeedback ? COACH_TONE_STYLES[coachFeedback.tone] : COACH_TONE_STYLES.neutral;

  function handleVariationClick(variationId: string, index: number) {
    if (index > 0 && !user) {
      setShowAuthPrompt(true);
      return;
    }
    setShowAuthPrompt(false);
    setSelectedVariationId(variationId);
    setCoachFeedback(null);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Header */}
      <header className="h-14 shrink-0 bg-[var(--bg-base)]/80 backdrop-blur z-10">
        <div className="flex h-full items-center px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/openings" className="text-gray-400 hover:text-white transition-colors text-sm">
              ← Openings
            </Link>
            <span className="text-white/20">/</span>
            <span className="truncate text-white font-medium text-sm">{opening.name}</span>
          </div>

          <div className="pointer-events-none absolute inset-x-4 flex justify-center lg:inset-x-6">
            <div className="grid w-full max-w-[1640px] grid-cols-[minmax(0,1fr)_24rem] gap-[36px] lg:grid-cols-[minmax(0,1fr)_27rem] lg:gap-[52px]">
              <div className="flex justify-center sm:translate-x-[18px]">
                <div className="pointer-events-auto flex overflow-hidden rounded-xl border border-white/10">
                  <ModeButton active={mode === 'learn'} onClick={() => setMode('learn')}>Learn</ModeButton>
                  <ModeButton active={mode === 'practice'} onClick={() => setMode('practice')}>Practice</ModeButton>
                </div>
              </div>
              <div />
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden px-4 pb-3 pt-2 lg:px-6 lg:pb-4 lg:pt-3">
        <div className="mx-auto flex h-full w-full max-w-[1640px] gap-[36px] lg:gap-[52px]">

          {/* Board column */}
          <div className="flex h-full min-w-0 flex-1 justify-end">
            <div className="h-full max-w-full shrink" style={{ aspectRatio: '1 / 1' }}>
            {selectedVariation && (
              <PracticeBoard
                opening={opening}
                variation={selectedVariation}
                mode={mode}
                onMoveIndexChange={setCurrentMoveIndex}
                onCoachFeedbackChange={setCoachFeedback}
                controlsRight={<BoardSettingsPopover />}
              />
            )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-[24rem] lg:w-[27rem] shrink-0 h-full flex flex-col gap-4">

            {/* Opening info — fixed */}
            <div className="shrink-0 rounded-xl border border-white/5 bg-[var(--bg-panel)] p-5">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <ColorBadge color={opening.color} />
                <DifficultyBadge difficulty={opening.difficulty} />
              </div>
              <div className="flex items-start gap-3">
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <div className="relative h-16 w-16 overflow-hidden rounded-full border border-white/15 bg-white shadow-lg shadow-black/20">
                    <Image
                      src="/coaches/jazmin.svg"
                      alt="Jazmin, your opening coach"
                      fill
                      sizes="64px"
                      className="object-cover object-top"
                      priority
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-300">Jazmin</span>
                </div>
                <div className="relative min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 shadow-lg shadow-black/20">
                  <div className="absolute left-[-7px] top-5 h-4 w-4 rotate-45 border-b border-l border-zinc-200 bg-white" />
                  <span className={`mb-2 inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${coachToneClass}`}>
                    {coachBubbleLabel}
                  </span>
                  <h1 className="text-base font-bold text-zinc-950">{coachBubbleTitle}</h1>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-700">{coachBubbleText}</p>
                </div>
              </div>
            </div>

            {/* Move list — only in Learn mode */}
            {mode === 'learn' && selectedVariation && (
              <MoveList variation={selectedVariation} currentMoveIndex={currentMoveIndex} />
            )}

            {/* Line selector — takes remaining height, list scrolls internally */}
            <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-white/5 bg-[var(--bg-panel)]">
              <h3 className="shrink-0 px-4 pt-4 pb-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Lines
              </h3>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 flex flex-col gap-1.5">
                {opening.variations.map((variation, index) => {
                  const variationMeta = asVariationWithMeta(variation);
                  const locked = index > 0 && !user;
                  const vProgress = progress?.get(`${opening.id}/${variation.id}`);
                  const mastery = vProgress?.mastery;
                  return (
                    <button
                      key={variation.id}
                      onClick={() => handleVariationClick(variation.id, index)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        variation.id === activeVariationId
                          ? 'bg-amber-400/15 text-amber-300 border border-amber-400/20'
                          : locked
                          ? 'text-gray-600 cursor-pointer hover:bg-white/5'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{variation.name}</span>
                            {variationMeta.isMainLine ? (
                              <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                                Main
                              </span>
                            ) : null}
                            {variationMeta.lineDifficulty &&
                            variationMeta.lineDifficulty !== opening.difficulty ? (
                              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                                {formatDifficultyLabel(variationMeta.lineDifficulty)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {locked ? (
                          <span className="text-xs shrink-0">🔒</span>
                        ) : mastery && mastery !== 'new' ? (
                          <span className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                            <span className={`w-1.5 h-1.5 rounded-full ${MASTERY_COLORS[mastery]}`} />
                            {MASTERY_LABELS[mastery]}
                          </span>
                        ) : null}
                      </div>
                      {variation.description && (
                        <div className="text-xs opacity-60 mt-0.5 line-clamp-2">{variation.description}</div>
                      )}
                      {vProgress && (
                        <div className="text-xs text-gray-600 mt-1">
                          {vProgress.timesCompleted} {vProgress.timesCompleted === 1 ? 'completion' : 'completions'}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {showAuthPrompt && (
                <div className="shrink-0 mx-4 mb-4 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-300">
                  <p className="mb-2">Sign in to unlock all lines.</p>
                  <Link
                    href="/login"
                    className="inline-block rounded-md bg-amber-400 px-3 py-1.5 text-xs font-semibold text-[#0f1117] hover:bg-amber-300 transition-colors"
                  >
                    Sign in
                  </Link>
                </div>
              )}
            </div>

          </div>{/* end sidebar */}

        </div>
      </div>

    </div>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-28 px-7 py-3 text-base font-semibold transition-colors ${
        active ? 'bg-amber-400/15 text-amber-300' : 'text-gray-400 hover:bg-white/5 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
