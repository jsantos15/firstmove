import { useState } from 'react';
import {
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
import { MiniBoard } from '../components/board/MiniBoard';
import { COLORS, FONT, RADIUS } from '../lib/constants';
import { findOpening } from '../lib/mockOpenings';
import type { MockVariation } from '../lib/mockOpenings';
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

function PunishCard({ variation }: { variation: MockVariation }) {
  return (
    <View style={styles.punishCard}>
      <View style={styles.punishHeader}>
        <View style={styles.punishIconBox}>
          <Text style={styles.punishIcon}>⚡</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.punishName} numberOfLines={2}>{variation.name}</Text>
          {variation.badge && (
            <View style={styles.punishBadge}>
              <Text style={styles.punishBadgeText}>{variation.badge}</Text>
            </View>
          )}
        </View>
      </View>
      <MoveList moves={variation.moves} />
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function OpeningDetailScreen({ route, navigation }: Props) {
  const { openingSlug } = route.params;
  const opening = findOpening(openingSlug);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<ActiveTab>('reference');

  if (!opening) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </Pressable>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Opening not found</Text>
        </View>
      </View>
    );
  }

  const referenceVariation = opening.variations.find(v => !v.isPunishLine);
  const punishLines = opening.variations.filter(v => v.isPunishLine);
  const boardSize = width - 40;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </Pressable>
        <View style={styles.headerTitle}>
          <Text style={styles.headerName} numberOfLines={1}>{opening.name}</Text>
          <Text style={styles.headerEco}>{opening.eco}</Text>
        </View>
        <Pressable
          style={styles.practiceButton}
          onPress={() =>
            referenceVariation &&
            navigation.navigate('Practice', {
              openingSlug: opening.id,
              variationId: referenceVariation.id,
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
            fen={opening.fen}
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
            {opening.variations
              .filter(v => !v.isPunishLine)
              .map(v => (
                <View key={v.id} style={styles.variationBlock}>
                  <Text style={styles.variationName}>{v.name}</Text>
                  <MoveList moves={v.moves} />
                </View>
              ))}
          </View>
        ) : (
          <View style={styles.section}>
            {punishLines.length === 0 ? (
              <View style={styles.noPunish}>
                <Text style={styles.noPunishText}>No punish lines yet for this opening.</Text>
              </View>
            ) : (
              punishLines.map(v => <PunishCard key={v.id} variation={v} />)
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
  noPunish: { paddingVertical: 32, alignItems: 'center' },
  noPunishText: { fontSize: 13, color: COLORS.textDim },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { fontSize: 14, color: COLORS.textMuted },
});
