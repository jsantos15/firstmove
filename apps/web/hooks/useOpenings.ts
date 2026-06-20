import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Chess, type Opening, type OpeningMove, type OpeningVariation } from '@firstmove/core';
import {
  getReadyOpeningIndex,
  getOpeningCatalogBySlug,
  getOpeningLineBranchMetadataBySlug,
  getOpeningLinesBySlug,
  type OpeningCatalogRow,
  type OpeningIndexRow,
  type OpeningLineBranchMetadataRow,
  type OpeningLineRow,
} from '@firstmove/supabase';

// ─── Chess helpers ────────────────────────────────────────────────────────────

function buildMoves(sans: string[]): OpeningMove[] {
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

// ─── DB row types ─────────────────────────────────────────────────────────────

export type AppOpening = Omit<Opening, 'variations'> & {
  variations: AppVariation[];
  displayTier?: OpeningCatalogRow['display_tier'];
  isFeatured?: OpeningCatalogRow['is_featured'];
  popularityRank?: OpeningCatalogRow['popularity_rank'];
  popularityScore?: OpeningCatalogRow['popularity_score'];
  popularityGames?: OpeningCatalogRow['popularity_games'];
  hasMainLine?: OpeningCatalogRow['has_main_line'];
  previewFen?: string;
  lineCount?: number;
  referenceLineCount?: number;
  practicalBranchCount?: number;
  practicalBranches: AppVariation[];
};

export type AppVariation = OpeningVariation & {
  engineChecked?: NonNullable<OpeningLineRow['engine_checked']>;
  evalCpByPly?: NonNullable<OpeningLineRow['eval_cp_by_ply']>;
  finalEvalCp?: NonNullable<OpeningLineRow['final_eval_cp']>;
  finalEvalPerspective?: NonNullable<OpeningLineRow['final_eval_perspective']>;
  fullName?: NonNullable<OpeningLineRow['full_name']>;
  primaryCategory?: NonNullable<OpeningLineRow['primary_category']>;
  inclusionOutcome?: NonNullable<OpeningLineRow['inclusion_outcome']>;
  lineDifficulty?: NonNullable<OpeningLineRow['line_difficulty']>;
  isMainLine?: NonNullable<OpeningLineRow['is_main_line']>;
  popularityRank?: NonNullable<OpeningLineRow['popularity_rank']>;
  popularityScore?: NonNullable<OpeningLineRow['popularity_score']>;
  popularityGames?: NonNullable<OpeningLineRow['popularity_games']>;
  sourceName?: NonNullable<OpeningLineRow['source_name']>;
  sourceConfidence?: NonNullable<OpeningLineRow['source_confidence']>;
  variationAnchorSans?: NonNullable<OpeningLineRow['variation_anchor_sans']>;
  variationAnchorPly?: NonNullable<OpeningLineRow['variation_anchor_ply']>;
  variationAnchorName?: NonNullable<OpeningLineRow['variation_anchor_name']>;
  variationAnchorFen?: NonNullable<OpeningLineRow['variation_anchor_fen']>;
  variationPath?: NonNullable<OpeningLineRow['variation_path']>;
  variationDepth?: NonNullable<OpeningLineRow['variation_depth']>;
  lineKind?: NonNullable<OpeningLineRow['line_kind']>;
  branchMetadata?: OpeningLineBranchMetadataRow;
};

const OPENING_INTRO_COPY: Record<string, string> = {
  'italian-game':
    "The Italian Game develops quickly with Bc4, aiming at Black's f7 square while building a strong center and preparing to castle. It teaches active piece play, early pressure, and when to turn development into tactics.",
  'caro-kann-defense':
    'The Caro-Kann Defense is a solid answer to 1.e4 where Black supports ...d5 with ...c6. It teaches sturdy pawn structures, patient development, and clean counterplay without weakening the king.',
};
const OPENING_LIST_CACHE_KEY = 'firstmove:opening-list:v2';
const OPENING_LIST_STALE_TIME_MS = 5 * 60 * 1000;
const OPENING_LIST_GC_TIME_MS = 24 * 60 * 60 * 1000;

function readCachedOpeningList(): AppOpening[] | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    const raw = window.localStorage.getItem(OPENING_LIST_CACHE_KEY);
    if (!raw) return undefined;

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;

    return parsed.filter((item): item is AppOpening => {
      if (!item || typeof item !== 'object') return false;
      const opening = item as Partial<AppOpening>;
      return (
        typeof opening.id === 'string' &&
        typeof opening.name === 'string' &&
        Array.isArray(opening.variations)
      );
    });
  } catch {
    return undefined;
  }
}

function writeCachedOpeningList(openings: AppOpening[]) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(OPENING_LIST_CACHE_KEY, JSON.stringify(openings));
  } catch {
    // Storage can be unavailable in private browsing or quota-constrained devices.
  }
}

