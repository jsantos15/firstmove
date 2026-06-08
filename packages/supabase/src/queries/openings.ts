import { supabase } from '../client';
import type { Database } from '../database.types';

export type OpeningCatalogRow = Database['public']['Tables']['openings_catalog']['Row'];
export type OpeningLineRow = Database['public']['Tables']['opening_lines']['Row'];
export type OpeningIndexRow = Database['public']['Views']['opening_index']['Row'];
export type OpeningLineBranchMetadataRow =
  Database['public']['Tables']['opening_line_branch_metadata']['Row'];
export type CoachEventRow = Database['public']['Tables']['coach_events']['Row'];

const PAGE_SIZE = 1000;

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

export async function getOpeningCatalogBySlug(slug: string): Promise<OpeningCatalogRow | null> {
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
  let hasMore = true;

  while (hasMore) {
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

    hasMore = data.length === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  return rows;
}

export async function getOpeningLinesBySlug(openingSlug: string): Promise<OpeningLineRow[]> {
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

export async function getOpeningLineBranchMetadataBySlug(
  openingSlug: string
): Promise<OpeningLineBranchMetadataRow[]> {
  const { data, error } = await supabase
    .from('opening_line_branch_metadata')
    .select('*')
    .eq('opening_slug', openingSlug)
    .order('branch_score', { ascending: false, nullsFirst: false })
    .order('trigger_ply', { ascending: true })
    .order('lesson_title', { ascending: true, nullsFirst: false });

  if (error) {
    throw error;
  }

  return data;
}

export async function getOpeningCoachEventsBySlug(openingSlug: string): Promise<CoachEventRow[]> {
  const { data, error } = await supabase
    .from('coach_events')
    .select('*')
    .eq('domain', 'opening_practice')
    .eq('parent_subject_id', openingSlug)
    .order('subject_id', { ascending: true })
    .order('ply_index', { ascending: true })
    .order('event_type', { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}
