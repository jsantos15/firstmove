import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Json, SaveUserGameInput, UserGame } from '@firstmove/supabase';
import { getSharedUserGameById } from '@firstmove/supabase';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers';

/**
 * Games the user has saved from analysis (or, in the future, played in-app).
 * Uses the web's cookie-backed browser client directly rather than the
 * `@firstmove/supabase` singleton, since that singleton doesn't persist a
 * session in the browser — auth-scoped reads/writes need the same client
 * that holds the signed-in session (see useProgress.ts for the same pattern).
 */
export function useUserGames() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-games', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<UserGame[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('user_games')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** Owner-scoped single-game fetch, for reloading `/analysis?id=...` as the signed-in
 *  owner (e.g. a refresh or a bookmark) — same session-bearing client as useUserGames. */
export function useUserGameById(gameId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-game', gameId, user?.id],
    enabled: !!user && !!gameId,
    queryFn: async (): Promise<UserGame | null> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('user_games')
        .select('*')
        .eq('id', gameId!)
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Public fetch for a link opened by someone who isn't the owner (including signed-out
 *  visitors) — the anon-key singleton client is fine here, no session needed; the
 *  "Anyone can view any game by id" RLS policy is what actually scopes access. */
export function useSharedUserGame(gameId: string | undefined) {
  return useQuery({
    queryKey: ['shared-user-game', gameId],
    enabled: !!gameId,
    queryFn: () => getSharedUserGameById(gameId!),
  });
}

export function useSaveUserGame() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SaveUserGameInput): Promise<UserGame | null> => {
      if (!user) return null;
      const supabase = createClient();
      const row = {
        user_id: user.id,
        pgn: input.pgn,
        fen: input.fen,
        white: input.white,
        white_elo: input.whiteElo,
        white_result: input.whiteResult,
        white_avatar_url: input.whiteAvatarUrl,
        white_country: input.whiteCountry,
        white_title: input.whiteTitle,
        black: input.black,
        black_elo: input.blackElo,
        black_result: input.blackResult,
        black_avatar_url: input.blackAvatarUrl,
        black_country: input.blackCountry,
        black_title: input.blackTitle,
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
        imported_username: input.importedUsername,
        label: input.label,
      };
      if (input.id) {
        const { data, error } = await supabase
          .from('user_games')
          .update(row)
          .eq('id', input.id)
          .eq('user_id', user.id)
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-games', user?.id] });
    },
  });
}

export function useDeleteUserGame() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (gameId: string) => {
      if (!user) return;
      const supabase = createClient();
      const { error } = await supabase
        .from('user_games')
        .delete()
        .eq('id', gameId)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-games', user?.id] });
    },
  });
}
