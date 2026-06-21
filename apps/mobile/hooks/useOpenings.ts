import { useQuery } from '@tanstack/react-query';
import { Chess, type Opening, type OpeningMove, type OpeningVariation } from '@firstmove/core';
import {
  getOpeningIndex,
  getOpeningCatalogBySlug,
  getOpeningLinesBySlug,
  getOpeningLineBranchMetadataBySlug,
  type OpeningIndexRow,
  type OpeningCatalogRow,
  type OpeningLineRow,
  type OpeningLineBranchMetadataRow,
} from '@firstmove/supabase';

// ─── Types — mirrors apps/web/hooks/useOpenings.ts exactly ───────────────────

export type AppOpening = Omit<Opening, 'variations'> & {
  variations: AppVariation[];
  practicalBranches: AppVariation[];
  previewFen?: string | null;
  displayTier?: OpeningCatalogRow['display_tier'];
  isFeatured?: OpeningCatalogRow['is_featured'];
  popularityRank?: OpeningCatalogRow['popularity_rank'];
  hasMainLine?: OpeningCatalogRow['has_main_line'];
};

export type AppVariation = OpeningVariation & {
  // Raw SANs stored so PracticeScreen can build moves for one variation on demand
  sans: string[];
  engineChecked?: OpeningLineRow['engine_checked'];
  evalCpByPly?: OpeningLineRow['eval_cp_by_ply'];
  finalEvalCp?: OpeningLineRow['final_eval_cp'];
  finalEvalPerspective?: OpeningLineRow['final_eval_perspective'];
  fullName?: OpeningLineRow['full_name'];
  primaryCategory?: OpeningLineRow['primary_category'];
  inclusionOutcome?: OpeningLineRow['inclusion_outcome'];
  lineDifficulty?: OpeningLineRow['line_difficulty'];
  isMainLine?: OpeningLineRow['is_main_line'];
  lineKind?: OpeningLineRow['line_kind'];
  popularityRank?: OpeningLineRow['popularity_rank'];
  popularityGames?: OpeningLineRow['popularity_games'];
  branchMetadata?: OpeningLineBranchMetadataRow;
};

// ─── Grouping helpers — exact copy from web ───────────────────────────────────

export interface VariationGroup {
  id: string;
  displayName: string;
  lines: AppVariation[];
}

export const MAX_DISPLAYED_BRANCHES_PER_VARIATION = 5;
export const MAX_LOW_EVAL_DISPLAYED_BRANCHES = 1;
export const LOW_EVAL_BRANCH_THRESHOLD_CP = 100;

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

export function groupVariations(variations: AppVariation[], openingName: string): VariationGroup[] {
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

function metadataTrainedEvalCp(metadata?: OpeningLineBranchMetadataRow) {
  const finalState =
    metadata?.selection_metadata &&
    typeof metadata.selection_metadata === 'object' &&
    !Array.isArray(metadata.selection_metadata)
      ? (metadata.selection_metadata as Record<string, unknown>).finalState
      : null;
  if (!finalState || typeof finalState !== 'object' || Array.isArray(finalState)) return null;
  const trainedEvalCp = (finalState as Record<string, unknown>).trainedEvalCp;
  return typeof trainedEvalCp === 'number' && Number.isFinite(trainedEvalCp) ? trainedEvalCp : null;
}

function lineEvalFromPerspective(line: OpeningLineRow, openingColor: 'white' | 'black') {
  if (typeof line.final_eval_cp !== 'number' || !Number.isFinite(line.final_eval_cp)) {
    return Number.NEGATIVE_INFINITY;
  }
  const evalPerspective = line.final_eval_perspective ?? openingColor;
  const whiteEvalCp = evalPerspective === 'white' ? line.final_eval_cp : -line.final_eval_cp;
  return openingColor === 'white' ? whiteEvalCp : -whiteEvalCp;
}

function branchEvalForSort(
  line: OpeningLineRow,
  metadata: OpeningLineBranchMetadataRow | undefined,
  openingColor: 'white' | 'black'
) {
  return metadataTrainedEvalCp(metadata) ?? lineEvalFromPerspective(line, openingColor);
}

export function formatBranchEval(value?: number | null): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (Math.abs(value) >= 9000) return '#';
  if (Math.abs(value) < 10) return '0.0';
  return `${value > 0 ? '+' : '-'}${(Math.abs(value) / 100).toFixed(1)}`;
}

export function branchEvalValue(branch: AppVariation, openingColor: 'white' | 'black'): number {
  const metadata = branch.branchMetadata;
  return (
    metadataTrainedEvalCp(metadata) ??
    (() => {
      if (typeof branch.finalEvalCp !== 'number' || !Number.isFinite(branch.finalEvalCp)) {
        return Number.NEGATIVE_INFINITY;
      }
      const evalPerspective = branch.finalEvalPerspective ?? openingColor;
      const whiteEvalCp = evalPerspective === 'white' ? branch.finalEvalCp : -branch.finalEvalCp;
      return openingColor === 'white' ? whiteEvalCp : -whiteEvalCp;
    })()
  );
}

