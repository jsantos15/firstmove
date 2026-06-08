import { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MiniBoard } from '../components/board/MiniBoard';
import { COLORS, FONT, RADIUS } from '../lib/constants';
import {
  getCurrentSession,
  getOpeningIndex,
  getUserVariationProgress,
  type OpeningIndexRow,
  type VariationProgress,
} from '@firstmove/supabase';
import type { OpeningsStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<OpeningsStackParamList, 'OpeningLibrary'>;

// ─── Opening card ─────────────────────────────────────────────────────────────

const BOARD_PADDING = 12;
const BOARD_SIZE = 128;
const THUMB_WIDTH = BOARD_SIZE + BOARD_PADDING * 2;

type OpeningProgress = {
  lastPracticedAt: number;
  completedLines: number;
};

function diffBadgeStyle(d: string | null): object {
  if (d === 'beginner')     return { backgroundColor: COLORS.successDim, borderColor: 'rgba(34,197,94,0.2)' };
  if (d === 'intermediate') return { backgroundColor: COLORS.accentDim,  borderColor: 'rgba(245,158,11,0.2)' };
  if (d === 'advanced')     return { backgroundColor: COLORS.errorDim,   borderColor: 'rgba(239,68,68,0.2)' };
  return {};
}

function diffTextStyle(d: string | null): object {
  if (d === 'beginner')     return { color: COLORS.success };
  if (d === 'intermediate') return { color: COLORS.accent };
  if (d === 'advanced')     return { color: COLORS.error };
  return {};
}

function formatDifficulty(d: string | null) {
  return d ? d.charAt(0).toUpperCase() + d.slice(1) : 'Course';
}

function formatGames(count: number | null) {
  if (count == null) return 'Games pending';
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B games`;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M games`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}K games`;
  return `${count.toLocaleString()} games`;
}

function formatVariationCount(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? 'variation' : 'variations'}`;
}

function OpeningCard({
  opening,
  progress,
  onPress,
}: {
  opening: OpeningIndexRow;
  progress?: OpeningProgress;
  onPress: () => void;
}) {
  const variationCount = opening.variation_count ?? 0;
  const color = opening.course_color;
  const difficulty = opening.course_difficulty;
  const hasProgress = Boolean(progress && progress.completedLines > 0);
  const statusLabel = hasProgress ? 'In Progress' : 'Not Started';

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      {/* Left: board thumbnail */}
      <View style={styles.boardThumb}>
        <MiniBoard
          fen={opening.course_preview_fen ?? opening.anchor_fen ?? undefined}
          size={BOARD_SIZE}
          orientation={color === 'black' ? 'black' : 'white'}
        />
      </View>

      {/* Right: info */}
      <View style={styles.cardInfo}>
        <View style={styles.cardTopRow}>
          <Text style={styles.openingName} numberOfLines={2}>{opening.name}</Text>
          <Ionicons name="bookmark-outline" size={28} color={COLORS.textDim} />
        </View>

        <View style={styles.metaRow}>
          {color && (
            <View style={[
              styles.colorBadge,
              color === 'white' ? styles.colorBadgeWhite : styles.colorBadgeBlack,
            ]}>
              <Text style={[
                styles.colorBadgeText,
                color === 'white' ? styles.colorTextWhite : styles.colorTextBlack,
              ]}>
                {color === 'white' ? '♙ White' : '♟ Black'}
              </Text>
            </View>
          )}

          <View style={[styles.diffBadge, diffBadgeStyle(difficulty)]}>
            <Text style={[styles.diffText, diffTextStyle(difficulty)]}>
              {formatDifficulty(difficulty)}
            </Text>
          </View>
        </View>

        <View style={styles.factRow}>
          <Ionicons name="git-branch-outline" size={18} color={COLORS.textDim} />
          <Text style={styles.factText}>{formatVariationCount(variationCount)}</Text>
        </View>

        <View style={styles.factRow}>
          <Ionicons name="bar-chart-outline" size={18} color={COLORS.textDim} />
          <Text style={styles.factText}>{formatGames(opening.popularity_games)}</Text>
        </View>

        <Text style={[styles.statusText, hasProgress ? styles.statusInProgress : styles.statusNew]}>
          {statusLabel}
        </Text>
      </View>
    </Pressable>
  );
}

