import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MiniBoard } from '../components/board/MiniBoard';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { COLORS, FONT, RADIUS } from '../lib/constants';

// ─── Mock data ────────────────────────────────────────────────────────────────

const CONTINUE = {
  openingName: 'Sicilian Defense',
  variationName: 'Najdorf Variation',
  masteryStars: 3,
  fen: 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6',
};

const TRENDING_LINE = {
  openingName: "King's Indian Defense",
  variationName: 'Classical Variation',
  ecoCode: 'E92',
  likes: 214,
};

const DAILY_CHALLENGE = {
  fen: 'r1bq1rk1/2p1bppp/p1n2n2/1p1pp3/3PP3/1BN2N2/PPP2PPP/R1BQ1RK1 w - - 0 10',
  turn: 'White to move',
  solvedCount: 312,
  eloBracket: '800+',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function HomeScreen() {
  const { width } = useWindowDimensions();

  const dailyBoardSize = width - 40;

  return (
    <View style={styles.root}>
      <ScreenHeader title="FirstMove" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Continue ───────────────────────────────────────────────────── */}
        <TouchableOpacity style={styles.continueCard} activeOpacity={0.88}>

          <View style={styles.continueHeader}>
            <View style={styles.continueTag}>
              <View style={styles.continueDot} />
              <Text style={styles.continueTagText}>CONTINUE</Text>
            </View>
            <Text style={styles.continueLastText}>In progress</Text>
          </View>

          <View style={styles.continueBody}>
            <View style={styles.continueText}>
              <Text style={styles.continueOpeningName}>{CONTINUE.openingName}</Text>
              <Text style={styles.continueVariationName}>{CONTINUE.variationName}</Text>
              <Text style={styles.continueStars}>
                {'★'.repeat(CONTINUE.masteryStars)}
                {'☆'.repeat(5 - CONTINUE.masteryStars)}
              </Text>
            </View>
            <View style={styles.continueBoardWrap}>
              <MiniBoard fen={CONTINUE.fen} size={112} />
            </View>
          </View>

        </TouchableOpacity>

        {/* ── Daily Puzzle ───────────────────────────────────────────────── */}
        <TouchableOpacity style={styles.challengeCard} activeOpacity={0.88}>

          <View style={styles.challengeTop}>
            <View style={styles.dailyTag}>
              <Text style={styles.dailyTagText}>DAILY PUZZLE</Text>
            </View>
            <View style={styles.challengeTopRight}>
              <View style={styles.eloBadge}>
                <Text style={styles.eloBadgeText}>{DAILY_CHALLENGE.eloBracket}</Text>
              </View>
              <Text style={styles.turnLabel}>{DAILY_CHALLENGE.turn}</Text>
            </View>
          </View>

          <View style={styles.boardWrapper}>
            <MiniBoard fen={DAILY_CHALLENGE.fen} size={dailyBoardSize} />
          </View>

          <View style={styles.challengeFooter}>
            <View style={styles.solvedRow}>
              <View style={styles.dot} />
              <Text style={styles.solvedText}>
                {DAILY_CHALLENGE.solvedCount.toLocaleString()} solved today
              </Text>
            </View>
            <TouchableOpacity style={styles.solveButton} activeOpacity={0.82}>
              <Text style={styles.solveButtonText}>Solve it  →</Text>
            </TouchableOpacity>
          </View>

        </TouchableOpacity>

        {/* ── Trending ───────────────────────────────────────────────────── */}
        <TouchableOpacity style={styles.trendingCard} activeOpacity={0.85}>
          <View style={styles.trendingTop}>
            <View style={styles.trendingTagRow}>
              <Ionicons name="flame" size={13} color={COLORS.error} />
              <Text style={styles.trendingTag}>TRENDING</Text>
            </View>
            <View style={styles.ecoChip}>
              <Text style={styles.ecoChipText}>{TRENDING_LINE.ecoCode}</Text>
            </View>
          </View>
          <Text style={styles.trendingName}>{TRENDING_LINE.openingName}</Text>
          <Text style={styles.trendingVariation}>{TRENDING_LINE.variationName}</Text>
          <View style={styles.trendingFooter}>
            <Ionicons name="heart" size={13} color={COLORS.accent} />
            <Text style={styles.trendingLikes}>{TRENDING_LINE.likes.toLocaleString()} likes this week</Text>
          </View>
        </TouchableOpacity>

        {/* ── Community placeholder ──────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Community</Text>
        <View style={styles.communityPlaceholder}>
          <Ionicons name="people-outline" size={28} color={COLORS.textDim} />
          <Text style={styles.communityText}>Community activity coming soon</Text>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bgBase },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 16 },

  // Continue card
  continueCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  continueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  continueTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  continueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  continueTagText: {
    fontSize: 11,
    fontWeight: FONT.bold,
    color: COLORS.success,
    letterSpacing: 0.8,
  },
  continueLastText: {
    fontSize: 11,
    color: COLORS.textDim,
    fontWeight: FONT.medium,
  },
  continueBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 12,
  },
  continueText: {
    flex: 1,
    gap: 5,
  },
  continueOpeningName: {
    fontSize: 18,
    fontWeight: FONT.bold,
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  continueVariationName: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: FONT.medium,
  },
  continueStars: {
    fontSize: 15,
    color: COLORS.accent,
    letterSpacing: 2,
    marginTop: 4,
  },
  continueBoardWrap: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  // Trending card
  trendingCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 5,
  },
  trendingTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  trendingTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  trendingTag: {
    fontSize: 11,
    fontWeight: FONT.bold,
    color: COLORS.error,
    letterSpacing: 0.7,
  },
  ecoChip: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  ecoChipText: {
    fontSize: 10,
    fontWeight: FONT.semibold,
    color: COLORS.textDim,
  },
  trendingName: {
    fontSize: 16,
    fontWeight: FONT.bold,
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  trendingVariation: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  trendingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  trendingLikes: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: FONT.medium,
  },

  // Daily puzzle card
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
  challengeTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  turnLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: FONT.medium,
  },
  boardWrapper: {
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  challengeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  solvedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
  },
  solvedText: { fontSize: 12, color: COLORS.textMuted },
  solveButton: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.sm,
    paddingVertical: 9,
    paddingHorizontal: 20,
  },
  solveButtonText: {
    fontSize: 13,
    fontWeight: FONT.bold,
    color: COLORS.bgBase,
  },

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
    gap: 8,
  },
  communityText: { fontSize: 13, color: COLORS.textDim },
});
