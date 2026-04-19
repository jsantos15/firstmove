import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers';

// ─── Types ────────────────────────────────────────────────────────────────────

// Status progression: new → learned → completed → mastered (mastered deferred to Test mode)
export type MasteryLevel = 'new' | 'learned' | 'completed' | 'mastered';

export interface VariationProgress {
  openingSlug: string;
  variationSlug: string;
  timesCompleted: number;
  hasLearned: boolean;
  mastery: MasteryLevel;
  lastPracticedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getMastery(timesCompleted: number, hasLearned: boolean): MasteryLevel {
  if (timesCompleted > 0) return 'completed';
  if (hasLearned) return 'learned';
  return 'new';
}

export const MASTERY_LABELS: Record<MasteryLevel, string> = {
  new:       'New',
  learned:   'Learned',
  completed: 'Completed',
  mastered:  'Mastered',
};

export const MASTERY_COLORS: Record<MasteryLevel, string> = {
  new:       'bg-gray-600',
  learned:   'bg-amber-400',
  completed: 'bg-blue-400',
  mastered:  'bg-green-400',
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Fetches all variation progress for the current user.
 * Returns a Map keyed by `${openingSlug}/${variationSlug}` for O(1) lookups.
 */
export function useAllProgress() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['progress', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('user_variation_progress')
        .select('opening_slug, variation_slug, times_completed, has_learned, last_practiced_at')
        .eq('user_id', user!.id);

      if (error) throw error;

      const map = new Map<string, VariationProgress>();
      for (const row of data ?? []) {
        const key = `${row.opening_slug}/${row.variation_slug}`;
        map.set(key, {
          openingSlug:     row.opening_slug,
          variationSlug:   row.variation_slug,
          timesCompleted:  row.times_completed,
          hasLearned:      row.has_learned ?? false,
          mastery:         getMastery(row.times_completed, row.has_learned ?? false),
          lastPracticedAt: row.last_practiced_at,
        });
      }
      return map;
    },
  });
}

/**
 * Returns the opening-level status and line completion counts.
 * Rules:
 *   - learning  → at least 1 line completed
 *   - familiar  → more than half the lines completed
 *   - mastered  → every line completed
 */
export function getOpeningProgress(
  progress: Map<string, VariationProgress> | undefined,
  openingSlug: string,
  variationSlugs: string[]
): { status: MasteryLevel; completedLines: number; totalLines: number } {
  const totalLines = variationSlugs.length;

  if (!progress) {
    return { status: 'new', completedLines: 0, totalLines };
  }

  const completedLines = variationSlugs.filter(vSlug => {
    const p = progress.get(`${openingSlug}/${vSlug}`);
    return p && p.timesCompleted > 0;
  }).length;

  const order: MasteryLevel[] = ['new', 'learned', 'completed', 'mastered'];
  let best: MasteryLevel = 'new';
  for (const vSlug of variationSlugs) {
    const p = progress.get(`${openingSlug}/${vSlug}`);
    if (p && order.indexOf(p.mastery) > order.indexOf(best)) best = p.mastery;
  }

  return { status: best, completedLines, totalLines };
}

/**
 * Mutation to record a Learn-mode completion (sets has_learned = true).
 */
export function useRecordLearned() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      openingSlug,
      variationSlug,
    }: {
      openingSlug: string;
      variationSlug: string;
    }) => {
      if (!user) return;
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('record_variation_learned', {
        p_user_id:        user.id,
        p_opening_slug:   openingSlug,
        p_variation_slug: variationSlug,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['progress', user?.id] });
    },
  });
}

/**
 * Mutation to record a completed variation run.
 * Safe to call multiple times — the DB function is idempotent per session
 * (the caller guards with a ref).
 */
export function useRecordCompletion() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      openingSlug,
      variationSlug,
    }: {
      openingSlug: string;
      variationSlug: string;
    }) => {
      if (!user) return;
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('increment_variation_completion', {
        p_user_id: user.id,
        p_opening_slug: openingSlug,
        p_variation_slug: variationSlug,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['progress', user?.id] });
    },
  });
}
