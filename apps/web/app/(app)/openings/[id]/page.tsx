'use client';

import { useState, use, useEffect, useMemo, useRef } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PracticeBoard, type PracticeMode } from '@/components/board/PracticeBoard';
import { useOpening, type AppVariation } from '@/hooks/useOpenings';
import { useOpeningPositionLabels } from '@/hooks/useOpeningPositionLabels';
import { MoveList } from '@/components/board/MoveList';
import { CoachBubble } from '@/components/practice/CoachBubble';
import { useAuth } from '@/app/providers';
import { useAllProgress, MASTERY_COLORS } from '@/hooks/useProgress';
import { useCoachSettings } from '@/hooks/useCoachSettings';
import { BoardSettingsPopover } from '@/components/board/BoardSettingsPopover';
import type { CoachFeedback } from '@/lib/coachFeedback';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variation?: string }>;
}

// ─── Variation grouping ───────────────────────────────────────────────────────

interface VariationGroup {
  id: string;
  displayName: string;
  lines: AppVariation[];
}

const MAX_DISPLAYED_BRANCHES_PER_VARIATION = 5;
const MAX_LOW_EVAL_DISPLAYED_BRANCHES = 1;
const LOW_EVAL_BRANCH_THRESHOLD_CP = 100;

function extractGroupName(fullName: string | undefined, openingName: string): string {
  if (!fullName) return openingName;
  const prefix = `${openingName}: `;
  const remainder = fullName.startsWith(prefix) ? fullName.slice(prefix.length) : fullName;
  const commaIdx = remainder.indexOf(',');
  return commaIdx === -1 ? remainder : remainder.slice(0, commaIdx).trim();
}

