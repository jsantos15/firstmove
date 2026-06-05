'use client';

import { useState, use, useEffect, useMemo, useRef } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PracticeBoard, type PracticeMode } from '@/components/board/PracticeBoard';
import { SidePanel } from '@/components/board/SidePanel';
import { useOpening, type AppVariation } from '@/hooks/useOpenings';
import { useOpeningPositionLabels } from '@/hooks/useOpeningPositionLabels';
import { MoveList } from '@/components/board/MoveList';
import { CoachBubble } from '@/components/practice/CoachBubble';
import { useAuth } from '@/app/providers';
import { useAllProgress, MASTERY_COLORS } from '@/hooks/useProgress';
import { useCoachSettings } from '@/hooks/useCoachSettings';
import { useBoardSettings } from '@/hooks/useBoardSettings';
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


function BranchRow({
  line,
  globalIndex,
  isActive,
  user,
  mastery,
  completions,
  onClick,
  buttonRef,
  rowIndex = 0,
}: {
  line: VariationGroup['lines'][number];
  globalIndex: number;
  isActive: boolean;
  user: unknown;
  mastery?: string;
  completions?: number;
  onClick: () => void;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
  rowIndex?: number;
}) {
  const locked = globalIndex > 0 && !user;
  const zebraClass = rowIndex % 2 === 0 ? 'bg-white/2' : '';

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className={`group relative w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-xs transition-all ${
        isActive
          ? 'bg-amber-400/10 text-amber-300'
          : locked
            ? `${zebraClass} text-gray-600`
            : `${zebraClass} text-gray-400 hover:bg-white/5 hover:text-white`
      }`}
    >
      <span
        className={`absolute inset-y-2 left-0 w-0.5 rounded-full transition-colors ${
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
      </div>
    </button>
  );
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
  rowIndex = 0,
}: {
  branch: AppVariation;
  isActive: boolean;
  locked: boolean;
  mastery?: string;
  completions?: number;
  openingColor: 'white' | 'black';
  onClick: () => void;
  rowIndex?: number;
}) {
  const metadata = branch.branchMetadata;
  const title = metadata?.lesson_title ?? branch.name;
  const evalLabel = formatBranchEval(branchEvalValue(branch, openingColor));
  const zebraClass = rowIndex % 2 === 0 ? 'bg-white/2' : '';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-xs transition-all ${
        isActive
          ? 'bg-amber-400/10 text-amber-300'
          : locked
            ? `${zebraClass} text-gray-600 opacity-60`
            : `${zebraClass} text-gray-400 hover:bg-white/5 hover:text-white`
      }`}
    >
      <span
        className={`absolute inset-y-2 left-0 w-0.5 rounded-full transition-colors ${
          isActive ? 'bg-amber-400' : 'bg-transparent group-hover:bg-white/15'
        }`}
      />
      <div className="min-w-0 flex-1">
        <span
          className={`block truncate text-xs font-medium leading-tight ${isActive ? 'text-amber-300' : 'text-gray-300'}`}
        >
          {title}
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
          <span className="text-[11px]">🔒</span>
        ) : mastery && mastery !== 'new' ? (
          <span
            className={`h-1.5 w-1.5 rounded-full ${MASTERY_COLORS[mastery as keyof typeof MASTERY_COLORS]}`}
          />
        ) : null}
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
  const [viewingFullLine, setViewingFullLine] = useState(false);
  const activeLineRef = useRef<HTMLButtonElement>(null);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [displayMoveIndex, setDisplayMoveIndex] = useState(-1);
  const [mode, setMode] = useState<PracticeMode>('learn');
  const [coachFeedback, setCoachFeedback] = useState<CoachFeedback | null>(null);
  const [navState, setNavState] = useState({ canGoBack: false, canGoForward: false, isLive: true });
  const practiceBoardRef = useRef<import('@/components/board/PracticeBoard').PracticeBoardHandle | null>(null);
  const { settings: coachSettings } = useCoachSettings();
  const { setSettings: setBoardSettings } = useBoardSettings();

  useEffect(() => {
    return () => { setBoardSettings({ flipBoard: false }); };
  }, [setBoardSettings]);
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
const selectedReferenceVariation =
    opening.variations.find(v => v.id === activeReferenceLineId) ?? opening.variations[0];
  const selectedVariation =
    allPracticeLines.find(v => v.id === selectedLineId) ?? opening.variations[0];
  const activeReferenceGlobalIndex = opening.variations.findIndex(
    v => v.id === activeReferenceLineId
  );
  const selectedLine = allPracticeLines.find(v => v.id === selectedLineId);
  // Branches show all moves; anchor truncation only applies to reference variations.
  const selectedVariationAnchorPly =
    selectedLine?.lineKind !== 'practical_branch'
      ? (selectedLine?.variationAnchorPly ?? null)
      : null;
  // In Practice mode, apply anchor-ply slicing the same way Learn does — unless the
  // user explicitly clicked the Reference button (viewingFullLine), which means they
  // want the full engine continuation. Punish branches always use all their moves.
  const practicedVariation = selectedVariation && {
    ...selectedVariation,
    moves:
      !viewingFullLine && selectedVariationAnchorPly != null
        ? selectedVariation.moves.slice(0, selectedVariationAnchorPly)
        : selectedVariation.moves,
  };
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
    setViewingFullLine(false);
    setCoachFeedback(null);
  }

  function handleBranchClick(branchId: string) {
    if (activeReferenceGlobalIndex > 0 && !user) {
      setShowAuthPrompt(true);
      return;
    }
    setShowAuthPrompt(false);
    setSelectedLineId(branchId);
    setViewingFullLine(false);
    setCoachFeedback(null);
  }

  function handleReferenceLineClick() {
    if (!selectedReferenceVariation || !opening) return;
    const idx = opening.variations.findIndex(v => v.id === selectedReferenceVariation.id);
    if (idx > 0 && !user) {
      setShowAuthPrompt(true);
      return;
    }
    setShowAuthPrompt(false);
    setSelectedLineId(selectedReferenceVariation.id);
    setViewingFullLine(true);
    setCoachFeedback(null);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden px-6 py-3 flex justify-center">
        <div className="flex h-full gap-3 w-full">
          {practicedVariation && (
                <PracticeBoard
                  ref={practiceBoardRef}
                  opening={opening}
                  variation={practicedVariation}
                  mode={mode}
                  coachPersona={coachSettings.persona}
                  onMoveIndexChange={setCurrentMoveIndex}
                  onDisplayIndexChange={(idx) => setDisplayMoveIndex(idx > 0 ? idx - 1 : -1)}
                  onCoachFeedbackChange={setCoachFeedback}
                  onNavStateChange={setNavState}
                  hideControls
                  topBar={
                    <div className="h-15 flex flex-col justify-end pb-2 gap-1">
                      {mode === 'practice' && practicedVariation && (
                        <>
                          <div className="flex justify-end">
                            <span className="text-[11px] tabular-nums text-gray-500">
                              {Math.max(0, currentMoveIndex + 1)}/{practicedVariation.moves.length}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                            <div
                              className="h-full rounded-full bg-amber-400 transition-[width] duration-300 ease-out"
                              style={{
                                width: `${Math.min(100, Math.max(0, (currentMoveIndex + 1) / practicedVariation.moves.length * 100))}%`,
                              }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  }
                  bottomBar={
                    <div className="grid grid-cols-3 items-center py-2.5">
                      <div>
                        {mode === 'practice' && (
                          <button
                            type="button"
                            onClick={() => practiceBoardRef.current?.reset()}
                            className="ml-3 flex h-10 items-center gap-1.5 rounded border border-white/10 px-4 text-sm text-gray-400 transition-colors hover:border-white/20 hover:text-white"
                          >
                            ↺ Restart
                          </button>
                        )}
                      </div>
                      <div className="flex justify-center">
                        <div className="flex items-center divide-x divide-white/10 overflow-hidden rounded-lg border border-white/10">
                          <SidebarNavBtn onClick={() => practiceBoardRef.current?.navigateFirst()} disabled={mode !== 'learn' && !navState.canGoBack} title="First move">
                            <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5"><path d="M3.5 3a.5.5 0 0 1 .5.5v3.793l6.146-4.439A.5.5 0 0 1 11 3.5v9a.5.5 0 0 1-.854.354L4 8.707V12.5a.5.5 0 0 1-1 0v-9a.5.5 0 0 1 .5-.5z" /></svg>
                          </SidebarNavBtn>
                          <SidebarNavBtn onClick={() => practiceBoardRef.current?.navigateBack()} disabled={mode !== 'learn' && !navState.canGoBack} title="Previous move">
                            <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5"><path d="M11.354 3.646a.5.5 0 0 1 0 .708L6.707 9l4.647 4.646a.5.5 0 0 1-.708.708l-5-5a.5.5 0 0 1 0-.708l5-5a.5.5 0 0 1 .708 0z" /></svg>
                          </SidebarNavBtn>
                          <SidebarNavBtn
                            onClick={() => practiceBoardRef.current?.navigateForward()}
                            disabled={mode !== 'learn' && !navState.canGoForward}
                            title="Next move"
                          >
                            <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5"><path d="M4.646 3.646a.5.5 0 0 1 .708 0l5 5a.5.5 0 0 1 0 .708l-5 5a.5.5 0 0 1-.708-.708L9.293 9 4.646 4.354a.5.5 0 0 1 0-.708z" /></svg>
                          </SidebarNavBtn>
                          <SidebarNavBtn onClick={() => practiceBoardRef.current?.navigateLast()} disabled={mode !== 'learn' && navState.isLive} title="Latest move">
                            <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5"><path d="M12.5 3a.5.5 0 0 0-.5.5v3.793L5.854 2.854A.5.5 0 0 0 5 3.5v9a.5.5 0 0 0 .854.354L12 8.207V12.5a.5.5 0 0 0 1 0v-9a.5.5 0 0 0-.5-.5z" /></svg>
                          </SidebarNavBtn>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <BoardSettingsPopover

                        />
                      </div>
                    </div>
                  }
                />
              )}

          <SidePanel
            topBar={
              <>
                <ModeButton active={mode === 'learn'} onClick={() => setMode('learn')}>Learn</ModeButton>
                <ModeButton active={mode === 'practice'} onClick={() => setMode('practice')}>Practice</ModeButton>
              </>
            }
            coach={<CoachBubble feedback={coachFeedback} fallbackText={opening.description} dark />}
          >
            <div className="flex-1 min-h-0 flex flex-col gap-4 px-2 pb-2">

            {/* Move list — anchor moves only until user explicitly views full line */}
            {mode === 'learn' && selectedVariation && (
              <div className="shrink-0 rounded-lg border border-white/10 overflow-hidden">
                <MoveList
                  variation={{
                    ...selectedVariation,
                    moves:
                      !viewingFullLine && selectedVariationAnchorPly != null
                        ? selectedVariation.moves.slice(0, selectedVariationAnchorPly)
                        : selectedVariation.moves,
                  }}
                  currentMoveIndex={currentMoveIndex}
                  selectedMoveIndex={displayMoveIndex}
                  onNavigate={(idx) => practiceBoardRef.current?.navigateTo(idx + 1)}
                  milestones={lessonOpeningMilestones}
                  mode={mode}
                />
              </div>
            )}

            {/* Variations + Lines — each a bordered card */}
            <div className="flex-1 min-h-0 flex flex-col gap-4">

              {/* Variations card */}
              <div className="min-h-0 flex flex-col rounded-lg border border-white/10 overflow-hidden" style={{ flex: 44 }}>
                <div className="shrink-0 flex items-center px-4 py-3 border-b border-white/8">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">{opening.name} Variations</h3>
                </div>

                {/* Accordion */}
                <div className="flex-1 min-h-0 overflow-y-auto">
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
                          <div className="mb-1">
                            {group.lines.map((line, idx) => {
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
                                  rowIndex={idx}
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

              {/* Lines card */}
              <div className="min-h-0 flex flex-col rounded-lg border border-white/10 overflow-hidden" style={{ flex: 34 }}>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  {/* Reference */}
                  <div className="px-4 pt-2.5 pb-1">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-gray-600">Reference (engine continuation)</p>
                  </div>
                  {selectedReferenceVariation ? (
                    <button
                      type="button"
                      onClick={handleReferenceLineClick}
                      className={`group relative w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-xs transition-all ${
                        viewingFullLine
                          ? 'bg-amber-400/10 text-amber-300'
                          : 'bg-white/2 text-gray-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <span
                        className={`absolute inset-y-2 left-0 w-0.5 rounded-full transition-colors ${
                          viewingFullLine ? 'bg-amber-400' : 'bg-transparent group-hover:bg-white/15'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <span className={`block truncate text-xs font-medium leading-tight ${viewingFullLine ? 'text-amber-300' : 'text-gray-300'}`}>
                          {selectedReferenceVariation.name}
                        </span>
                      </div>
                    </button>
                  ) : (
                    <p className="px-4 py-2 text-xs text-gray-600">Select a variation above.</p>
                  )}
                  <div className="border-t border-white/8" />
                  {/* Punish */}
                  <div className="px-4 pt-3 pb-1">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-gray-600">Punish</p>
                  </div>
                  {selectedReferenceBranches.length > 0 ? (
                    <>
                      {selectedReferenceBranches.map((branch, idx) => {
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
                            rowIndex={idx}
                          />
                        );
                      })}
                    </>
                  ) : (
                    <p className="px-4 py-2 text-xs text-gray-600">No punish lines for this variation yet.</p>
                  )}
                </div>
              </div>

            </div>
            {/* end Variations+Lines */}

            </div>
            {/* end sections wrapper */}
          </SidePanel>
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
      className={`flex-1 py-5 text-sm font-semibold transition-colors ${
        active
          ? 'bg-amber-400/15 text-amber-300'
          : 'text-gray-400 hover:bg-white/5 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function SidebarNavBtn({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center justify-center px-5 py-4 text-gray-400 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
    >
      {children}
    </button>
  );
}
