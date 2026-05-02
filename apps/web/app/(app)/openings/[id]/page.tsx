'use client';

import { useState, use, useEffect, useRef } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { PracticeBoard, type PracticeMode } from '@/components/board/PracticeBoard';
import { useOpening } from '@/hooks/useOpenings';
import { MoveList } from '@/components/board/MoveList';
import { useAuth } from '@/app/providers';
import { useAllProgress, MASTERY_LABELS, MASTERY_COLORS } from '@/hooks/useProgress';
import { BOARD_THEMES, useBoardSettings } from '@/hooks/useBoardSettings';
import { PIECE_SETS } from '@/lib/piecesets';
import type { CoachFeedback } from '@/lib/coachFeedback';

interface PageProps {
  params: Promise<{ id: string }>;
}

// ─── Variation grouping ───────────────────────────────────────────────────────

interface VariationGroup {
  id: string;
  displayName: string;
  lines: { id: string; name: string; isMainLine?: boolean | null; primaryCategory?: string | null; lineDifficulty?: string | null }[];
}

interface DummyBranch {
  id: string;
  title: string;
  punishMove: string;
}

function extractGroupName(fullName: string | undefined, openingName: string): string {
  if (!fullName) return openingName;
  const prefix = `${openingName}: `;
  const remainder = fullName.startsWith(prefix) ? fullName.slice(prefix.length) : fullName;
  const commaIdx = remainder.indexOf(',');
  return commaIdx === -1 ? remainder : remainder.slice(0, commaIdx).trim();
}

function slugifyGroup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function groupVariations(
  variations: { id: string; name: string; fullName?: string | null; isMainLine?: boolean | null; primaryCategory?: string | null; lineDifficulty?: string | null }[],
  openingName: string,
): VariationGroup[] {
  const map = new Map<string, VariationGroup>();
  for (const v of variations) {
    const displayName = extractGroupName(v.fullName ?? undefined, openingName);
    const key = slugifyGroup(displayName) || v.id;
    const group = map.get(key);
    if (group) {
      group.lines.push(v);
    } else {
      map.set(key, { id: key, displayName, lines: [v] });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const aMain = a.lines.some(l => l.isMainLine) ? -1 : 1;
    const bMain = b.lines.some(l => l.isMainLine) ? -1 : 1;
    if (aMain !== bMain) return aMain - bMain;
    return a.displayName.localeCompare(b.displayName);
  });
}

const CATEGORY_META: Record<string, { label: string; classes: string }> = {
  tactical_payoff: { label: 'Tactical',  classes: 'bg-orange-400/10 text-orange-400' },
  forcing:         { label: 'Forcing',   classes: 'bg-amber-400/10  text-amber-400'  },
  strategic:       { label: 'Strategic', classes: 'bg-sky-400/10    text-sky-400'    },
  setup:           { label: 'Setup',     classes: 'bg-teal-400/10   text-teal-400'   },
};

function getDummyBranches(openingName: string, groupName: string): DummyBranch[] {
  if (openingName.toLowerCase() !== 'italian game') return [];
  if (!groupName.toLowerCase().includes('giuoco piano')) return [];
  return [
    { id: 'punish-a6',  title: 'Punish queenside tempo loss',    punishMove: 'vs …a6?!'  },
    { id: 'punish-be6', title: 'Punish premature bishop trade',  punishMove: 'vs …Be6?!' },
    { id: 'punish-nd4', title: 'Punish knight outpost attempt',  punishMove: 'vs …Nd4?!' },
  ];
}

// ─── Accordion group row ──────────────────────────────────────────────────────

function GroupHeader({
  group,
  isOpen,
  onToggle,
}: {
  group: VariationGroup;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const hasMainLine = group.lines.some(l => l.isMainLine);
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
        isOpen ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-3 w-3 shrink-0 text-gray-600 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{group.displayName}</span>
        {hasMainLine && (
          <span className="text-[10px] text-amber-400/60">includes main line</span>
        )}
      </div>
      <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-gray-500">
        {group.lines.length}
      </span>
    </button>
  );
}

