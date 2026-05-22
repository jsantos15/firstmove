import { useState, useMemo, useRef } from 'react';
import {
  FlatList,
  Modal,
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

// ─── Difficulty badge styling ─────────────────────────────────────────────────

function diffBadgeStyle(d: string): ViewStyle {
  if (d === 'beginner')     return { backgroundColor: COLORS.successDim, borderColor: 'rgba(34,197,94,0.2)' };
  if (d === 'intermediate') return { backgroundColor: COLORS.accentDim,  borderColor: 'rgba(245,158,11,0.2)' };
  if (d === 'advanced')     return { backgroundColor: COLORS.errorDim,   borderColor: 'rgba(239,68,68,0.2)' };
  return {};
}

function diffTextStyle(d: string): TextStyle {
  if (d === 'beginner')     return { color: COLORS.success };
  if (d === 'intermediate') return { color: COLORS.accent };
  if (d === 'advanced')     return { color: COLORS.error };
  return {};
}

// ─── Floating dropdown (Modal-based so it overlays the list) ─────────────────

interface DropdownOption<T> { value: T; label: string }

function FilterDropdown<T extends string>({
  filterKey,
  label,
  options,
  value,
  openFilter,
  onToggle,
  onChange,
}: {
  filterKey: 'color' | 'level';
  label: string;
  options: DropdownOption<T>[];
  value: T;
  openFilter: OpenFilter;
  onToggle: () => void;
  onChange: (v: T) => void;
}) {
  const isOpen = openFilter === filterKey;
  const hasFilter = value !== 'all';
  const btnRef = useRef<View>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const handlePress = () => {
    if (!isOpen) {
      btnRef.current?.measure((_x, _y, _w, h, pageX, pageY) => {
        setPos({ top: pageY + h + 6, left: pageX });
        onToggle();
      });
    } else {
      onToggle();
    }
  };

  return (
    <>
      <View ref={btnRef} collapsable={false}>
        <Pressable
          style={[styles.filterBtn, (hasFilter || isOpen) && styles.filterBtnActive]}
          onPress={handlePress}
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
      </View>

      <Modal
        visible={isOpen}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={onToggle}
      >
        {/* Full-screen dismiss area */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onToggle} />

        {pos && (
          <View style={[styles.dropdown, { top: pos.top, left: pos.left }]}>
            {options.map((opt, i) => {
              const selected = value === opt.value;
              return (
                <Pressable
                  key={String(opt.value)}
                  style={[styles.dropdownItem, i > 0 && styles.dropdownItemBorder]}
                  onPress={() => { onChange(opt.value); onToggle(); }}
                >
                  <Text style={[styles.dropdownItemText, selected && styles.dropdownItemActive]}>
                    {opt.label}
                  </Text>
                  {selected && <Ionicons name="checkmark" size={14} color={COLORS.accent} />}
                </Pressable>
              );
            })}
          </View>
        )}
      </Modal>
    </>
  );
}

// ─── Opening card ─────────────────────────────────────────────────────────────

const BOARD_SIZE = 130;

function OpeningCard({ opening, onPress }: { opening: MockOpening; onPress: () => void }) {
  const completed = opening.completedIds.length;
  const total = opening.variations.filter(v => !v.isPunishLine).length;

  const statusLabel =
    completed === 0 ? 'Not started'
    : completed >= total ? 'Mastered'
    : 'In progress';

  const statusStyle =
    completed === 0 ? styles.statusNew
    : completed >= total ? styles.statusMastered
    : styles.statusInProgress;

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
        {/* Opening name — top */}
        <Text style={styles.openingName} numberOfLines={2}>{opening.name}</Text>

        {/* Description */}
        <Text style={styles.openingDesc} numberOfLines={3}>{opening.description}</Text>

        {/* Bottom meta row: color · level · status */}
        <View style={styles.metaRow}>
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

          <Text style={[styles.statusText, statusStyle]}>{statusLabel}</Text>
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
    colorFilter === 'all'   ? 'Color'
    : colorFilter === 'white' ? '♙ White'
    : '♟ Black';

  const levelLabel =
    diffFilter === 'all' ? 'Level'
    : diffFilter.charAt(0).toUpperCase() + diffFilter.slice(1);

  const anyFilterActive = colorFilter !== 'all' || diffFilter !== 'all';

  const filtered = useMemo(() =>
    MOCK_OPENINGS.filter(o => {
      if (colorFilter !== 'all' && o.color !== colorFilter) return false;
      if (diffFilter !== 'all' && o.difficulty !== diffFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return o.name.toLowerCase().includes(q) || o.eco.toLowerCase().includes(q);
      }
      return true;
    }),
  [search, colorFilter, diffFilter]);

  return (
    <View style={styles.root}>
      {/* Fixed header — stays above FlatList so dropdowns can overlay the list */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
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

        {/* Filter row */}
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

      {/* Opening list */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => setOpenFilter(null)}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>♟</Text>
            <Text style={styles.emptyText}>No openings match your filters</Text>
            <Pressable onPress={() => { setSearch(''); setColorFilter('all'); setDiffFilter('all'); }}>
              <Text style={styles.clearFilters}>Clear filters</Text>
            </Pressable>
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

  // Fixed header
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bgBase,
  },
  heading: { fontSize: 28, fontWeight: FONT.bold, color: COLORS.text, marginBottom: 4 },
  sub: { fontSize: 14, color: COLORS.textMuted, marginBottom: 14 },

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
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text, padding: 0 },

  // Filter row
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  filterBtnText: { fontSize: 13, fontWeight: FONT.medium, color: COLORS.textMuted },
  filterBtnTextActive: { color: COLORS.accent, fontWeight: FONT.semibold },
  clearText: { fontSize: 12, color: COLORS.textDim, fontWeight: FONT.medium, paddingHorizontal: 4 },

  // Floating dropdown
  dropdown: {
    position: 'absolute',
    minWidth: 170,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 999,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  dropdownItemBorder: { borderTopWidth: 1, borderTopColor: COLORS.borderSubtle },
  dropdownItemText: { fontSize: 14, fontWeight: FONT.medium, color: COLORS.text },
  dropdownItemActive: { color: COLORS.accent },

  // List
  list: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 32 },

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
  boardThumb: { borderRightWidth: 1, borderRightColor: COLORS.border },
  cardInfo: { flex: 1, paddingVertical: 14, paddingLeft: 12, gap: 6 },
  chevron: { paddingRight: 12 },

  // Card text
  openingName: { fontSize: 14, fontWeight: FONT.bold, color: COLORS.text },
  openingDesc: { fontSize: 11, color: COLORS.textMuted, lineHeight: 16 },

  // Bottom meta row
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  colorBadge: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  colorBadgeWhite: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)' },
  colorBadgeBlack: { backgroundColor: 'rgba(0,0,0,0.3)', borderColor: 'rgba(255,255,255,0.08)' },
  colorBadgeText: { fontSize: 10, fontWeight: FONT.semibold },
  colorTextWhite: { color: COLORS.textMuted },
  colorTextBlack: { color: COLORS.textDim },
  diffBadge: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  diffText: { fontSize: 10, fontWeight: FONT.semibold },
  statusText: { fontSize: 10, fontWeight: FONT.semibold },
  statusNew: { color: COLORS.textDim },
  statusInProgress: { color: COLORS.accent },
  statusMastered: { color: COLORS.success },

  // Empty state
  empty: { alignItems: 'center', paddingTop: 48, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 14, color: COLORS.textMuted },
  clearFilters: { fontSize: 13, color: COLORS.accent, fontWeight: FONT.semibold, marginTop: 4 },
});
