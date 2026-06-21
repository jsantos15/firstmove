import { supabase } from '../client';
import type { Tables } from '../database.types';

export type Puzzle = Tables<'puzzles'>;
export type UserPuzzleAttempt = Tables<'user_puzzle_attempts'>;

export type PuzzleDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface FetchPuzzlesParams {
  difficulty?: PuzzleDifficulty;
  themes?: string[];
  openingTagPrefix?: string;
  limit?: number;
  offset?: number;
}

// ─── Puzzle queries ───────────────────────────────────────────────────────────

export async function fetchPuzzle(puzzleId: string): Promise<Puzzle> {
  const { data, error } = await supabase
    .from('puzzles')
    .select('*')
    .eq('puzzle_id', puzzleId)
    .single();

  if (error) throw error;
  return data;
}

export async function fetchPuzzles(params: FetchPuzzlesParams = {}): Promise<Puzzle[]> {
  const { difficulty, themes, openingTagPrefix, limit = 20, offset = 0 } = params;

  let query = supabase
    .from('puzzles')
    .select('*')
    .order('popularity', { ascending: false })
    .range(offset, offset + limit - 1);

  if (difficulty) {
    query = query.eq('difficulty', difficulty);
  }

  if (themes && themes.length > 0) {
    query = query.overlaps('themes', themes);
  }

  if (openingTagPrefix) {
    // Filter by ECO prefix — e.g. "B20" matches any opening_tag starting with "B20"
    query = query.contains('opening_tags', [openingTagPrefix]);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// Fetch puzzles tied to a specific opening (for Opening Track screens).
// openingTag should be an ECO-prefixed tag as stored in the puzzles table,
// e.g. "B20_Sicilian_Defense".
export async function fetchPuzzlesByOpeningTag(
  openingTag: string,
  difficulty?: PuzzleDifficulty,
  limit = 20,
): Promise<Puzzle[]> {
  let query = supabase
    .from('puzzles')
    .select('*')
    .contains('opening_tags', [openingTag])
    .order('popularity', { ascending: false })
    .limit(limit);

  if (difficulty) {
    query = query.eq('difficulty', difficulty);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// Fetch a random puzzle for the daily puzzle slot.
// Uses date-seeded offset so the same puzzle shows all day for every user.
export async function fetchDailyPuzzle(difficulty: PuzzleDifficulty = 'intermediate'): Promise<Puzzle | null> {
  const today = new Date();
  const seed  = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();

  const { count } = await supabase
    .from('puzzles')
    .select('*', { count: 'exact', head: true })
    .eq('difficulty', difficulty);

  if (!count) return null;

  const offset = seed % count;

  const { data, error } = await supabase
    .from('puzzles')
    .select('*')
    .eq('difficulty', difficulty)
    .order('puzzle_id')
    .range(offset, offset)
    .single();

  if (error) return null;
  return data;
}

// ─── Attempt writes ───────────────────────────────────────────────────────────

export async function recordPuzzleAttempt(
  userId: string,
  puzzleId: string,
  solved: boolean,
  timeMs?: number,
): Promise<void> {
  const { error } = await supabase.from('user_puzzle_attempts').insert({
    user_id:   userId,
    puzzle_id: puzzleId,
    solved,
    time_ms:   timeMs ?? null,
  });

  if (error) throw error;
}

// ─── User stats ───────────────────────────────────────────────────────────────

export interface UserPuzzleStats {
  totalAttempted: number;
  totalSolved: number;
  solveRate: number;
}

export async function fetchUserPuzzleStats(userId: string): Promise<UserPuzzleStats> {
  const { data, error } = await supabase
    .from('user_puzzle_attempts')
    .select('solved')
    .eq('user_id', userId);

  if (error) throw error;

  const attempts = data ?? [];
  const totalAttempted = attempts.length;
  const totalSolved    = attempts.filter((a) => a.solved).length;
  const solveRate      = totalAttempted > 0 ? totalSolved / totalAttempted : 0;

  return { totalAttempted, totalSolved, solveRate };
}

export async function fetchRecentPuzzleAttempts(
  userId: string,
  limit = 20,
): Promise<UserPuzzleAttempt[]> {
  const { data, error } = await supabase
    .from('user_puzzle_attempts')
    .select('*')
    .eq('user_id', userId)
    .order('attempted_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}
