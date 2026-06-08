import { supabase } from '../client';
import type { Database } from '../database.types';

export type OpeningCatalogRow = Database['public']['Tables']['openings_catalog']['Row'];
export type OpeningLineRow = Database['public']['Tables']['opening_lines']['Row'];
export type OpeningIndexRow = Database['public']['Views']['opening_index']['Row'];
export type OpeningWithLineCount = OpeningCatalogRow & { lineCount: number };
type OpeningWithEmbeddedLineCount = OpeningCatalogRow & {
  opening_lines?: Array<{ count: number | null }> | null;
};
type LichessPopularityRow = {
  id: number;
  eco_code: string;
  full_name: string;
  family_name: string;
  type: 'opening' | 'variation';
  anchor_sans: string[];
  anchor_fen: string;
  popularity_games: number | null;
  fetched_at: string | null;
};

const PAGE_SIZE = 1000;
const OPENING_INDEX_EXCLUDED_BUCKETS = new Set([
  "King's Pawn Game",
  "Queen's Pawn Game",
  'Zukertort Opening',
  'Indian Defense',
]);

export async function getOpeningIndex(): Promise<OpeningIndexRow[]> {
  const { data, error } = await supabase
    .from('opening_index')
    .select('*')
    .order('popularity_games', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

async function getOpeningIndexFromBaseTables(): Promise<OpeningIndexRow[]> {
  const client = supabase as any;

  const [
    { data: openings, error: openingsError },
    { data: variations, error: variationsError },
    { data: courses, error: coursesError },
  ] = await Promise.all([
    client
      .from('lichess_opening_popularity')
      .select('id,eco_code,full_name,family_name,type,anchor_sans,anchor_fen,popularity_games,fetched_at')
      .eq('type', 'opening')
      .order('popularity_games', { ascending: false, nullsFirst: false })
      .order('full_name', { ascending: true }),
    client
      .from('lichess_opening_popularity')
      .select('family_name')
      .eq('type', 'variation'),
    client
      .from('openings_catalog')
      .select('slug,eco_code,name,color,difficulty,description,tags,preview_fen,has_main_line,is_featured,display_tier,popularity_rank'),
  ]);

  if (openingsError) throw openingsError;
  if (variationsError) throw variationsError;
  if (coursesError) throw coursesError;

  const variationCountByFamily = new Map<string, number>();
  for (const variation of variations as Array<{ family_name: string }>) {
    variationCountByFamily.set(
      variation.family_name,
      (variationCountByFamily.get(variation.family_name) ?? 0) + 1
    );
  }

  const coursesByName = new Map<string, OpeningCatalogRow>();
  const coursesByEco = new Map<string, OpeningCatalogRow>();
  for (const course of courses as OpeningCatalogRow[]) {
    coursesByName.set(course.name.toLowerCase(), course);
    if (!coursesByEco.has(course.eco_code)) {
      coursesByEco.set(course.eco_code, course);
    }
  }

  const dedupedOpenings = new Map<string, LichessPopularityRow>();
  for (const opening of openings as LichessPopularityRow[]) {
    if (OPENING_INDEX_EXCLUDED_BUCKETS.has(opening.full_name)) continue;

    const key = opening.full_name.toLowerCase();
    const existing = dedupedOpenings.get(key);
    if (
      !existing ||
      (opening.popularity_games ?? -1) > (existing.popularity_games ?? -1)
    ) {
      dedupedOpenings.set(key, opening);
    }
  }

  return [...dedupedOpenings.values()]
    .sort((left, right) => {
      const byGames = (right.popularity_games ?? -1) - (left.popularity_games ?? -1);
      return byGames || left.full_name.localeCompare(right.full_name);
    })
    .map((opening) => {
      const course =
        coursesByName.get(opening.full_name.toLowerCase()) ??
        coursesByEco.get(opening.eco_code) ??
        null;

      return {
        popularity_id: opening.id,
        eco_code: opening.eco_code,
        name: opening.full_name,
        family_name: opening.family_name,
        anchor_sans: opening.anchor_sans,
        anchor_fen: opening.anchor_fen,
        popularity_games: opening.popularity_games,
        fetched_at: opening.fetched_at,
        variation_count: variationCountByFamily.get(opening.family_name) ?? 0,
        course_slug: course?.slug ?? null,
        course_color: course?.color ?? null,
        course_difficulty: course?.difficulty ?? null,
        course_description: course?.description ?? null,
        course_tags: course?.tags ?? null,
        course_preview_fen: course?.preview_fen ?? null,
        course_has_main_line: course?.has_main_line ?? null,
        course_is_featured: course?.is_featured ?? null,
        course_display_tier: course?.display_tier ?? null,
      };
    });
}

export async function getOpeningsCatalog(): Promise<OpeningCatalogRow[]> {
  const { data, error } = await supabase
    .from('openings_catalog')
    .select('*')
    .order('display_tier', { ascending: true, nullsFirst: false })
    .order('popularity_rank', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

export async function getOpeningCatalogBySlug(
  slug: string
): Promise<OpeningCatalogRow | null> {
  const { data, error } = await supabase
    .from('openings_catalog')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function getOpeningLines(): Promise<OpeningLineRow[]> {
  const rows: OpeningLineRow[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('opening_lines')
      .select('*')
      .order('opening_slug', { ascending: true })
      .order('is_main_line', { ascending: false })
      .order('popularity_rank', { ascending: true, nullsFirst: false })
      .order('sort_order', { ascending: true })
      .range(from, to);

    if (error) {
      throw error;
    }

    rows.push(...data);

    if (data.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return rows;
}

// Returns all openings ordered by popularity (desc), with a lineCount derived
// from opening_lines. Used by the Learn screen to show the most popular openings first.
export async function getOpeningsByPopularity(filters?: {
  color?: 'white' | 'black';
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
}): Promise<OpeningWithLineCount[]> {
  let query = supabase
    .from('openings_catalog')
    .select('*, opening_lines(count)')
    .order('popularity_games', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true });

  if (filters?.color) {
    query = query.eq('color', filters.color);
  }
  if (filters?.difficulty) {
    query = query.eq('difficulty', filters.difficulty);
  }

  const { data: catalog, error: catalogError } = await query;
  if (catalogError) throw catalogError;

  return (catalog as OpeningWithEmbeddedLineCount[]).map(({ opening_lines, ...row }) => ({
    ...row,
    lineCount: opening_lines?.[0]?.count ?? 0,
  }));
}

export async function getOpeningLinesBySlug(
  openingSlug: string
): Promise<OpeningLineRow[]> {
  const { data, error } = await supabase
    .from('opening_lines')
    .select('*')
    .eq('opening_slug', openingSlug)
    .order('is_main_line', { ascending: false })
    .order('popularity_rank', { ascending: true, nullsFirst: false })
    .order('sort_order', { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}
