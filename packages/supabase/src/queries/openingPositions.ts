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