function buildProgressByOpening(progressRows: VariationProgress[]) {
  const progressByOpening = new Map<string, OpeningProgress>();

  for (const row of progressRows) {
    const existing = progressByOpening.get(row.opening_slug);
    const lastPracticedAt = new Date(row.last_practiced_at).getTime();
    progressByOpening.set(row.opening_slug, {
      lastPracticedAt: Math.max(existing?.lastPracticedAt ?? 0, Number.isNaN(lastPracticedAt) ? 0 : lastPracticedAt),
      completedLines: (existing?.completedLines ?? 0) + (row.times_completed > 0 ? 1 : 0),
    });
  }

  return progressByOpening;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function OpeningLibraryScreen({ navigation }: Props) {
  const [search, setSearch] = useState('');

  const { data: openings = [], isLoading, isError, error } = useQuery({
    queryKey: ['openings', 'index'],
    queryFn: () => getOpeningIndex(),
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });

  const { data: session } = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: () => getCurrentSession(),
    staleTime: 30 * 1000,
    retry: false,
  });

  const { data: progressRows = [] } = useQuery({
    queryKey: ['progress', session?.user.id],
    queryFn: () => getUserVariationProgress(session!.user.id),
    enabled: Boolean(session?.user.id),
    staleTime: 30 * 1000,
  });

  const progressByOpening = useMemo(
    () => buildProgressByOpening(progressRows),
    [progressRows]
  );

  const filtered = useMemo(() =>
    openings.filter(o => {
      if (!o.course_slug) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (o.name ?? '').toLowerCase().includes(q) ||
          (o.eco_code ?? '').toLowerCase().includes(q) ||
          (o.family_name ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    }).sort((a, b) => {
      const aProgress = a.course_slug ? progressByOpening.get(a.course_slug) : undefined;
      const bProgress = b.course_slug ? progressByOpening.get(b.course_slug) : undefined;

      if (aProgress && bProgress) {
        return bProgress.lastPracticedAt - aProgress.lastPracticedAt;
      }
      if (aProgress) return -1;
      if (bProgress) return 1;

      const byPopularity = (b.popularity_games ?? -1) - (a.popularity_games ?? -1);
      return byPopularity || (a.name ?? '').localeCompare(b.name ?? '');
    }),
  [openings, search, progressByOpening]);

  return (
    <View style={styles.root}>
      <ScreenHeader title="Openings" />

      {/* Search */}
      <View style={styles.filterBar}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={COLORS.textDim} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name…"
            placeholderTextColor={COLORS.textDim}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={COLORS.textDim} />
            </Pressable>
          )}
        </View>
      </View>

      {/* States */}
      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
      )}

      {isError && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Could not load openings. Check your connection.</Text>
          <Text style={styles.errorDetailText}>
            {error instanceof Error ? error.message : 'Unknown opening index error'}
          </Text>
        </View>
      )}

      {!isLoading && !isError && (
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.popularity_id)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>♟</Text>
              <Text style={styles.emptyText}>No openings match your filters</Text>
              <Pressable onPress={() => setSearch('')}>
                <Text style={styles.clearFilters}>Clear search</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <OpeningCard
              opening={item}
              progress={item.course_slug ? progressByOpening.get(item.course_slug) : undefined}
              onPress={() => {
                navigation.navigate('OpeningDetail', { openingSlug: item.course_slug! });
              }}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListFooterComponent={<View style={{ height: 32 }} />}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bgBase },

  filterBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bgBase,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text, padding: 0 },

  list: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 32 },

  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  cardPressed: { opacity: 0.75 },
  boardThumb: {
    width: THUMB_WIDTH,
    padding: BOARD_PADDING,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceElevated,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  cardInfo: {
    flex: 1,
    minHeight: THUMB_WIDTH,
    paddingTop: 16,
    paddingBottom: 14,
    paddingLeft: 16,
    paddingRight: 14,
    gap: 10,
    justifyContent: 'space-between',
  },

  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  openingName: { flex: 1, fontSize: 19, fontWeight: FONT.bold, color: COLORS.text, lineHeight: 24 },

  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  colorBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5 },
  colorBadgeWhite: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)' },
  colorBadgeBlack: { backgroundColor: 'rgba(0,0,0,0.3)', borderColor: 'rgba(255,255,255,0.08)' },
  colorBadgeText: { fontSize: 13, fontWeight: FONT.semibold },
  colorTextWhite: { color: COLORS.textMuted },
  colorTextBlack: { color: COLORS.textDim },
  diffBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5 },
  diffText: { fontSize: 13, fontWeight: FONT.semibold },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  factText: { fontSize: 15, color: COLORS.textMuted, fontWeight: FONT.semibold },
  statusText: { fontSize: 14, fontWeight: FONT.bold },
  statusNew: { color: COLORS.textDim },
  statusInProgress: { color: COLORS.accent },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  errorText: { fontSize: 14, color: COLORS.error, textAlign: 'center', paddingHorizontal: 24 },
  errorDetailText: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingHorizontal: 24,
  },

  empty: { alignItems: 'center', paddingTop: 48, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 14, color: COLORS.textMuted },
  clearFilters: { fontSize: 13, color: COLORS.accent, fontWeight: FONT.semibold, marginTop: 4 },
});
