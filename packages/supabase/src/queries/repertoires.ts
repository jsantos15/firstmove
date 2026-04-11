import { supabase } from '../client';
import type { Database } from '../database.types';

type Repertoire = Database['public']['Tables']['user_repertoires']['Row'];

export async function getUserRepertoires(userId: string): Promise<Repertoire[]> {
  const { data, error } = await supabase
    .from('user_repertoires')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createRepertoire(
  userId: string,
  name: string,
  description?: string
): Promise<Repertoire> {
  const { data, error } = await supabase
    .from('user_repertoires')
    .insert({ user_id: userId, name, description })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function addOpeningToRepertoire(
  repertoireId: string,
  openingId: string
): Promise<void> {
  const { error } = await supabase
    .from('repertoire_openings')
    .insert({ repertoire_id: repertoireId, opening_id: openingId });
  if (error) throw error;
}

export async function removeOpeningFromRepertoire(
  repertoireId: string,
  openingId: string
): Promise<void> {
  const { error } = await supabase
    .from('repertoire_openings')
    .delete()
    .eq('repertoire_id', repertoireId)
    .eq('opening_id', openingId);
  if (error) throw error;
}

export async function getRepertoireOpeningIds(repertoireId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('repertoire_openings')
    .select('opening_id')
    .eq('repertoire_id', repertoireId);
  if (error) throw error;
  return data.map(r => r.opening_id);
}
