import { supabase } from '../client';
import type { Database } from '../database.types';

export type OpeningCatalogRow = Database['public']['Tables']['openings_catalog']['Row'];
export type OpeningLineRow = Database['public']['Tables']['opening_lines']['Row'];
export type OpeningIndexRow = Database['public']['Views']['opening_index']['Row'];
export type OpeningLineBranchMetadataRow =
  Database['public']['Tables']['opening_line_branch_metadata']['Row'];
export type CoachEventRow = Database['public']['Tables']['coach_events']['Row'];

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

export async function getReadyOpeningIndex(): Promise<OpeningIndexRow[]> {
  const { data, error } = await supabase
    .from('opening_index')
    .select('*')
    .not('course_slug', 'is', null)
    .not('course_color', 'is', null)
    .not('course_difficulty', 'is', null)
    .not('course_description', 'is', null)
    .gt('reference_line_count', 0)
    .gt('practical_branch_count', 0)
    .order('popularity_games', { ascending: false, nullsFirst: false })
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
