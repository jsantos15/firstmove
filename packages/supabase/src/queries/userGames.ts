import { supabase } from '../client';
import type { Database, Json } from '../database.types';

// The raw provider game object (Lichess/Chess.com JSON) — stored as-is in
// the `provider_data` jsonb column as a backstop for fields not promoted to
// their own column. Typed loosely here since callers pass whatever the
// provider's API returned; cast to `Json` only at the insert boundary.
type ProviderData = Record<string, unknown>;

export type UserGame = Database['public']['Tables']['user_games']['Row'];
export type UserGameSource = 'manual' | 'lichess' | 'chesscom' | 'played';

export interface SaveUserGameInput {
  /** Update this exact saved-game row in place instead of inserting/upserting a new one. */
  id?: string;
  /** When inserting (no `id`) and the game has a `sourceGameId`, upsert on
   *  (user_id, source, source_game_id) so re-saving an unmodified provider game
   *  updates the existing row instead of duplicating it. Set to `false` for
   *  "Save As" so a deliberate new copy is created even for provider games. */
  dedupeBySource?: boolean;
  pgn: string;
  fen?: string | null;
  white?: string | null;
  whiteElo?: string | null;
  whiteResult?: string | null;
  whiteAvatarUrl?: string | null;
  whiteCountry?: string | null;
  black?: string | null;
  blackElo?: string | null;
  blackResult?: string | null;
  blackAvatarUrl?: string | null;
  blackCountry?: string | null;
  result?: string | null;
  termination?: string | null;
  event?: string | null;
  round?: string | null;
  site?: string | null;
  eco?: string | null;
  openingName?: string | null;
  timeControl?: string | null;
  timeClass?: string | null;
  clockInitialSeconds?: number | null;
  clockIncrementSeconds?: number | null;
  rated?: boolean | null;
  variant?: string | null;
  whiteAccuracy?: number | null;
  blackAccuracy?: number | null;
  playedDate?: string | null;
  source?: UserGameSource;
  sourceGameId?: string | null;
  sourceUrl?: string | null;
  providerData?: ProviderData | null;
}

function toRow(input: SaveUserGameInput, userId: string) {
  return {
    user_id: userId,
    pgn: input.pgn,
    fen: input.fen,
    white: input.white,
    white_elo: input.whiteElo,
    white_result: input.whiteResult,
    white_avatar_url: input.whiteAvatarUrl,
    white_country: input.whiteCountry,
    black: input.black,
    black_elo: input.blackElo,
    black_result: input.blackResult,
    black_avatar_url: input.blackAvatarUrl,
    black_country: input.blackCountry,
    result: input.result,
    termination: input.termination,
    event: input.event,
    round: input.round,
    site: input.site,
    eco: input.eco,
    opening_name: input.openingName,
    time_control: input.timeControl,
    time_class: input.timeClass,
    clock_initial_seconds: input.clockInitialSeconds,
    clock_increment_seconds: input.clockIncrementSeconds,
    rated: input.rated,
    variant: input.variant,
    white_accuracy: input.whiteAccuracy,
    black_accuracy: input.blackAccuracy,
    played_date: input.playedDate,
    source: input.source ?? 'manual',
    source_game_id: input.sourceGameId,
    source_url: input.sourceUrl,
    provider_data: input.providerData as Json | null | undefined,
  };
}

export async function getUserGames(userId: string): Promise<UserGame[]> {
  const { data, error } = await supabase
    .from('user_games')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * Saves a game to the user's account.
 *
 * - If `input.id` is set, updates that exact row in place (the normal "Save" on an
 *   already-saved analysis, so edits/branches overwrite the same entry rather than
 *   piling up duplicates).
 * - Otherwise inserts a new row. If the game has a `sourceGameId` (Lichess/Chess.com)
 *   and `dedupeBySource` isn't explicitly `false`, upserts on (user_id, source,
 *   source_game_id) so re-saving an unmodified provider game updates the existing row
 *   instead of duplicating it. Pass `dedupeBySource: false` (used by "Save As") to force
 *   a brand-new row even for provider games.
 */
export async function saveUserGame(userId: string, input: SaveUserGameInput): Promise<UserGame> {
  const row = toRow(input, userId);

  if (input.id) {
    const { data, error } = await supabase
      .from('user_games')
      .update(row)
      .eq('id', input.id)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const query = row.source_game_id && input.dedupeBySource !== false
    ? supabase.from('user_games').upsert(row, { onConflict: 'user_id,source,source_game_id' })
    : supabase.from('user_games').insert(row);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function deleteUserGame(userId: string, gameId: string): Promise<void> {
  const { error } = await supabase
    .from('user_games')
    .delete()
    .eq('id', gameId)
    .eq('user_id', userId);
  if (error) throw error;
}