function normalizeOpeningDescriptionFields(slug: string, name: string, description: string) {
  const curated = OPENING_INTRO_COPY[slug];
  if (curated) return curated;

  const normalizedDescription = description.trim();
  if (
    normalizedDescription.includes('regenerated from authoritative naming') ||
    normalizedDescription.includes('staged for study')
  ) {
    return `${name} is part of your opening study plan. Focus on the main ideas first, then use each line to learn the typical plans and tactical moments.`;
  }

  return normalizedDescription;
}

function normalizeOpeningDescription(catalog: OpeningCatalogRow) {
  return normalizeOpeningDescriptionFields(catalog.slug, catalog.name, catalog.description);
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
    engineChecked: line.engine_checked,
    evalCpByPly: line.eval_cp_by_ply ?? undefined,
    finalEvalCp: line.final_eval_cp ?? undefined,
    finalEvalPerspective: line.final_eval_perspective ?? undefined,
    fullName: line.full_name ?? undefined,
    primaryCategory: line.primary_category ?? undefined,
    inclusionOutcome: line.inclusion_outcome ?? undefined,
    lineDifficulty: line.line_difficulty ?? undefined,
    isMainLine: line.is_main_line,
    popularityRank: line.popularity_rank ?? undefined,
    popularityScore: line.popularity_score ?? undefined,
    popularityGames: line.popularity_games ?? undefined,
    sourceName: line.source_name ?? undefined,
    sourceConfidence: line.source_confidence ?? undefined,
    variationAnchorSans: line.variation_anchor_sans ?? undefined,
    variationAnchorPly: line.variation_anchor_ply ?? undefined,
    variationAnchorName: line.variation_anchor_name ?? undefined,
    variationAnchorFen: line.variation_anchor_fen ?? undefined,
    variationPath: line.variation_path ?? undefined,
    variationDepth: line.variation_depth ?? undefined,
    lineKind: line.line_kind,
    branchMetadata,
  };
}

// ─── Builder ──────────────────────────────────────────────────────────────────

function compareLineRows(left: OpeningLineRow, right: OpeningLineRow) {
  const leftMain = left.is_main_line ? 1 : 0;
  const rightMain = right.is_main_line ? 1 : 0;
  if (leftMain !== rightMain) {
    return rightMain - leftMain;
  }

  const leftRank = left.popularity_rank ?? Number.POSITIVE_INFINITY;
  const rightRank = right.popularity_rank ?? Number.POSITIVE_INFINITY;
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order;
  }

  return left.name.localeCompare(right.name);
}

function metadataTrainedEvalCp(metadata?: OpeningLineBranchMetadataRow) {
  const finalState =
    metadata?.selection_metadata &&
    typeof metadata.selection_metadata === 'object' &&
    !Array.isArray(metadata.selection_metadata)
      ? metadata.selection_metadata.finalState
      : null;
  if (!finalState || typeof finalState !== 'object' || Array.isArray(finalState)) return null;

  const trainedEvalCp = finalState.trainedEvalCp;
  return typeof trainedEvalCp === 'number' && Number.isFinite(trainedEvalCp)
    ? trainedEvalCp
    : null;
}

function lineEvalFromTrainedPerspective(line: OpeningLineRow, openingColor: 'white' | 'black') {
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
  return metadataTrainedEvalCp(metadata) ?? lineEvalFromTrainedPerspective(line, openingColor);
}

