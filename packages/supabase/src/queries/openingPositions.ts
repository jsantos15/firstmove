import { supabase } from '../client';
import type { Database } from '../database.types';

export type OpeningPositionRow = Database['public']['Tables']['opening_positions']['Row'];
export type OpeningPositionEvalRow = Database['public']['Tables']['opening_position_evals']['Row'];

export async function getOpeningPositionsByKeys(
  positionKeys: string[]
): Promise<OpeningPositionRow[]> {
  const uniqueKeys = [...new Set(positionKeys.filter(Boolean))];
  if (uniqueKeys.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('opening_positions')
    .select('*')
    .in('position_key', uniqueKeys);

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Every named opening's move sequence, for prefix-matching a played game against book
 * theory (see computeBookPlyCount in the analysis page) — book doesn't end at the first
 * ply that isn't itself a distinctly-named row (lichess-org/chess-openings only assigns
 * a new name where a name actually changes, e.g. black hasn't yet committed to a specific
 * reply), it ends at the first ply that isn't a PREFIX of any named line's own sequence.
 * Small, static table (~3800 rows, all lines start at the opening) — fetched once and
 * cached indefinitely by the caller rather than queried per position.
 */
export async function getAllOpeningPositionSans(): Promise<string[][]> {
  const { data, error } = await supabase
    .from('opening_positions')
    .select('sans');
  if (error) throw error;
  return data.map(row => row.sans ?? []);
}

export async function getOpeningPositionEvalByKey(
  positionKey: string
): Promise<OpeningPositionEvalRow | null> {
  const { data, error } = await supabase
    .from('opening_position_evals')
    .select('*')
    .eq('position_key', positionKey)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}
