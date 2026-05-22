import { useState, useMemo } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MiniBoard } from '../components/board/MiniBoard';
import { COLORS, FONT, RADIUS } from '../lib/constants';
import { MOCK_OPENINGS } from '../lib/mockOpenings';
import type { MockOpening } from '../lib/mockOpenings';
import type { OpeningsStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<OpeningsStackParamList, 'OpeningLibrary'>;

type ColorFilter = 'all' | 'white' | 'black';
type DifficultyFilter = 'all' | 'beginner' | 'intermediate' | 'advanced';

// ─── Difficulty styling ───────────────────────────────────────────────────────

function diffBadgeStyle(d: string): ViewStyle {
  if (d === 'beginner')     return { backgroundColor: COLORS.successDim,  borderColor: 'rgba(34,197,94,0.2)' };
  if (d === 'intermediate') return { backgroundColor: COLORS.accentDim,   borderColor: 'rgba(245,158,11,0.2)' };
  if (d === 'advanced')     return { backgroundColor: COLORS.errorDim,    borderColor: 'rgba(239,68,68,0.2)' };
  return {};
}

function diffTextStyle(d: string): TextStyle {
  if (d === 'beginner')     return { color: COLORS.success };
  if (d === 'intermediate') return { color: COLORS.accent };
  if (d === 'advanced')     return { color: COLORS.error };
  return {};
}

// ─── Progress dots ────────────────────────────────────────────────────────────

function LineDots({ completed, total }: { completed: number; total: number }) {
  if (total === 0) return null;

  if (total <= 6) {
    return (
      <View style={styles.dots}>
        {Array.from({ length: total }).map((_, i) => (
          <View key={i} style={[styles.dot, i < completed ? styles.dotFilled : styles.dotEmpty]} />
        ))}
      </View>
    );
  }

  const pct = Math.round((completed / total) * 100);
  return (
    <View style={styles.progressBarWrap}>
      <View style={[styles.progressBarFill, { width: `${pct}%` as any }]} />
    </View>
  );
}

// ─── Status chip ──────────────────────────────────────────────────────────────

function StatusChip({ completed, total }: { completed: number; total: number }) {
  if (completed === 0)       return <Text style={styles.statusNew}>Not started</Text>;
  if (completed >= total)    return <Text style={styles.statusMastered}>Mastered</Text>;
  return <Text style={styles.statusInProgress}>In progress</Text>;
}

// ─── Opening card ─────────────────────────────────────────────────────────────

function OpeningCard({ opening, onPress }: { opening: MockOpening; onPress: () => void }) {
  const completed = opening.completedIds.length;
  const total = opening.variations.filter(v => !v.isPunishLine).length;
  const boardSize = 88;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.boardThumb}>
        <MiniBoard
          fen={opening.fen}
          size={boardSize}
          orientation={opening.color === 'black' ? 'black' : 'white'}
        />
      </View>

      <View style={styles.cardInfo}>
        {/* Badges row */}
        <View style={styles.badgesRow}>
          <View style={[
            styles.colorBadge,
            opening.color === 'white' ? styles.colorBadgeWhite : styles.colorBadgeBlack,
          ]}>
            <Text style={[
              styles.colorBadgeText,
              opening.color === 'white' ? styles.colorTextWhite : styles.colorTextBlack,
            ]}>
              {opening.color === 'white' ? '♙ White' : '♟ Black'}
            </Text>
          </View>

          <View style={[styles.diffBadge, diffBadgeStyle(opening.difficulty)]}>
            <Text style={[styles.diffText, diffTextStyle(opening.difficulty)]}>
              {opening.difficulty}
            </Text>
          </View>

          <View style={styles.ecoBadge}>
            <Text style={styles.ecoText}>{opening.eco}</Text>
          </View>
        </View>

        {/* Name */}
        <Text style={styles.openingName} numberOfLines={1}>{opening.name}</Text>

        {/* Progress row */}
        <View style={styles.progressRow}>
          <LineDots completed={completed} total={total} />
          <StatusChip completed={completed} total={total} />
        </View>
      </View>

      <Ionicons name="chevron-forward" size={14} color={COLORS.textDim} />
    </Pressable>
  );
}