function BranchRow({
  line,
  globalIndex,
  isActive,
  user,
  mastery,
  completions,
  onClick,
}: {
  line: VariationGroup['lines'][number];
  globalIndex: number;
  isActive: boolean;
  user: unknown;
  mastery?: string;
  completions?: number;
  onClick: () => void;
}) {
  const locked = globalIndex > 0 && !user;
  const cat = line.isMainLine ? null : CATEGORY_META[line.primaryCategory ?? ''];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg px-3 py-2 text-left text-xs transition-colors ${
        isActive
          ? 'border border-amber-400/20 bg-amber-400/15 text-amber-300'
          : locked
          ? 'text-gray-600 hover:bg-white/5'
          : 'text-gray-400 hover:bg-white/5 hover:text-white'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <span className="block truncate font-medium leading-tight">{line.name}</span>
          {completions != null && completions > 0 && (
            <span className="text-[10px] text-gray-600">
              {completions} {completions === 1 ? 'completion' : 'completions'}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {line.isMainLine && (
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-500">Ref</span>
          )}
          {cat && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${cat.classes}`}>{cat.label}</span>
          )}
          {locked ? (
            <span className="text-[11px]">🔒</span>
          ) : mastery && mastery !== 'new' ? (
            <span className={`h-1.5 w-1.5 rounded-full ${MASTERY_COLORS[mastery as keyof typeof MASTERY_COLORS]}`} />
          ) : null}
        </div>
      </div>
    </button>
  );
}

function DummyBranchRow({ branch }: { branch: DummyBranch }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-white/10 px-3 py-2 text-xs opacity-50">
      <div className="min-w-0 flex-1">
        <span className="block truncate font-medium text-gray-500 leading-tight">{branch.title}</span>
        <span className="text-[10px] text-gray-600">{branch.punishMove}</span>
      </div>
      <span className="shrink-0 rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-400/70">Soon</span>
    </div>
  );
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
  const [openGroupId, setOpenGroupId] = useState('');
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
            <div className="grid w-full max-w-[1640px] grid-cols-[minmax(0,1fr)_24rem] gap-3 lg:grid-cols-[minmax(0,1fr)_27rem] lg:gap-3">
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
        <div className="mx-auto flex h-full w-full max-w-[1640px] gap-3 lg:gap-3">

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
          <div className="w-[24rem] lg:w-[27rem] shrink-0 h-full flex flex-col gap-3">

            {/* Coach — fixed */}
            <div className="h-[5.75rem] shrink-0">
              <div className="flex h-full items-start gap-1">
                <div className="flex w-[5.5rem] shrink-0 items-start">
                  <div className="relative h-[5.75rem] w-24">
                    <Image
                      src="/coaches/jazmin.png"
                      alt="Jazmin, your opening coach"
                      fill
                      sizes="96px"
                      className="object-contain object-bottom drop-shadow-lg"
                      priority
                      unoptimized
                    />
                  </div>
                </div>
                <div className="relative h-[5.75rem] min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-zinc-900 shadow-lg shadow-black/20">
                  <div className="absolute left-[-7px] top-8 h-4 w-4 rotate-45 border-b border-l border-zinc-200 bg-white" />
                  <p className="max-h-full overflow-hidden text-sm leading-5 text-zinc-700">{coachBubbleText}</p>
                </div>
              </div>
            </div>

            {/* Move list — only in Learn mode */}
            {mode === 'learn' && selectedVariation && (
              <MoveList variation={selectedVariation} currentMoveIndex={currentMoveIndex} />
            )}

            {/* Line selector — accordion grouped by variation */}
            {(() => {
              const groups = groupVariations(opening.variations, opening.name);
              const activeGroupId = openGroupId ||
                groups.find(g => g.lines.some(l => l.id === activeVariationId))?.id ||
                groups[0]?.id;

              function handleGroupToggle(group: VariationGroup) {
                const isNowOpen = activeGroupId !== group.id;
                setOpenGroupId(isNowOpen ? group.id : '__collapsed__');
                if (isNowOpen) {
                  const first = group.lines[0];
                  if (!first) return;
                  const globalIndex = opening!.variations.findIndex(v => v.id === first.id);
                  handleVariationClick(first.id, globalIndex);
                }
              }

              return (
                <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-white/5 bg-(--bg-panel)">
                  {/* Header */}
                  <div className="shrink-0 flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/5">
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Lines</h3>
                    <span className="text-[11px] text-gray-600">
                      {groups.length} var · {opening.variations.length} lines
                    </span>
                  </div>

                  {/* Accordion */}
                  <div className="flex-1 min-h-0 overflow-y-auto py-1">
                    {groups.map(group => {
                      const isOpen = activeGroupId === group.id;
                      const dummies = getDummyBranches(opening!.name, group.displayName);
                      return (
                        <div key={group.id}>
                          <GroupHeader
                            group={group}
                            isOpen={isOpen}
                            onToggle={() => handleGroupToggle(group)}
                          />
                          {isOpen && (
                            <div className="px-3 pb-2 flex flex-col gap-1">
                              {group.lines.map(line => {
                                const globalIndex = opening!.variations.findIndex(v => v.id === line.id);
                                const vProgress = progress?.get(`${opening!.id}/${line.id}`);
                                return (
                                  <BranchRow
                                    key={line.id}
                                    line={line}
                                    globalIndex={globalIndex}
                                    isActive={line.id === activeVariationId}
                                    user={user}
                                    mastery={vProgress?.mastery}
                                    completions={vProgress?.timesCompleted}
                                    onClick={() => handleVariationClick(line.id, globalIndex)}
                                  />
                                );
                              })}
                              {dummies.map(branch => (
                                <DummyBranchRow key={branch.id} branch={branch} />
                              ))}
                            </div>
                          )}
                        </div>
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
              );
            })()}

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