function buildOpening(
  catalog: OpeningCatalogRow,
  lines: OpeningLineRow[],
  options?: {
    branchMetadataRows?: OpeningLineBranchMetadataRow[];
    includeBranchMoves?: boolean;
    includeVariationMoves?: boolean;
  }
): AppOpening {
  const branchMetadataByLineSlug = new Map(
    (options?.branchMetadataRows ?? []).map(row => [row.line_slug, row])
  );
  const referenceLines = lines.filter(line => line.line_kind !== 'practical_branch');
  const branchLines = lines.filter(line => line.line_kind === 'practical_branch');
  const sorted = [...referenceLines].sort(compareLineRows);
  const sortedBranches = [...branchLines].sort((left, right) => {
    const leftMeta = branchMetadataByLineSlug.get(left.slug);
    const rightMeta = branchMetadataByLineSlug.get(right.slug);
    const leftEval = branchEvalForSort(left, leftMeta, catalog.color);
    const rightEval = branchEvalForSort(right, rightMeta, catalog.color);
    if (leftEval !== rightEval) return rightEval - leftEval;
    const leftScore = leftMeta?.branch_score ?? Number.NEGATIVE_INFINITY;
    const rightScore = rightMeta?.branch_score ?? Number.NEGATIVE_INFINITY;
    if (leftScore !== rightScore) return rightScore - leftScore;
    if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order;
    return left.name.localeCompare(right.name);
  });
  const includeVariationMoves = options?.includeVariationMoves ?? true;
  const includeBranchMoves = options?.includeBranchMoves ?? includeVariationMoves;
  const variations: AppVariation[] = sorted.map(line =>
    includeVariationMoves
      ? { ...buildVariationStub(line), moves: buildMoves(line.sans) }
      : buildVariationStub(line)
  );
  const practicalBranches: AppVariation[] = sortedBranches.map(line =>
    includeBranchMoves
      ? {
          ...buildVariationStub(line, branchMetadataByLineSlug.get(line.slug)),
          moves: buildMoves(line.sans),
        }
      : buildVariationStub(line, branchMetadataByLineSlug.get(line.slug))
  );
  const mainLine = sorted[0];

  return {
    id: catalog.slug,
    ecoCode: catalog.eco_code,
    name: catalog.name,
    color: catalog.color,
    difficulty: catalog.difficulty,
    description: normalizeOpeningDescription(catalog),
    tags: catalog.tags,
    moves: mainLine ? buildMoves(mainLine.sans) : [],
    variations,
    practicalBranches,
    displayTier: catalog.display_tier ?? undefined,
    isFeatured: catalog.is_featured ?? undefined,
    popularityRank: catalog.popularity_rank ?? undefined,
    popularityScore: catalog.popularity_score ?? undefined,
    popularityGames: catalog.popularity_games ?? undefined,
    hasMainLine: catalog.has_main_line,
    previewFen: catalog.preview_fen ?? undefined,
    lineCount: lines.length,
    referenceLineCount: referenceLines.length,
    practicalBranchCount: branchLines.length,
  };
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function buildOpeningIndexCard(row: OpeningIndexRow): AppOpening | null {
  if (
    !row.course_slug ||
    !row.course_color ||
    !row.course_difficulty ||
    !row.course_description ||
    !row.name
  ) {
    return null;
  }

  const referenceLineCount = row.reference_line_count ?? 0;
  const practicalBranchCount = row.practical_branch_count ?? 0;
  if (referenceLineCount === 0 || practicalBranchCount === 0) {
    return null;
  }

  const referenceSlugs = row.reference_line_slugs ?? [];
  const referenceNames = row.reference_line_names ?? [];
  const variations = referenceSlugs.map((slug, index): AppVariation => ({
    id: slug,
    name: referenceNames[index] ?? slug,
    moves: [],
  }));

  return {
    id: row.course_slug,
    ecoCode: row.eco_code ?? '',
    name: row.name,
    color: row.course_color,
    difficulty: row.course_difficulty,
    description: normalizeOpeningDescriptionFields(
      row.course_slug,
      row.name,
      row.course_description
    ),
    moves: [],
    variations,
    tags: row.course_tags ?? [],
    practicalBranches: [],
    displayTier: row.course_display_tier ?? undefined,
    isFeatured: row.course_is_featured ?? undefined,
    popularityGames: row.popularity_games ?? undefined,
    hasMainLine: row.course_has_main_line ?? undefined,
    previewFen: row.course_preview_fen ?? row.anchor_fen ?? undefined,
    lineCount: row.course_line_count ?? referenceLineCount + practicalBranchCount,
    referenceLineCount,
    practicalBranchCount,
  };
}

/**
 * Fetches all openings from Supabase. Results are cached indefinitely
 * for the session — opening catalog data doesn't change at runtime.
 */
export function useOpenings() {
  const queryClient = useQueryClient();
  const query = useQuery<AppOpening[]>({
    queryKey: ['openings'],
    staleTime: OPENING_LIST_STALE_TIME_MS,
    gcTime: OPENING_LIST_GC_TIME_MS,
    queryFn: async () => {
      const indexRows = await getReadyOpeningIndex();
      const openings = indexRows.flatMap(row => {
        const opening = buildOpeningIndexCard(row);
        return opening ? [opening] : [];
      });
      writeCachedOpeningList(openings);
      return openings;
    },
  });

  useEffect(() => {
    const cached = readCachedOpeningList();
    if (!cached?.length) return;

    queryClient.setQueryData<AppOpening[]>(['openings'], current => current ?? cached);
  }, [queryClient]);

  return query;
}

/**
 * Fetches a single opening by slug. Shares the same cache key space as
 * useOpenings so TanStack Query deduplicates requests automatically.
 */
export function useOpening(slug: string) {
  return useQuery<AppOpening | null>({
    queryKey: ['openings', slug],
    staleTime: Infinity,
    queryFn: async () => {
      const [catalogRow, lineRows, branchMetadataRows] = await Promise.all([
        getOpeningCatalogBySlug(slug),
        getOpeningLinesBySlug(slug),
        getOpeningLineBranchMetadataBySlug(slug),
      ]);

      if (!catalogRow) {
        return null;
      }

      return buildOpening(catalogRow, lineRows, {
        branchMetadataRows,
        includeBranchMoves: true,
        includeVariationMoves: true,
      });
    },
  });
}