export function sortAndLimitDisplayedBranches(
  branches: AppVariation[],
  openingColor: 'white' | 'black'
): AppVariation[] {
  let lowEvalCount = 0;
  return [...branches]
    .sort((a, b) => {
      const aEval = branchEvalValue(a, openingColor);
      const bEval = branchEvalValue(b, openingColor);
      if (aEval !== bEval) return bEval - aEval;
      const aScore = a.branchMetadata?.branch_score ?? Number.NEGATIVE_INFINITY;
      const bScore = b.branchMetadata?.branch_score ?? Number.NEGATIVE_INFINITY;
      if (aScore !== bScore) return bScore - aScore;
      return a.name.localeCompare(b.name);
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

// ─── Build helpers ────────────────────────────────────────────────────────────

export function buildMovesFromSans(sans: string[]): OpeningMove[] {
  const chess = new Chess();
  const moves: OpeningMove[] = [];
  for (const san of sans) {
    try {
      const result = chess.move(san);
      moves.push({ san: result.san, fen: chess.fen() });
    } catch {
      break;
    }
  }
  return moves;
}

function buildVariationStub(
  line: OpeningLineRow,
  branchMetadata?: OpeningLineBranchMetadataRow
): AppVariation {
  return {
    id: line.slug,
    name: line.name,
    description: line.description ?? undefined,
    moves: [],
    sans: line.sans,
    engineChecked: line.engine_checked,
    evalCpByPly: line.eval_cp_by_ply ?? undefined,
    finalEvalCp: line.final_eval_cp ?? undefined,
    finalEvalPerspective: line.final_eval_perspective ?? undefined,
    fullName: line.full_name ?? undefined,
    primaryCategory: line.primary_category ?? undefined,
    inclusionOutcome: line.inclusion_outcome ?? undefined,
    lineDifficulty: line.line_difficulty ?? undefined,
    isMainLine: line.is_main_line,
    lineKind: line.line_kind,
    popularityRank: line.popularity_rank ?? undefined,
    popularityGames: line.popularity_games ?? undefined,
    branchMetadata,
  };
}

function compareLineRows(a: OpeningLineRow, b: OpeningLineRow) {
  const aMain = a.is_main_line ? 1 : 0;
  const bMain = b.is_main_line ? 1 : 0;
  if (aMain !== bMain) return bMain - aMain;
  const aRank = a.popularity_rank ?? Number.POSITIVE_INFINITY;
  const bRank = b.popularity_rank ?? Number.POSITIVE_INFINITY;
  if (aRank !== bRank) return aRank - bRank;
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.name.localeCompare(b.name);
}

function buildOpening(
  catalog: OpeningCatalogRow,
  lines: OpeningLineRow[],
  branchMetadataRows: OpeningLineBranchMetadataRow[]
): AppOpening {
  const metaBySlug = new Map(branchMetadataRows.map(r => [r.line_slug, r]));

  const referenceLines = lines.filter(l => l.line_kind !== 'practical_branch');
  const branchLines    = lines.filter(l => l.line_kind === 'practical_branch');

  const sorted = [...referenceLines].sort(compareLineRows);
  const sortedBranches = [...branchLines].sort((a, b) => {
    const aMeta = metaBySlug.get(a.slug);
    const bMeta = metaBySlug.get(b.slug);
    const aEval = branchEvalForSort(a, aMeta, catalog.color);
    const bEval = branchEvalForSort(b, bMeta, catalog.color);
    if (aEval !== bEval) return bEval - aEval;
    const aScore = aMeta?.branch_score ?? Number.NEGATIVE_INFINITY;
    const bScore = bMeta?.branch_score ?? Number.NEGATIVE_INFINITY;
    if (aScore !== bScore) return bScore - aScore;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name);
  });

  return {
    id: catalog.slug,
    ecoCode: catalog.eco_code,
    name: catalog.name,
    color: catalog.color,
    difficulty: catalog.difficulty,
    description: catalog.description,
    tags: catalog.tags,
    moves: [],
    variations: sorted.map(l => buildVariationStub(l)),
    practicalBranches: sortedBranches.map(l => buildVariationStub(l, metaBySlug.get(l.slug))),
    previewFen: catalog.preview_fen,
    displayTier: catalog.display_tier ?? undefined,
    isFeatured: catalog.is_featured ?? undefined,
    popularityRank: catalog.popularity_rank ?? undefined,
    hasMainLine: catalog.has_main_line,
  };
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useOpeningIndex() {
  return useQuery<OpeningIndexRow[]>({
    queryKey: ['openings', 'index'],
    staleTime: 1000 * 60 * 10,
    queryFn: () => getOpeningIndex(),
  });
}

export function useOpening(slug: string) {
  return useQuery<AppOpening | null>({
    queryKey: ['openings', slug],
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const [catalogRow, lineRows, branchMetadataRows] = await Promise.all([
        getOpeningCatalogBySlug(slug),
        getOpeningLinesBySlug(slug),
        getOpeningLineBranchMetadataBySlug(slug),
      ]);
      if (!catalogRow) return null;
      return buildOpening(catalogRow, lineRows, branchMetadataRows);
    },
  });
}
