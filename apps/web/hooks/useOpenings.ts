import { useQuery } from '@tanstack/react-query';
import { Chess } from 'chess.js';
import { createClient } from '@/lib/supabase/client';
import type { Opening, OpeningMove, OpeningVariation } from '@firstmove/core';

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

interface CatalogRow {
  slug: string;
  eco_code: string;
  name: string;
  color: 'white' | 'black';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  description: string;
  tags: string[];
}

interface LineRow {
  slug: string;
  opening_slug: string;
  name: string;
  description: string | null;
  sans: string[];
  sort_order: number;
}

// ─── Builder ──────────────────────────────────────────────────────────────────

function buildOpening(catalog: CatalogRow, lines: LineRow[]): Opening {
  const sorted = [...lines].sort((a, b) => a.sort_order - b.sort_order);
  const variations: OpeningVariation[] = sorted.map(line => ({
    id: line.slug,
    name: line.name,
    description: line.description ?? undefined,
    moves: buildMoves(line.sans),
  }));

  return {
    id: catalog.slug,
    ecoCode: catalog.eco_code,
    name: catalog.name,
    color: catalog.color,
    difficulty: catalog.difficulty,
    description: catalog.description,
    tags: catalog.tags,
    moves: variations[0]?.moves ?? [],
    variations,
  };
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Fetches all openings from Supabase. Results are cached indefinitely
 * for the session — opening catalog data doesn't change at runtime.
 */
export function useOpenings() {
  return useQuery<Opening[]>({
    queryKey: ['openings'],
    staleTime: Infinity,
    queryFn: async () => {
      const supabase = createClient();

      const [catalogRes, linesRes] = await Promise.all([
        supabase.from('openings_catalog').select('*'),
        supabase.from('opening_lines').select('*').order('sort_order'),
      ]);

      if (catalogRes.error) throw catalogRes.error;
      if (linesRes.error) throw linesRes.error;

      const linesByOpening = new Map<string, LineRow[]>();
      for (const line of (linesRes.data ?? []) as LineRow[]) {
        const arr = linesByOpening.get(line.opening_slug) ?? [];
        arr.push(line);
        linesByOpening.set(line.opening_slug, arr);
      }

      return ((catalogRes.data ?? []) as CatalogRow[]).map(row =>
        buildOpening(row, linesByOpening.get(row.slug) ?? [])
      );
    },
  });
}

/**
 * Fetches a single opening by slug. Shares the same cache key space as
 * useOpenings so TanStack Query deduplicates requests automatically.
 */
export function useOpening(slug: string) {
  return useQuery<Opening | null>({
    queryKey: ['openings', slug],
    staleTime: Infinity,
    queryFn: async () => {
      const supabase = createClient();

      const [catalogRes, linesRes] = await Promise.all([
        supabase.from('openings_catalog').select('*').eq('slug', slug).single(),
        supabase.from('opening_lines').select('*').eq('opening_slug', slug).order('sort_order'),
      ]);

      if (catalogRes.error) return null;
      if (linesRes.error) throw linesRes.error;

      return buildOpening(catalogRes.data as CatalogRow, (linesRes.data ?? []) as LineRow[]);
    },
  });
}