// ─── Filter chip ──────────────────────────────────────────────────────────────

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function OpeningLibraryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [colorFilter, setColorFilter] = useState<ColorFilter>('all');
  const [diffFilter, setDiffFilter] = useState<DifficultyFilter>('all');

  const filtered = useMemo(() => {
    return MOCK_OPENINGS.filter(o => {
      if (colorFilter !== 'all' && o.color !== colorFilter) return false;
      if (diffFilter !== 'all' && o.difficulty !== diffFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return o.name.toLowerCase().includes(q) || o.eco.toLowerCase().includes(q);
      }
      return true;
    });
  }, [search, colorFilter, diffFilter]);

  return (
    <View style={styles.root}>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.list, { paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <Text style={styles.heading}>Openings</Text>
            <Text style={styles.sub}>Pick an opening and train until it's muscle memory</Text>

            {/* Search */}
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={16} color={COLORS.textDim} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name or ECO code…"
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

            {/* Filters */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
              contentContainerStyle={styles.filterContent}
            >
              <FilterChip label="All Colors" active={colorFilter === 'all'} onPress={() => setColorFilter('all')} />
              <FilterChip label="♙ White"    active={colorFilter === 'white'} onPress={() => setColorFilter('white')} />
              <FilterChip label="♟ Black"    active={colorFilter === 'black'} onPress={() => setColorFilter('black')} />
              <View style={styles.filterDivider} />
              <FilterChip label="All Levels"    active={diffFilter === 'all'}          onPress={() => setDiffFilter('all')} />
              <FilterChip label="Beginner"      active={diffFilter === 'beginner'}     onPress={() => setDiffFilter('beginner')} />
              <FilterChip label="Intermediate"  active={diffFilter === 'intermediate'} onPress={() => setDiffFilter('intermediate')} />
              <FilterChip label="Advanced"      active={diffFilter === 'advanced'}     onPress={() => setDiffFilter('advanced')} />
            </ScrollView>

            {filtered.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>♟</Text>
                <Text style={styles.emptyText}>No openings match your filters</Text>
                <Pressable onPress={() => { setSearch(''); setColorFilter('all'); setDiffFilter('all'); }}>
                  <Text style={styles.clearFilters}>Clear filters</Text>
                </Pressable>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <OpeningCard
            opening={item}
            onPress={() => navigation.navigate('OpeningDetail', { openingSlug: item.id })}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListFooterComponent={<View style={{ height: 32 }} />}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bgBase },
  list: { paddingHorizontal: 20, gap: 0 },

  heading: { fontSize: 28, fontWeight: FONT.bold, color: COLORS.text, marginBottom: 4 },
  sub: { fontSize: 14, color: COLORS.textMuted, marginBottom: 16 },

  // Search
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
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    padding: 0,
  },

  // Filters
  filterScroll: { marginBottom: 16 },
  filterContent: { gap: 8, paddingRight: 4 },
  filterDivider: { width: 1, backgroundColor: COLORS.border, marginHorizontal: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipActive: {
    backgroundColor: COLORS.accentDim,
    borderColor: 'rgba(245,158,11,0.4)',
  },
  chipText: { fontSize: 12, fontWeight: FONT.medium, color: COLORS.textDim },
  chipTextActive: { color: COLORS.accent },

  // Card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    gap: 12,
    paddingRight: 14,
  },
  cardPressed: { opacity: 0.75 },
  boardThumb: {
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  cardInfo: { flex: 1, paddingVertical: 12, gap: 6 },

  // Badges
  badgesRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  colorBadge: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  colorBadgeWhite: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)' },
  colorBadgeBlack: { backgroundColor: 'rgba(0,0,0,0.3)',       borderColor: 'rgba(255,255,255,0.08)' },
  colorBadgeText: { fontSize: 10, fontWeight: FONT.semibold },
  colorTextWhite: { color: COLORS.textMuted },
  colorTextBlack: { color: COLORS.textDim },
  diffBadge: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  diffText: { fontSize: 10, fontWeight: FONT.semibold },
  ecoBadge: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  ecoText: { fontSize: 9, fontWeight: FONT.semibold, color: COLORS.textDim },

  // Name
  openingName: { fontSize: 13, fontWeight: FONT.bold, color: COLORS.text },

  // Progress
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotFilled: { backgroundColor: COLORS.accent },
  dotEmpty: { backgroundColor: COLORS.border },
  progressBarWrap: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
    marginRight: 8,
  },
  progressBarFill: { height: '100%', borderRadius: 2, backgroundColor: COLORS.accent },
  statusNew: { fontSize: 10, color: COLORS.textDim },
  statusInProgress: { fontSize: 10, fontWeight: FONT.semibold, color: COLORS.accent },
  statusMastered: { fontSize: 10, fontWeight: FONT.semibold, color: COLORS.success },

  // Empty state
  empty: { alignItems: 'center', paddingTop: 48, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 14, color: COLORS.textMuted },
  clearFilters: { fontSize: 13, color: COLORS.accent, fontWeight: FONT.semibold, marginTop: 4 },
});
