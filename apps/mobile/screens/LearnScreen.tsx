import { useState, useMemo } from 'react';
import {
  FlatList,
  Pressable,
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
  if (completed === 0)    return <Text style={styles.statusNew}>Not started</Text>;
  if (completed >= total) return <Text style={styles.statusMastered}>Mastered</Text>;
  return <Text style={styles.statusInProgress}>In progress</Text>;
}

// ─── Segmented filter row ─────────────────────────────────────────────────────

interface SegOption<T extends string> {
  value: T;
  label: string;
}

function SegRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segSection}>
      <Text style={styles.segLabel}>{label}</Text>
      <View style={styles.segBar}>
        {options.map((opt, i) => {
          const active = value === opt.value;
          const isFirst = i === 0;
          const isLast = i === options.length - 1;
          return (
            <Pressable
              key={opt.value}
              style={[
                styles.segBtn,
                active && styles.segBtnActive,
                isFirst && styles.segBtnFirst,
                isLast  && styles.segBtnLast,
              ]}
              onPress={() => onChange(opt.value)}
            >
              <Text style={[styles.segBtnText, active && styles.segBtnTextActive]} numberOfLines={1}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Opening card ─────────────────────────────────────────────────────────────

const BOARD_SIZE = 100;

function OpeningCard({ opening, onPress }: { opening: MockOpening; onPress: () => void }) {
  const completed = opening.completedIds.length;
  const total = opening.variations.filter(v => !v.isPunishLine).length;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      {/* Left: mini board */}
      <View style={styles.boardThumb}>
        <MiniBoard
          fen={opening.fen}
          size={BOARD_SIZE}
          orientation={opening.color === 'black' ? 'black' : 'white'}
        />
      </View>

      {/* Right: info */}
      <View style={styles.cardInfo}>
        {/* Badges */}
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

        {/* Description */}
        <Text style={styles.openingDesc} numberOfLines={2}>{opening.description}</Text>

        {/* Progress */}
        <View style={styles.progressRow}>
          <LineDots completed={completed} total={total} />
          <StatusChip completed={completed} total={total} />
        </View>
      </View>

      <Ionicons name="chevron-forward" size={14} color={COLORS.textDim} style={styles.chevron} />
    </Pressable>
  );
}

// ─── Color filter options ─────────────────────────────────────────────────────

const COLOR_OPTIONS: SegOption<ColorFilter>[] = [
  { value: 'all',   label: 'Both' },
  { value: 'white', label: '♙ White' },
  { value: 'black', label: '♟ Black' },
];

const DIFF_OPTIONS: SegOption<DifficultyFilter>[] = [
  { value: 'all',          label: 'All' },
  { value: 'beginner',     label: 'Beginner' },
  { value: 'intermediate', label: 'Inter.' },
  { value: 'advanced',     label: 'Advanced' },
];

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

            {/* Filters — two labeled segmented rows, no scrolling */}
            <View style={styles.filterCard}>
              <SegRow
                label="COLOR"
                options={COLOR_OPTIONS}
                value={colorFilter}
                onChange={setColorFilter}
              />
              <View style={styles.filterDivider} />
              <SegRow
                label="LEVEL"
                options={DIFF_OPTIONS}
                value={diffFilter}
                onChange={setDiffFilter}
              />
            </View>

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
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
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

  // Filter card with two segmented rows
  filterCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
    overflow: 'hidden',
  },
  filterDivider: {
    height: 1,
    backgroundColor: COLORS.borderSubtle,
  },
  segSection: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 8,
  },
  segLabel: {
    fontSize: 10,
    fontWeight: FONT.bold,
    color: COLORS.textDim,
    letterSpacing: 0.7,
  },
  segBar: {
    flexDirection: 'row',
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    backgroundColor: COLORS.bgBase,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  segBtnFirst: { borderLeftWidth: 0 },
  segBtnLast: { borderRightWidth: 0 },
  segBtnActive: { backgroundColor: COLORS.accentDim },
  segBtnText: {
    fontSize: 11,
    fontWeight: FONT.medium,
    color: COLORS.textDim,
  },
  segBtnTextActive: {
    color: COLORS.accent,
    fontWeight: FONT.semibold,
  },

  // Card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  cardPressed: { opacity: 0.75 },

  boardThumb: {
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },

  cardInfo: {
    flex: 1,
    paddingVertical: 12,
    paddingLeft: 12,
    gap: 6,
  },

  chevron: { paddingRight: 12 },

  // Badges
  badgesRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
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

  // Name + description
  openingName: { fontSize: 13, fontWeight: FONT.bold, color: COLORS.text },
  openingDesc: {
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 15,
  },

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
