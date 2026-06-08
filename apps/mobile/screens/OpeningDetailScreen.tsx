import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Chess } from '@firstmove/core';
import { MiniBoard } from '../components/board/MiniBoard';
import { COLORS, FONT, RADIUS } from '../lib/constants';
import {
  getOpeningCatalogBySlug,
  getOpeningLinesBySlug,
  type OpeningLineRow,
} from '@firstmove/supabase';
import type { OpeningsStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<OpeningsStackParamList, 'OpeningDetail'>;
type ActiveTab = 'reference' | 'punish';

// ─── Move list for a variation ────────────────────────────────────────────────

function MoveList({ moves }: { moves: string[] }) {
  const pairs: Array<{ num: number; white: string; black: string }> = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      num: Math.floor(i / 2) + 1,
      white: moves[i] ?? '',
      black: moves[i + 1] ?? '',
    });
  }

  return (
    <View style={styles.moveGrid}>
      {pairs.map(({ num, white, black }) => (
        <View key={num} style={styles.moveRow}>
          <Text style={styles.moveNum}>{num}.</Text>
          <Text style={styles.moveWhite}>{white}</Text>
          <Text style={styles.moveBlack}>{black}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Punish line card ──────────────────────────────────────────────────────────

function isPunishLine(line: OpeningLineRow) {
  const text = `${line.name} ${line.full_name ?? ''} ${line.primary_category ?? ''}`.toLowerCase();
  return (
    text.includes('punish') ||
    text.includes('trap') ||
    text.includes('tactical_payoff') ||
    line.primary_category === 'tactical_payoff'
  );
}

function lineFinalFen(line: OpeningLineRow) {
  try {
    const chess = new Chess();
    for (const san of line.sans) chess.move(san);
    return chess.fen();
  } catch {
    return undefined;
  }
}

// ─── Punish line card ──────────────────────────────────────────────────────────

function PunishCard({ variation }: { variation: OpeningLineRow }) {
  return (
    <View style={styles.punishCard}>
      <View style={styles.punishHeader}>
        <View style={styles.punishIconBox}>
          <Text style={styles.punishIcon}>⚡</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.punishName} numberOfLines={2}>{variation.name}</Text>
          {variation.inclusion_outcome && (
            <View style={styles.punishBadge}>
              <Text style={styles.punishBadgeText}>{variation.inclusion_outcome}</Text>
            </View>
          )}
        </View>
      </View>
      <MoveList moves={variation.sans} />
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function OpeningDetailScreen({ route, navigation }: Props) {
  const { openingSlug } = route.params;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<ActiveTab>('reference');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['openings', openingSlug],
    queryFn: async () => {
      const [opening, lines] = await Promise.all([
        getOpeningCatalogBySlug(openingSlug),
        getOpeningLinesBySlug(openingSlug),
      ]);
      return { opening, lines };
    },
    staleTime: 1000 * 60 * 10,
  });

  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
      </View>
    );
  }

  if (isError || !data?.opening) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Pressable style={[styles.backButton, styles.floatingBackButton]} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </Pressable>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>
            {isError ? 'Could not load opening' : 'Opening not found'}
          </Text>
          {isError && (
            <Text style={styles.errorDetailText}>
              {error instanceof Error ? error.message : 'Unknown opening detail error'}
            </Text>
          )}
        </View>
      </View>
    );
  }

  const { opening, lines } = data;
  const referenceLines = lines.filter(line => !isPunishLine(line));
  const punishLines = lines.filter(isPunishLine);
  const referenceVariation = referenceLines[0];
  const boardSize = width - 40;
  const boardFen =
    opening.preview_fen ??
    (referenceVariation ? lineFinalFen(referenceVariation) : undefined);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </Pressable>
        <View style={styles.headerTitle}>
          <Text style={styles.headerName} numberOfLines={1}>{opening.name}</Text>
          <Text style={styles.headerEco}>{opening.eco_code}</Text>
        </View>
        <Pressable
          style={styles.practiceButton}
          onPress={() =>
            referenceVariation &&
            navigation.navigate('Practice', {
              openingSlug: opening.slug,
              variationId: referenceVariation.slug,
              mode: 'learn',
            })
          }
        >
          <Text style={styles.practiceButtonText}>Practice</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Board */}
        <View style={styles.boardSection}>
          <MiniBoard
            fen={boardFen}
            size={boardSize}
            orientation={opening.color === 'black' ? 'black' : 'white'}
          />
        </View>

        {/* Meta row */}
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
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaDifficulty}>{opening.difficulty}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaDesc} numberOfLines={2}>{opening.description}</Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, activeTab === 'reference' && styles.tabActive]}
            onPress={() => setActiveTab('reference')}
          >
            <Text style={[styles.tabText, activeTab === 'reference' && styles.tabTextActive]}>
              Reference Line
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'punish' && styles.tabActive]}
            onPress={() => setActiveTab('punish')}
          >
            <Text style={[styles.tabText, activeTab === 'punish' && styles.tabTextActive]}>
              ⚡ Punish Lines ({punishLines.length})
            </Text>
          </Pressable>
        </View>

        {/* Tab content */}
        {activeTab === 'reference' ? (
          <View style={styles.section}>
            {referenceLines.length === 0 ? (
              <View style={styles.noPunish}>
                <Text style={styles.noPunishText}>No reference lines yet for this opening.</Text>
              </View>
            ) : (
              referenceLines.map(v => (
                <View key={v.slug} style={styles.variationBlock}>
                  <Text style={styles.variationName}>{v.name}</Text>
                  <MoveList moves={v.sans} />
                </View>
              ))
            )}
          </View>
        ) : (
          <View style={styles.section}>
            {punishLines.length === 0 ? (
              <View style={styles.noPunish}>
                <Text style={styles.noPunishText}>No punish lines yet for this opening.</Text>
              </View>
            ) : (
              punishLines.map(v => <PunishCard key={v.slug} variation={v} />)
            )}
          </View>
        )}

        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bgBase },
  scroll: { paddingHorizontal: 20 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingBackButton: {
    marginLeft: 16,
    marginTop: 12,
  },
  headerTitle: { flex: 1, gap: 1 },
  headerName: { fontSize: 15, fontWeight: FONT.bold, color: COLORS.text },
  headerEco: { fontSize: 11, color: COLORS.textDim, fontWeight: FONT.medium },
  practiceButton: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.sm,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  practiceButtonText: { fontSize: 13, fontWeight: FONT.bold, color: COLORS.bgBase },

  // Board section
  boardSection: {
    marginTop: 16,
    marginHorizontal: -20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },

  // Meta
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 14,
    paddingBottom: 4,
  },
  colorBadge: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  colorBadgeWhite: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)' },
  colorBadgeBlack: { backgroundColor: 'rgba(0,0,0,0.3)', borderColor: 'rgba(255,255,255,0.08)' },
  colorBadgeText: { fontSize: 11, fontWeight: FONT.semibold },
  colorTextWhite: { color: COLORS.textMuted },
  colorTextBlack: { color: COLORS.textDim },
  metaDot: { fontSize: 12, color: COLORS.textDim },
  metaDifficulty: { fontSize: 12, color: COLORS.textDim, textTransform: 'capitalize' },
  metaDesc: { fontSize: 12, color: COLORS.textMuted, flex: 1 },

  // Tabs
  tabs: {
    flexDirection: 'row',
    marginTop: 16,
    marginBottom: 4,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 3,
    gap: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: COLORS.bgBase },
  tabText: { fontSize: 12, fontWeight: FONT.medium, color: COLORS.textDim },
  tabTextActive: { color: COLORS.text, fontWeight: FONT.semibold },

  // Section
  section: { paddingTop: 12, gap: 12 },

  // Variation block (reference lines)
  variationBlock: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 12,
  },
  variationName: { fontSize: 13, fontWeight: FONT.semibold, color: COLORS.text },

  // Move list
  moveGrid: { gap: 2 },
  moveRow: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  moveNum: { width: 28, fontSize: 13, color: COLORS.textDim, fontWeight: FONT.medium },
  moveWhite: { width: 80, fontSize: 13, color: COLORS.text, fontWeight: FONT.medium },
  moveBlack: { flex: 1, fontSize: 13, color: COLORS.textMuted },

  // Punish card
  punishCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    padding: 14,
    gap: 12,
  },
  punishHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  punishIconBox: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  punishIcon: { fontSize: 16 },
  punishName: { fontSize: 13, fontWeight: FONT.semibold, color: COLORS.text, flex: 1 },
  punishBadge: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.accentDim,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  punishBadgeText: { fontSize: 10, fontWeight: FONT.bold, color: COLORS.accent, letterSpacing: 0.2 },

  // Empty / not found
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noPunish: { paddingVertical: 32, alignItems: 'center' },
  noPunishText: { fontSize: 13, color: COLORS.textDim },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { fontSize: 14, color: COLORS.textMuted },
  errorDetailText: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.textDim,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
