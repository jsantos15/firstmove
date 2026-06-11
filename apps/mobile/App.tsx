import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getOpeningIndex, type OpeningIndexRow } from '@firstmove/supabase';

type OpeningCardModel = {
  id: string;
  ecoCode: string;
  name: string;
  color: NonNullable<OpeningIndexRow['course_color']>;
  difficulty: NonNullable<OpeningIndexRow['course_difficulty']>;
  description: string;
  tags: string[];
  popularityGames?: number;
  lineCount: number;
  referenceLineCount: number;
  practicalBranchCount: number;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 1,
    },
  },
});

function buildOpeningCard(row: OpeningIndexRow): OpeningCardModel | null {
  if (
    !row.course_slug ||
    !row.course_color ||
    !row.course_difficulty ||
    !row.course_description ||
    !row.name
  ) {
    return null;
  }

  const referenceLineCount = row.reference_line_count ?? 0;
  const practicalBranchCount = row.practical_branch_count ?? 0;
  if (referenceLineCount === 0 || practicalBranchCount === 0) {
    return null;
  }

  return {
    id: row.course_slug,
    ecoCode: row.eco_code ?? '',
    name: row.name,
    color: row.course_color,
    difficulty: row.course_difficulty,
    description: row.course_description,
    tags: row.course_tags ?? [],
    popularityGames: row.popularity_games ?? undefined,
    lineCount: row.course_line_count ?? referenceLineCount + practicalBranchCount,
    referenceLineCount,
    practicalBranchCount,
  };
}

function formatGames(games?: number) {
  if (!games) return null;
  if (games >= 1_000_000) return `${(games / 1_000_000).toFixed(1)}M games`;
  if (games >= 1_000) return `${Math.round(games / 1_000)}K games`;
  return `${games.toLocaleString()} games`;
}

function OpeningCard({ opening }: { opening: OpeningCardModel }) {
  const games = formatGames(opening.popularityGames);

  return (
    <Pressable style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.titleGroup}>
          <Text style={styles.eco}>{opening.ecoCode || 'ECO'}</Text>
          <Text style={styles.name}>{opening.name}</Text>
        </View>
        <Text style={styles.colorBadge}>{opening.color}</Text>
      </View>

      <Text style={styles.description} numberOfLines={3}>
        {opening.description}
      </Text>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{opening.difficulty}</Text>
        <Text style={styles.dot}>•</Text>
        <Text style={styles.metaText}>{opening.lineCount} lines</Text>
        {games ? (
          <>
            <Text style={styles.dot}>•</Text>
            <Text style={styles.metaText}>{games}</Text>
          </>
        ) : null}
      </View>

      <View style={styles.countRow}>
        <View style={styles.countPill}>
          <Text style={styles.countValue}>{opening.referenceLineCount}</Text>
          <Text style={styles.countLabel}>Reference</Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countValue}>{opening.practicalBranchCount}</Text>
          <Text style={styles.countLabel}>Punish</Text>
        </View>
      </View>
    </Pressable>
  );
}

function OpeningsScreen() {
  const { data, error, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['openings'],
    queryFn: getOpeningIndex,
  });

  const openings = useMemo(
    () =>
      (data ?? []).flatMap(row => {
        const opening = buildOpeningCard(row);
        return opening ? [opening] : [];
      }),
    [data]
  );

  if (isLoading) {
    return (
      <View style={styles.centerPane}>
        <ActivityIndicator color="#2563eb" size="large" />
        <Text style={styles.loadingText}>Loading openings</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerPane}>
        <Text style={styles.errorTitle}>Could not load openings</Text>
        <Text style={styles.errorBody}>
          {error instanceof Error ? error.message : 'Please try again.'}
        </Text>
        <Pressable style={styles.retryButton} onPress={() => void refetch()}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={openings}
      keyExtractor={opening => opening.id}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.kicker}>Learn</Text>
          <Text style={styles.heading}>Openings</Text>
          <Text style={styles.subheading}>
            Courses are ordered by Lichess popularity and only appear after reference and punish
            lines are imported.
          </Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No imported openings yet</Text>
          <Text style={styles.emptyBody}>
            Run the opening course pipeline, then pull to refresh.
          </Text>
        </View>
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) => <OpeningCard opening={item} />}
    />
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen}>
          <StatusBar style="dark" />
          <OpeningsScreen />
        </SafeAreaView>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
  },
  header: {
    marginBottom: 18,
  },
  kicker: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  heading: {
    color: '#111827',
    fontSize: 34,
    fontWeight: '800',
    marginTop: 4,
  },
  subheading: {
    color: '#4b5563',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  separator: {
    height: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  titleGroup: {
    flex: 1,
  },
  eco: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 3,
  },
  name: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 25,
  },
  colorBadge: {
    backgroundColor: '#eef2ff',
    borderRadius: 6,
    color: '#3730a3',
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
    textTransform: 'capitalize',
  },
  description: {
    color: '#374151',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  metaText: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  dot: {
    color: '#9ca3af',
    fontSize: 13,
  },
  countRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  countPill: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  countValue: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  countLabel: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  centerPane: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#4b5563',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
  },
  errorTitle: {
    color: '#991b1b',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  errorBody: {
    color: '#6b7280',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  emptyState: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    borderWidth: 1,
    padding: 20,
  },
  emptyTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  emptyBody: {
    color: '#6b7280',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
});
