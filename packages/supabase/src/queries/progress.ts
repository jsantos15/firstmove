import { supabase } from '../client';
import type { Database } from '../database.types';

type UserProgress = Database['public']['Tables']['user_progress']['Row'];
type UserProgressInsert = Database['public']['Tables']['user_progress']['Insert'];
type UserProgressUpdate = Database['public']['Tables']['user_progress']['Update'];

export async function getUserProgress(userId: string): Promise<UserProgress[]> {
  const { data, error } = await supabase
    .from('user_progress')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data;
}

export async function getProgressForOpening(
  userId: string,
  openingId: string
): Promise<UserProgress | null> {
  const { data, error } = await supabase
    .from('user_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('opening_id', openingId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function upsertProgress(progress: UserProgressInsert): Promise<UserProgress> {
  const { data, error } = await supabase
    .from('user_progress')
    .upsert(progress, { onConflict: 'user_id,opening_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProgress(
  userId: string,
  openingId: string,
  update: UserProgressUpdate
): Promise<UserProgress> {
  const { data, error } = await supabase
    .from('user_progress')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('opening_id', openingId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
