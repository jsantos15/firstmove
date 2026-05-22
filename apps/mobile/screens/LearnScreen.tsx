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
type OpenFilter = 'color' | 'level' | null;

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

// ─── Dropdown filter button ───────────────────────────────────────────────────

interface DropdownOption<T> { value: T; label: string; }

function FilterDropdown<T extends string>({
  filterKey,
  label,
  options,
  value,
  openFilter,
  onToggle,
  onChange,
}: {
  filterKey: OpenFilter;
  label: string;
  options: DropdownOption<T>[];
  value: T;
  openFilter: OpenFilter;
  onToggle: () => void;
  onChange: (v: T) => void;
}) {
  const isOpen = openFilter === filterKey;
  const hasFilter = value !== 'all';

  return (
    <View style={styles.dropdownWrap}>
      <Pressable
        style={[styles.filterBtn, (hasFilter || isOpen) && styles.filterBtnActive]}
        onPress={onToggle}
      >
        <Text style={[styles.filterBtnText, hasFilter && styles.filterBtnTextActive]} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons
          name={isOpen ? 'chevron-up' : 'chevron-down'}
          size={11}
          color={hasFilter ? COLORS.accent : COLORS.textDim}
        />
      </Pressable>

      {isOpen && (
        <View style={styles.dropdown}>
          {options.map((opt, i) => {
            const selected = value === opt.value;
            return (
              <Pressable
                key={String(opt.value)}
                style={[styles.dropdownItem, i > 0 && styles.dropdownItemBorder]}
                onPress={() => { onChange(opt.value); onToggle(); }}
              >
                <Text style={[styles.dropdownItemText, selected && styles.dropdownItemTextActive]}>
                  {opt.label}
                </Text>
                {selected && <Ionicons name="checkmark" size={14} color={COLORS.accent} />}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── Opening card ─────────────────────────────────────────────────────────────

const BOARD_SIZE = 120;

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
        <Text style={styles.openingDesc} numberOfLines={3}>{opening.description}</Text>

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

// ─── Filter option lists ──────────────────────────────────────────────────────

const COLOR_OPTIONS: DropdownOption<ColorFilter>[] = [
  { value: 'all',   label: 'Both colors' },
  { value: 'white', label: '♙ White' },
  { value: 'black', label: '♟ Black' },
];

const DIFF_OPTIONS: DropdownOption<DifficultyFilter>[] = [
  { value: 'all',          label: 'All levels' },
  { value: 'beginner',     label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced',     label: 'Advanced' },
];

// ─── Main screen ──────────────────────────────────────────────────────────────

export function OpeningLibraryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [colorFilter, setColorFilter] = useState<ColorFilter>('all');
  const [diffFilter, setDiffFilter] = useState<DifficultyFilter>('all');
  const [openFilter, setOpenFilter] = useState<OpenFilter>(null);

  const toggleFilter = (key: 'color' | 'level') =>
    setOpenFilter(prev => (prev === key ? null : key));

  const colorLabel =
    colorFilter === 'all' ? 'Color'
    : colorFilter === 'white' ? '♙ White'
    : '♟ Black';

  const levelLabel =
    diffFilter === 'all' ? 'Level'
    : diffFilter.charAt(0).toUpperCase() + diffFilter.slice(1);

  const anyFilterActive = colorFilter !== 'all' || diffFilter !== 'all';

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
        // Close open dropdowns when list scrolls
        onScrollBeginDrag={() => setOpenFilter(null)}
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
                onFocus={() => setOpenFilter(null)}
                returnKeyType="search"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={COLORS.textDim} />
                </Pressable>
              )}
            </View>

            {/* Filter row with dropdowns */}
            <View style={styles.filterArea}>
              <View style={styles.filterRow}>
                <FilterDropdown
                  filterKey="color"
                  label={colorLabel}
                  options={COLOR_OPTIONS}
                  value={colorFilter}
                  openFilter={openFilter}
                  onToggle={() => toggleFilter('color')}
                  onChange={v => setColorFilter(v)}
                />
                <FilterDropdown
                  filterKey="level"
                  label={levelLabel}
                  options={DIFF_OPTIONS}
                  value={diffFilter}
                  openFilter={openFilter}
                  onToggle={() => toggleFilter('level')}
                  onChange={v => setDiffFilter(v)}
                />
                {anyFilterActive && (
                  <Pressable
                    onPress={() => { setColorFilter('all'); setDiffFilter('all'); setOpenFilter(null); }}
                    hitSlop={8}
                  >
                    <Text style={styles.clearText}>Clear</Text>
                  </Pressable>
                )}
              </View>
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
            onPress={() => { setOpenFilter(null); navigation.navigate('OpeningDetail', { openingSlug: item.id }); }}
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
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    padding: 0,
  },

  // Filter area — wraps row + dropdowns, needs overflow visible so dropdown shows
  filterArea: {
    marginBottom: 16,
    zIndex: 10,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dropdownWrap: {
    position: 'relative',
    zIndex: 10,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  filterBtnActive: {
    backgroundColor: COLORS.accentDim,
    borderColor: 'rgba(245,158,11,0.4)',
  },
  filterBtnText: {
    fontSize: 13,
    fontWeight: FONT.medium,
    color: COLORS.textMuted,
  },
  filterBtnTextActive: {
    color: COLORS.accent,
    fontWeight: FONT.semibold,
  },
  clearText: {
    fontSize: 12,
    color: COLORS.textDim,
    fontWeight: FONT.medium,
    paddingHorizontal: 4,
  },

  // Dropdown
  dropdown: {
    marginTop: 6,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    // Shadow
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  dropdownItemBorder: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSubtle,
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: FONT.medium,
    color: COLORS.text,
  },
  dropdownItemTextActive: {
    color: COLORS.accent,
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
    paddingVertical: 14,
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
  openingName: { fontSize: 14, fontWeight: FONT.bold, color: COLORS.text },
  openingDesc: {
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 16,
  },

  // Progress
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
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
