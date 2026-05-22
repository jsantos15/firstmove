import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniBoard } from '../components/board/MiniBoard';
import { COLORS, FONT, RADIUS } from '../lib/constants';

// ─── Mock data ────────────────────────────────────────────────────────────────

const DAILY_CHALLENGE = {
  // Ruy Lopez — Morphy Defense tactical position, White to move with a winning fork
  fen: 'r1bq1rk1/2p1bppp/p1n2n2/1p1pp3/3PP3/1BN2N2/PPP2PPP/R1BQR1K1 w - - 0 10',
  turn: 'White to move',
  description: 'Find the winning combination',
  solvedCount: 312,
  eloBracket: '800+',
};

const TRENDING_LINE = {
  openingName: "King's Indian Defense",
  variationName: 'Classical Variation',
  ecoCode: 'E92',
  likes: 214,
};

const CONTINUE = {
  openingName: 'Sicilian Defense',
  variationName: 'Najdorf Variation',
  masteryStars: 3,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const streak = 14;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>FirstMove</Text>
        <View style={styles.streakBadge}>
          <Text style={styles.streakFire}>🔥</Text>
          <Text style={styles.streakCount}>{streak}</Text>
        </View>
      </View>

      {/* ── Daily Challenge card ───────────────────────────────────────────── */}
      <TouchableOpacity style={styles.challengeCard} activeOpacity={0.88}>

        {/* Top row: tag + elo badge */}
        <View style={styles.challengeTop}>
          <View style={styles.dailyTag}>
            <Text style={styles.dailyTagText}>DAILY PUZZLE</Text>
          </View>
          <View style={styles.eloBadge}>
            <Text style={styles.eloBadgeText}>{DAILY_CHALLENGE.eloBracket}</Text>
          </View>
        </View>

        {/* Middle row: board left, info right */}
        <View style={styles.challengeBody}>
          <View style={styles.boardWrapper}>
            <MiniBoard fen={DAILY_CHALLENGE.fen} size={186} />
          </View>

          <View style={styles.challengeInfo}>
            <Text style={styles.challengeTurn}>{DAILY_CHALLENGE.turn}</Text>
            <Text style={styles.challengeDesc}>{DAILY_CHALLENGE.description}</Text>
            <View style={styles.solvedRow}>
              <View style={styles.dot} />
              <Text style={styles.solvedText}>
                {DAILY_CHALLENGE.solvedCount.toLocaleString()} solved today
              </Text>
            </View>
          </View>
        </View>

        {/* Bottom: full-width solve button */}
        <View style={styles.challengeFooter}>
          <TouchableOpacity style={styles.solveButton} activeOpacity={0.82}>
            <Text style={styles.solveButtonText}>Solve it  →</Text>
          </TouchableOpacity>
        </View>

      </TouchableOpacity>

      {/* ── Two bottom cards ──────────────────────────────────────────────── */}
      <View style={styles.cardsRow}>

        {/* Trending line */}
        <TouchableOpacity style={[styles.card, styles.cardLeft]} activeOpacity={0.85}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardTag}>🔥 Trending</Text>
            <Text style={styles.cardEco}>{TRENDING_LINE.ecoCode}</Text>
          </View>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {TRENDING_LINE.openingName}
          </Text>
          <Text style={styles.cardSub} numberOfLines={1}>
            {TRENDING_LINE.variationName}
          </Text>
          <Text style={styles.likesText}>♥ {TRENDING_LINE.likes}</Text>
        </TouchableOpacity>

        {/* Continue */}
        <TouchableOpacity style={[styles.card, styles.cardRight]} activeOpacity={0.85}>
          <Text style={styles.cardTag}>Continue</Text>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {CONTINUE.openingName}
          </Text>
          <Text style={styles.cardSub} numberOfLines={1}>
            {CONTINUE.variationName}
          </Text>
          <Text style={styles.starsText}>
            {'★'.repeat(CONTINUE.masteryStars)}{'☆'.repeat(5 - CONTINUE.masteryStars)}
          </Text>
        </TouchableOpacity>

      </View>

      {/* ── Community placeholder ─────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Community</Text>
      <View style={styles.communityPlaceholder}>
        <Text style={styles.communityText}>Community activity coming soon</Text>
      </View>

    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bgBase,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 14,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    fontSize: 22,
    fontWeight: FONT.bold,
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentDim,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    gap: 4,
  },
  streakFire: { fontSize: 14 },
  streakCount: { fontSize: 14, fontWeight: FONT.bold, color: COLORS.accent },

  // Challenge card
  challengeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  challengeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  dailyTag: {
    backgroundColor: COLORS.accent,
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  dailyTagText: {
    fontSize: 10,
    fontWeight: FONT.bold,
    color: COLORS.bgBase,
    letterSpacing: 0.9,
  },
  eloBadge: {
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  eloBadgeText: {
    fontSize: 11,
    fontWeight: FONT.semibold,
    color: COLORS.textDim,
  },

  // Board + info side by side
  challengeBody: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 16,
    paddingBottom: 16,
    gap: 16,
  },
  boardWrapper: {
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  challengeInfo: {
    flex: 1,
    gap: 6,
  },
  challengeTurn: {
    fontSize: 15,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  challengeDesc: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  solvedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
  },
  solvedText: {
    fontSize: 11,
    color: COLORS.textMuted,
  },

  // Solve button footer
  challengeFooter: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSubtle,
    padding: 14,
  },
  solveButton: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: 13,
    alignItems: 'center',
  },
  solveButtonText: {
    fontSize: 14,
    fontWeight: FONT.bold,
    color: COLORS.bgBase,
  },

  // Two cards
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 4,
    minHeight: 128,
    justifyContent: 'space-between',
  },
  cardLeft: {},
  cardRight: {},
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTag: {
    fontSize: 10,
    fontWeight: FONT.semibold,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardEco: {
    fontSize: 9,
    fontWeight: FONT.semibold,
    color: COLORS.textDim,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: FONT.bold,
    color: COLORS.text,
    lineHeight: 18,
  },
  cardSub: { fontSize: 11, color: COLORS.textMuted },
  likesText: { fontSize: 12, color: COLORS.accent, fontWeight: FONT.semibold },
  starsText: { fontSize: 13, color: COLORS.accent, letterSpacing: 1 },

  // Community
  sectionTitle: {
    fontSize: 16,
    fontWeight: FONT.bold,
    color: COLORS.text,
    marginTop: 4,
  },
  communityPlaceholder: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    paddingVertical: 32,
    alignItems: 'center',
  },
  communityText: { fontSize: 13, color: COLORS.textDim },
});
