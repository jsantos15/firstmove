import { useQuery } from '@tanstack/react-query';
import { Chess, type Opening, type OpeningMove, type OpeningVariation } from '@firstmove/core';
import {
  getOpeningsCatalog,
  getOpeningCatalogBySlug,
  getOpeningLines,
  getOpeningLinesBySlug,
  type OpeningCatalogRow,
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

type AppOpening = Opening & {
  displayTier?: OpeningCatalogRow['display_tier'];
  isFeatured?: OpeningCatalogRow['is_featured'];
  popularityRank?: OpeningCatalogRow['popularity_rank'];
  popularityScore?: OpeningCatalogRow['popularity_score'];
  popularityGames?: OpeningCatalogRow['popularity_games'];
  hasMainLine?: OpeningCatalogRow['has_main_line'];
};

type AppVariation = OpeningVariation & {
  engineChecked?: OpeningLineRow['engine_checked'];
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
};

function buildVariationStub(line: OpeningLineRow): AppVariation {
  return {
    id: line.slug,
    name: line.name,
    description: line.description ?? undefined,
    moves: [],
    engineChecked: line.engine_checked,
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

  const leftPopularity = left.popularity_rank ?? Number.POSITIVE_INFINITY;
  const rightPopularity = right.popularity_rank ?? Number.POSITIVE_INFINITY;
  if (leftPopularity !== rightPopularity) {
    return leftPopularity - rightPopularity;
  }

  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order;
  }

  return left.name.localeCompare(right.name);
}

function buildOpening(
  catalog: OpeningCatalogRow,
  lines: OpeningLineRow[],
  options?: { includeVariationMoves?: boolean }
): AppOpening {
  const sorted = [...lines].sort(compareLineRows);
  const includeVariationMoves = options?.includeVariationMoves ?? true;
  const variations: AppVariation[] = sorted.map(line =>
    includeVariationMoves
      ? {
          ...buildVariationStub(line),
          moves: buildMoves(line.sans),
        }
      : buildVariationStub(line)
  );
  const mainLine = sorted[0];

  return {
    id: catalog.slug,
    ecoCode: catalog.eco_code,
    name: catalog.name,
    color: catalog.color,
    difficulty: catalog.difficulty,
    description: catalog.description,
    tags: catalog.tags,
    moves: mainLine ? buildMoves(mainLine.sans) : [],
    variations,
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
      const [catalogRow, lineRows] = await Promise.all([
        getOpeningCatalogBySlug(slug),
        getOpeningLinesBySlug(slug),
      ]);

      if (!catalogRow) {
        return null;
      }

      return buildOpening(catalogRow, lineRows, {
        includeVariationMoves: true,
      });
    },
  });
}
