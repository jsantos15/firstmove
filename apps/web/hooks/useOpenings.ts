import { useQuery } from '@tanstack/react-query';
import { Chess, type Opening, type OpeningMove, type OpeningVariation } from '@firstmove/core';
import {
  getOpeningsCatalog,
  getOpeningCatalogBySlug,
  getOpeningLineBranchMetadataBySlug,
  getOpeningLines,
  getOpeningLinesBySlug,
  type OpeningCatalogRow,
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

export type AppOpening = Opening & {
  displayTier?: OpeningCatalogRow['display_tier'];
  isFeatured?: OpeningCatalogRow['is_featured'];
  popularityRank?: OpeningCatalogRow['popularity_rank'];
  popularityScore?: OpeningCatalogRow['popularity_score'];
  popularityGames?: OpeningCatalogRow['popularity_games'];
  hasMainLine?: OpeningCatalogRow['has_main_line'];
  practicalBranches: AppVariation[];
};

export type AppVariation = OpeningVariation & {
  engineChecked?: OpeningLineRow['engine_checked'];
  evalCpByPly?: OpeningLineRow['eval_cp_by_ply'];
  finalEvalCp?: OpeningLineRow['final_eval_cp'];
  finalEvalPerspective?: OpeningLineRow['final_eval_perspective'];
  fullName?: OpeningLineRow['full_name'];
  primaryCategory?: OpeningLineRow['primary_category'];
  inclusionOutcome?: OpeningLineRow['inclusion_outcome'];
  lineDifficulty?: OpeningLineRow['line_difficulty'];
  isMainLine?: OpeningLineRow['is_main_line'];
  popularityRank?: OpeningLineRow['popularity_rank'];
  popularityScore?: OpeningLineRow['popularity_score'];
  popularityGames?: OpeningLineRow['popularity_games'];
  sourceName?: OpeningLineRow['source_name'];
  sourceConfidence?: OpeningLineRow['source_confidence'];
  variationAnchorSans?: OpeningLineRow['variation_anchor_sans'];
  variationAnchorPly?: OpeningLineRow['variation_anchor_ply'];
  variationAnchorName?: OpeningLineRow['variation_anchor_name'];
  variationAnchorFen?: OpeningLineRow['variation_anchor_fen'];
  lineKind?: OpeningLineRow['line_kind'];
  branchMetadata?: OpeningLineBranchMetadataRow;
};

const OPENING_INTRO_COPY: Record<string, string> = {
  'italian-game':
    "The Italian Game develops quickly with Bc4, aiming at Black's f7 square while building a strong center and preparing to castle. It teaches active piece play, early pressure, and when to turn development into tactics.",
  'caro-kann-defense':
    'The Caro-Kann Defense is a solid answer to 1.e4 where Black supports ...d5 with ...c6. It teaches sturdy pawn structures, patient development, and clean counterplay without weakening the king.',
};

function normalizeOpeningDescription(catalog: OpeningCatalogRow) {
  const curated = OPENING_INTRO_COPY[catalog.slug];
  if (curated) return curated;

  const description = catalog.description.trim();
  if (
    description.includes('regenerated from authoritative naming') ||
    description.includes('staged for study')
  ) {
    return `${catalog.name} is part of your opening study plan. Focus on the main ideas first, then use each line to learn the typical plans and tactical moments.`;
  }

  return description;
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
    lineKind: line.line_kind,
    branchMetadata,
  };
}

// ─── Builder ──────────────────────────────────────────────────────────────────

function compareCatalogRows(left: OpeningCatalogRow, right: OpeningCatalogRow) {
  const tierRank = { core: 1, extended: 2, other: 3 } as const;
  const leftTier =
    left.display_tier && left.display_tier in tierRank
      ? tierRank[left.display_tier as keyof typeof tierRank]
      : 99;
  const rightTier =
    right.display_tier && right.display_tier in tierRank
      ? tierRank[right.display_tier as keyof typeof tierRank]
      : 99;

  if (leftTier !== rightTier) {
    return leftTier - rightTier;
  }

  const leftFeatured = left.is_featured ? 1 : 0;
  const rightFeatured = right.is_featured ? 1 : 0;
  if (leftFeatured !== rightFeatured) {
    return rightFeatured - leftFeatured;
  }

  const leftPopularity = left.popularity_rank ?? Number.POSITIVE_INFINITY;
  const rightPopularity = right.popularity_rank ?? Number.POSITIVE_INFINITY;
  if (leftPopularity !== rightPopularity) {
    return leftPopularity - rightPopularity;
  }

  return left.name.localeCompare(right.name);
}

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
  };
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Fetches all openings from Supabase. Results are cached indefinitely
 * for the session — opening catalog data doesn't change at runtime.
 */
export function useOpenings() {
  return useQuery<AppOpening[]>({
    queryKey: ['openings'],
    staleTime: Infinity,
    queryFn: async () => {
      const [catalogRows, lineRows] = await Promise.all([
        getOpeningsCatalog(),
        getOpeningLines(),
      ]);

      const linesByOpening = new Map<string, OpeningLineRow[]>();
      for (const line of lineRows) {
        const arr = linesByOpening.get(line.opening_slug) ?? [];
        arr.push(line);
        linesByOpening.set(line.opening_slug, arr);
      }

      return [...catalogRows].sort(compareCatalogRows).map(row =>
        buildOpening(row, linesByOpening.get(row.slug) ?? [], {
          includeBranchMoves: false,
          includeVariationMoves: false,
        })
      );
    },
  });
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