function slugifyGroup(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeOpeningLabel(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function groupVariations(variations: AppVariation[], openingName: string): VariationGroup[] {
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

// ─── Accordion group row ──────────────────────────────────────────────────────

function GroupHeader({
  group,
  childCount,
  isOpen,
  hasActiveChild,
  onClick,
}: {
  group: VariationGroup;
  childCount: number;
  isOpen: boolean;
  hasActiveChild: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center transition-colors ${
        hasActiveChild ? 'bg-amber-400/10' : 'hover:bg-white/3'
      }`}
    >
      <span
        className={`h-9 w-8 flex shrink-0 items-center justify-center ${
          hasActiveChild ? 'text-amber-400' : 'text-gray-600'
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
          className={`h-3 w-3 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </span>
      <span
        className={`flex-1 flex items-center justify-between gap-2 py-2.5 pr-4 min-w-0 text-left text-sm font-medium transition-colors ${
          hasActiveChild ? 'text-amber-300' : 'text-gray-400'
        }`}
      >
        <span className="truncate">{group.displayName}</span>
        {childCount > 0 && (
          <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-gray-500">
            {childCount}
          </span>
        )}
      </span>
    </button>
  );
}

function buildAnchorNotation(sans: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < sans.length; i++) {
    if (i % 2 === 0) parts.push(`${Math.floor(i / 2) + 1}. ${sans[i]}`);
    else parts[parts.length - 1] += ` ${sans[i]}`;
  }
  return parts.join('  ');
}

function BranchRow({
  line,
  globalIndex,
  isActive,
  user,
  mastery,
  completions,
  onClick,
  buttonRef,
}: {
  line: VariationGroup['lines'][number];
  globalIndex: number;
  isActive: boolean;
  user: unknown;
  mastery?: string;
  completions?: number;
  onClick: () => void;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const locked = globalIndex > 0 && !user;
  const anchorSans = line.variationAnchorSans;
  const anchorName = line.variationAnchorName;

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className={`group relative w-full flex items-start gap-2.5 px-3 py-2 text-left text-xs transition-all ${
        isActive
          ? 'bg-amber-400/8 text-amber-300'
          : locked
            ? 'text-gray-600'
            : 'text-gray-400 hover:bg-white/4 hover:text-white'
      }`}
    >
      {/* Left accent bar */}
      <span
        className={`absolute inset-y-1.5 left-0 w-0.5 rounded-full transition-colors ${
          isActive ? 'bg-amber-400' : 'bg-transparent group-hover:bg-white/15'
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium leading-tight">{line.name}</span>
          <div className="flex shrink-0 items-center gap-1.5">
            {completions != null && completions > 0 && (
              <span className="text-[10px] text-gray-600">{completions}×</span>
            )}
            {locked ? (
              <span className="text-[11px]">🔒</span>
            ) : mastery && mastery !== 'new' ? (
              <span
                className={`h-1.5 w-1.5 rounded-full ${MASTERY_COLORS[mastery as keyof typeof MASTERY_COLORS]}`}
              />
            ) : null}
          </div>
        </div>
        {isActive && anchorSans && anchorSans.length > 0 && (
          <div className="mt-1.5">
            {anchorName && (
              <p className="mb-0.5 truncate text-[9px] text-amber-400/50">{anchorName}</p>
            )}
            <p className="font-mono text-[9px] leading-relaxed text-amber-300/40 break-words whitespace-normal">
              {buildAnchorNotation(anchorSans)}
            </p>
          </div>
        )}
      </div>
    </button>
  );
}

function ReferenceLineMoves({ variation }: { variation: AppVariation | undefined }) {
  if (!variation || variation.moves.length === 0) {
    return (
      <div className="flex-1 px-4 py-3 text-xs text-gray-600">
        {variation ? 'No moves available.' : 'Select a variation to see its moves.'}
      </div>
    );
  }

  const moves = variation.moves;
  const pairs: Array<{ moveNum: number; white: string; black?: string }> = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ moveNum: Math.floor(i / 2) + 1, white: moves[i].san, black: moves[i + 1]?.san });
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
      {pairs.map(pair => (
        <div key={pair.moveNum} className="flex items-center gap-1 py-0.5">
          <span className="w-6 shrink-0 select-none pr-1 text-right font-mono text-[11px] text-gray-600">
            {pair.moveNum}.
          </span>
          <span className="flex-1 font-mono text-xs text-gray-300">{pair.white}</span>
          <span className="flex-1 font-mono text-xs text-gray-400">{pair.black ?? ''}</span>
        </div>
      ))}
    </div>
  );
}

function formatBranchPercent(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `${Math.round(value * 100)}%`;
}

function formatBranchEval(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (Math.abs(value) >= 9000) return '#';
  if (Math.abs(value) < 10) return '0.0';
  return `${value > 0 ? '+' : '-'}${(Math.abs(value) / 100).toFixed(1)}`;
}

function lineEvalFromTrainedPerspective(
  value: number | null | undefined,
  perspective: 'white' | 'black' | null | undefined,
  openingColor: 'white' | 'black'
) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return Number.NEGATIVE_INFINITY;
  const evalPerspective = perspective ?? openingColor;
  const whiteEvalCp = evalPerspective === 'white' ? value : -value;
  return openingColor === 'white' ? whiteEvalCp : -whiteEvalCp;
}

function metadataTrainedEvalCp(branch: AppVariation) {
  const finalState =
    branch.branchMetadata?.selection_metadata &&
    typeof branch.branchMetadata.selection_metadata === 'object' &&
    !Array.isArray(branch.branchMetadata.selection_metadata)
      ? branch.branchMetadata.selection_metadata.finalState
      : null;
  if (!finalState || typeof finalState !== 'object' || Array.isArray(finalState)) return null;

  const trainedEvalCp = finalState.trainedEvalCp;
  return typeof trainedEvalCp === 'number' && Number.isFinite(trainedEvalCp)
    ? trainedEvalCp
    : null;
}

function branchEvalValue(branch: AppVariation, openingColor: 'white' | 'black') {
  return (
    metadataTrainedEvalCp(branch) ??
    lineEvalFromTrainedPerspective(branch.finalEvalCp, branch.finalEvalPerspective, openingColor)
  );
}

function sortAndLimitDisplayedBranches(branches: AppVariation[], openingColor: 'white' | 'black') {
  let lowEvalCount = 0;
  return [...branches]
    .sort((left, right) => {
      const leftEval = branchEvalValue(left, openingColor);
      const rightEval = branchEvalValue(right, openingColor);
      if (leftEval !== rightEval) return rightEval - leftEval;
      const leftScore = left.branchMetadata?.branch_score ?? Number.NEGATIVE_INFINITY;
      const rightScore = right.branchMetadata?.branch_score ?? Number.NEGATIVE_INFINITY;
      if (leftScore !== rightScore) return rightScore - leftScore;
      return left.name.localeCompare(right.name);
    })
    .filter(branch => {
      const evalCp = branchEvalValue(branch, openingColor);
      if (Number.isFinite(evalCp) && evalCp < LOW_EVAL_BRANCH_THRESHOLD_CP) {
        lowEvalCount += 1;
        return lowEvalCount <= MAX_LOW_EVAL_DISPLAYED_BRANCHES;
      }
      return true;
    })
    .slice(0, MAX_DISPLAYED_BRANCHES_PER_VARIATION);
}

function PracticalBranchRow({
  branch,
  isActive,
  locked,
  mastery,
  completions,
  openingColor,
  onClick,
}: {
  branch: AppVariation;
  isActive: boolean;
  locked: boolean;
  mastery?: string;
  completions?: number;
  openingColor: 'white' | 'black';
  onClick: () => void;
}) {
  const metadata = branch.branchMetadata;
  const title = metadata?.lesson_title ?? branch.name;
  const trigger = metadata?.trigger_move_san
    ? `vs ${metadata.trigger_move_san}`
    : 'Practice branch';
  const playRate = formatBranchPercent(metadata?.trigger_move_play_rate);
  const games = metadata?.trigger_move_games;
  const evalLabel = formatBranchEval(branchEvalValue(branch, openingColor));

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative w-full rounded-lg border px-3 py-2 text-left transition-colors ${
        isActive
          ? 'border-amber-400/30 bg-amber-400/10'
          : locked
            ? 'border-white/5 bg-white/[0.02] opacity-60'
            : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'
      }`}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <span
            className={`block truncate text-xs font-medium leading-tight ${isActive ? 'text-amber-300' : 'text-gray-300'}`}
          >
            {title}
          </span>
          <span className="mt-1 block truncate text-[10px] text-gray-600">
            {trigger}
            {playRate ? ` · ${playRate}` : ''}
            {games ? ` · ${games.toLocaleString()} games` : ''}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {evalLabel && (
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] tabular-nums text-gray-400">
              {evalLabel}
            </span>
          )}
          {completions != null && completions > 0 && (
            <span className="text-[10px] text-gray-600">{completions}x</span>
          )}
          {locked ? (
            <span className="text-[11px]">Lock</span>
          ) : mastery && mastery !== 'new' ? (
            <span
              className={`h-1.5 w-1.5 rounded-full ${MASTERY_COLORS[mastery as keyof typeof MASTERY_COLORS]}`}
            />
          ) : null}
        </div>
      </div>
    </button>
  );
}

export default function PracticePage({ params, searchParams }: PageProps) {
  const { id } = use(params);
  const { variation: variationParam } = use(searchParams);
  const { data: opening, isLoading } = useOpening(id);
  const { user } = useAuth();
  const { data: progress } = useAllProgress();
  const [expandedGroupId, setExpandedGroupId] = useState('');
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedReferenceLineId, setSelectedReferenceLineId] = useState<string | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [bottomTab, setBottomTab] = useState<'line' | 'branches'>('line');
  const activeLineRef = useRef<HTMLButtonElement>(null);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [mode, setMode] = useState<PracticeMode>('learn');
  const [coachFeedback, setCoachFeedback] = useState<CoachFeedback | null>(null);
  const { settings: coachSettings } = useCoachSettings();
  const allPracticeLines = useMemo(
    () => [...(opening?.variations ?? []), ...(opening?.practicalBranches ?? [])],
    [opening?.practicalBranches, opening?.variations]
  );
  const selectedVariationForLabels =
    allPracticeLines.find(v => v.id === selectedLineId) ?? opening?.variations[0];
  const { milestones: openingLabelMilestones } = useOpeningPositionLabels(
    selectedVariationForLabels?.moves ?? []
  );
  const lessonOpeningMilestones = useMemo(() => {
    if (!opening) {
      return [];
    }

    const lessonName = normalizeOpeningLabel(opening.name);
    return openingLabelMilestones.filter(milestone => {
      const family = normalizeOpeningLabel(milestone.family);
      const name = normalizeOpeningLabel(milestone.name);

      return family === lessonName || name === lessonName || name.startsWith(`${lessonName}:`);
    });
  }, [opening, openingLabelMilestones]);

  // Auto-expand and select a line once data loads.
  // If a ?variation= param was provided, select that line and expand its group.
  useEffect(() => {
    if (!opening || selectedLineId) return;
    const gs = groupVariations(opening.variations, opening.name);
    let nextExpandedGroupId = '';
    let nextSelectedLineId = '';
    let nextSelectedReferenceLineId = '';

    if (variationParam) {
      const targetLine = opening.variations.find(v => v.id === variationParam);
      if (targetLine) {
        const targetGroup = gs.find(g => g.lines.some(l => l.id === variationParam));
        nextExpandedGroupId = targetGroup?.id ?? '';
        nextSelectedLineId = targetLine.id;
        nextSelectedReferenceLineId = targetLine.id;
      } else {
        const targetBranch = opening.practicalBranches.find(v => v.id === variationParam);
        const parentLineId = targetBranch?.branchMetadata?.parent_line_slug;
        if (targetBranch && parentLineId) {
          const targetGroup = gs.find(g => g.lines.some(l => l.id === parentLineId));
          nextExpandedGroupId = targetGroup?.id ?? '';
          nextSelectedReferenceLineId = parentLineId;
          nextSelectedLineId = targetBranch.id;
        }
      }
    }

    if (!nextSelectedLineId) {
      const first = gs[0];
      const firstLine = first?.lines[0];
      if (first && firstLine) {
        nextExpandedGroupId = first.id;
        nextSelectedLineId = firstLine.id;
        nextSelectedReferenceLineId = firstLine.id;
      }
    }

    if (!nextSelectedLineId) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setExpandedGroupId(nextExpandedGroupId);
      setSelectedLineId(nextSelectedLineId);
      setSelectedReferenceLineId(nextSelectedReferenceLineId);
    });

    return () => {
      cancelled = true;
    };
  }, [opening?.id, variationParam]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedLineId]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!opening) notFound();

  const groups = groupVariations(opening.variations, opening.name);
  const activeReferenceLineId = selectedReferenceLineId ?? selectedLineId;
  const activeGroup = groups.find(g => g.lines.some(l => l.id === activeReferenceLineId));
  const selectedReferenceVariation =
    opening.variations.find(v => v.id === activeReferenceLineId) ?? opening.variations[0];
  const selectedVariation =
    allPracticeLines.find(v => v.id === selectedLineId) ?? opening.variations[0];
  const activeReferenceGlobalIndex = opening.variations.findIndex(
    v => v.id === activeReferenceLineId
  );
  const selectedReferenceBranches = sortAndLimitDisplayedBranches(
    opening.practicalBranches.filter(
      branch => branch.branchMetadata?.parent_line_slug === activeReferenceLineId
    ),
    opening.color
  );

  // Group header click: toggle expand/collapse and auto-select first child if needed
  function handleGroupClick(group: VariationGroup) {
    const isExpanded = expandedGroupId === group.id;
    setExpandedGroupId(isExpanded ? '' : group.id);
    // Auto-select the first child line when opening a group that has no active selection
    if (!isExpanded) {
      const hasActiveChild = group.lines.some(l => l.id === activeReferenceLineId);
      if (!hasActiveChild) {
        const firstLine = group.lines[0];
        if (firstLine) {
          setSelectedLineId(firstLine.id);
          setSelectedReferenceLineId(firstLine.id);
          setCoachFeedback(null);
          setShowAuthPrompt(false);
        }
      }
    }
  }

  function handleLineClick(lineId: string, globalIndex: number) {
    if (globalIndex > 0 && !user) {
      setShowAuthPrompt(true);
      return;
    }
    setShowAuthPrompt(false);
    setSelectedLineId(lineId);
    setSelectedReferenceLineId(lineId);
    setCoachFeedback(null);
  }

  function handleBranchClick(branchId: string) {
    if (activeReferenceGlobalIndex > 0 && !user) {
      setShowAuthPrompt(true);
      return;
    }
    setShowAuthPrompt(false);
    setSelectedLineId(branchId);
    setCoachFeedback(null);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-14 shrink-0 bg-(--bg-base)/80 backdrop-blur z-10">
        <div className="flex h-full items-center px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/openings"
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              ← Openings
            </Link>
            <span className="text-white/20">/</span>
            <span className="truncate text-white font-medium text-sm">{opening.name}</span>
          </div>

          <div className="pointer-events-none absolute inset-x-4 flex justify-center lg:inset-x-6">
            <div className="grid w-full max-w-410 grid-cols-[minmax(0,1fr)_24rem] gap-3 lg:grid-cols-[minmax(0,1fr)_27rem] lg:gap-3">
              <div className="flex justify-center sm:translate-x-4.5">
                <div className="pointer-events-auto flex overflow-hidden rounded-xl border border-white/10">
                  <ModeButton active={mode === 'learn'} onClick={() => setMode('learn')}>
                    Learn
                  </ModeButton>
                  <ModeButton active={mode === 'practice'} onClick={() => setMode('practice')}>
                    Practice
                  </ModeButton>
                </div>
              </div>
              <div />
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden px-4 pb-3 pt-2 lg:px-6 lg:pb-4 lg:pt-3">
        <div className="mx-auto flex h-full w-full max-w-410 gap-3 lg:gap-3">
          {/* Board column */}
          <div className="flex h-full min-w-0 flex-1 justify-end">
            <div className="h-full max-w-full shrink" style={{ aspectRatio: '1 / 1' }}>
              {selectedVariation && (
                <PracticeBoard
                  opening={opening}
                  variation={selectedVariation}
                  mode={mode}
                  coachPersona={coachSettings.persona}
                  onMoveIndexChange={setCurrentMoveIndex}
                  onCoachFeedbackChange={setCoachFeedback}
                  controlsRight={<BoardSettingsPopover />}
                />
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-[24rem] lg:w-108 shrink-0 h-full flex flex-col gap-3">
            {/* Coach — fixed */}
            <CoachBubble feedback={coachFeedback} fallbackText={opening.description} />

            {/* Move list — only in Learn mode */}
            {mode === 'learn' && selectedVariation && (
              <MoveList
                variation={selectedVariation}
                currentMoveIndex={currentMoveIndex}
                milestones={lessonOpeningMilestones}
              />
            )}

            {/* Variations + Branches panels */}
            <div className="flex-1 min-h-0 flex flex-col gap-3">
              {/* Variations panel */}
              <div
                className="min-h-0 flex flex-col rounded-xl border border-white/5 bg-(--bg-panel)"
                style={{ flex: 44 }}
              >
                {/* Panel header */}
                <div className="shrink-0 flex items-start justify-between px-4 pt-4 pb-3 border-b border-white/5">
                  <div>
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Variations
                    </h3>
                    <p className="mt-0.5 text-[10px] text-gray-600">
                      Reference continuations generated from the named position
                    </p>
                  </div>
                  <span className="text-[11px] text-gray-600 mt-0.5">
                    {groups.length} var · {opening.variations.length} lines
                  </span>
                </div>

                {/* Accordion */}
                <div className="flex-1 min-h-0 overflow-y-auto py-1">
                  {groups.map(group => {
                    const isExpanded = expandedGroupId === group.id;
                    const hasActiveChild = group.lines.some(l => l.id === activeReferenceLineId);

                    return (
                      <div key={group.id}>
                        <GroupHeader
                          group={group}
                          childCount={group.lines.length}
                          isOpen={isExpanded}
                          hasActiveChild={hasActiveChild}
                          onClick={() => handleGroupClick(group)}
                        />
                        {isExpanded && group.lines.length > 0 && (
                          <div className="mx-3 mb-2.5 mt-0.5 overflow-hidden rounded-lg border border-white/5 divide-y divide-white/5">
                            {group.lines.map(line => {
                              const globalIndex = opening.variations.findIndex(
                                v => v.id === line.id
                              );
                              const vProgress = progress?.get(`${opening.id}/${line.id}`);
                              return (
                                <BranchRow
                                  key={line.id}
                                  line={line}
                                  globalIndex={globalIndex}
                                  isActive={line.id === activeReferenceLineId}
                                  user={user}
                                  mastery={vProgress?.mastery}
                                  completions={vProgress?.timesCompleted}
                                  onClick={() => handleLineClick(line.id, globalIndex)}
                                  buttonRef={
                                    line.id === activeReferenceLineId ? activeLineRef : undefined
                                  }
                                />
                              );
                            })}
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

              {/* Reference line + Branches panel */}
              <div
                className="min-h-0 flex flex-col rounded-xl border border-white/5 bg-(--bg-panel)"
                style={{ flex: 56 }}
              >
                {/* Tabs */}
                <div className="shrink-0 flex border-b border-white/5">
                  <button
                    type="button"
                    onClick={() => setBottomTab('line')}
                    className={`relative flex-1 py-2.5 text-xs font-medium transition-colors ${
                      bottomTab === 'line' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    Reference Line
                    {bottomTab === 'line' && (
                      <span className="absolute inset-x-0 bottom-0 h-px bg-amber-400" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBottomTab('branches')}
                    className={`relative flex-1 py-2.5 text-xs font-medium transition-colors ${
                      bottomTab === 'branches' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    Branches
                    {selectedReferenceBranches.length > 0 && (
                      <span className="ml-1 text-gray-600">
                        ({selectedReferenceBranches.length})
                      </span>
                    )}
                    {bottomTab === 'branches' && (
                      <span className="absolute inset-x-0 bottom-0 h-px bg-amber-400" />
                    )}
                  </button>
                </div>

                {bottomTab === 'line' ? (
                  <ReferenceLineMoves variation={selectedReferenceVariation} />
                ) : selectedReferenceBranches.length > 0 ? (
                  <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 flex flex-col gap-1.5">
                    {selectedReferenceBranches.map(branch => {
                      const branchProgress = progress?.get(`${opening.id}/${branch.id}`);
                      return (
                        <PracticalBranchRow
                          key={branch.id}
                          branch={branch}
                          isActive={branch.id === selectedLineId}
                          locked={activeReferenceGlobalIndex > 0 && !user}
                          mastery={branchProgress?.mastery}
                          completions={branchProgress?.timesCompleted}
                          openingColor={opening.color}
                          onClick={() => handleBranchClick(branch.id)}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex-1 px-4 py-3 text-xs text-gray-600">
                    No practical branches stored for this variation yet.
                  </div>
                )}
              </div>
            </div>
            {/* end variations+branches */}
          </div>
          {/* end sidebar */}
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-28 px-7 py-3 text-base font-semibold transition-colors ${
        active
          ? 'bg-amber-400/15 text-amber-300'
          : 'text-gray-400 hover:bg-white/5 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
