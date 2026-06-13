import { supabase } from '../client';
import type { Database } from '../database.types';

type VariationProgress = Database['public']['Tables']['user_variation_progress']['Row'];
type VariationProgressInsert = Database['public']['Tables']['user_variation_progress']['Insert'];
type VariationProgressUpdate = Database['public']['Tables']['user_variation_progress']['Update'];

export async function getUserVariationProgress(userId: string): Promise<VariationProgress[]> {
  const { data, error } = await supabase
    .from('user_variation_progress')
    .select('*')
    .eq('user_id', userId)
    .order('opening_slug', { ascending: true })
    .order('variation_slug', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getProgressForVariation(
  userId: string,
  openingSlug: string,
  variationSlug: string
): Promise<VariationProgress | null> {
  const { data, error } = await supabase
    .from('user_variation_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('opening_slug', openingSlug)
    .eq('variation_slug', variationSlug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertVariationProgress(
  progress: VariationProgressInsert
): Promise<VariationProgress> {
  const { data, error } = await supabase
    .from('user_variation_progress')
    .upsert(progress, { onConflict: 'user_id,opening_slug,variation_slug' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateVariationProgress(
  userId: string,
  openingSlug: string,
  variationSlug: string,
  update: VariationProgressUpdate
): Promise<VariationProgress> {
  const { data, error } = await supabase
    .from('user_variation_progress')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('opening_slug', openingSlug)
    .eq('variation_slug', variationSlug)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function recordVariationLearned(
  userId: string,
  openingSlug: string,
  variationSlug: string
): Promise<void> {
  const { error } = await supabase.rpc('record_variation_learned', {
    p_user_id: userId,
    p_opening_slug: openingSlug,
    p_variation_slug: variationSlug,
  });
  if (error) throw error;
}

export async function incrementVariationCompletion(
  userId: string,
  openingSlug: string,
  variationSlug: string
): Promise<void> {
  const { error } = await supabase.rpc('increment_variation_completion', {
    p_user_id: userId,
    p_opening_slug: openingSlug,
    p_variation_slug: variationSlug,
  });
  if (error) throw error;
}
