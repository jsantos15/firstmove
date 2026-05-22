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

// ─── Mock data (replace with real data once backend is connected) ─────────────

const DAILY_CHALLENGE = {
  fen: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 8',
  label: 'Giuoco Piano',
  turn: 'White to move',
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
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16 },
      ]}
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

      {/* Daily Challenge card */}
      <TouchableOpacity style={styles.challengeCard} activeOpacity={0.88}>
        <View style={styles.challengeHeader}>
          <View style={styles.challengeTitleRow}>
            <View style={styles.liveTag}>
              <Text style={styles.liveTagText}>TODAY</Text>
            </View>
            <Text style={styles.challengeLabel}>{DAILY_CHALLENGE.label}</Text>
          </View>
          <View style={styles.eloBadge}>
            <Text style={styles.eloBadgeText}>{DAILY_CHALLENGE.eloBracket}</Text>
          </View>
        </View>

        <View style={styles.boardWrapper}>
          <View style={styles.boardShadow}>
            <MiniBoard fen={DAILY_CHALLENGE.fen} size={168} />
          </View>
        </View>

        <View style={styles.challengeFooter}>
          <View>
            <Text style={styles.challengeTurn}>{DAILY_CHALLENGE.turn}</Text>
            <Text style={styles.challengeSolved}>
              {DAILY_CHALLENGE.solvedCount.toLocaleString()} solved today
            </Text>
          </View>
          <TouchableOpacity style={styles.solveButton} activeOpacity={0.82}>
            <Text style={styles.solveButtonText}>Solve it  →</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* Two bottom cards */}
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
          <View style={styles.cardBottom}>
            <Text style={styles.likesText}>♥ {TRENDING_LINE.likes}</Text>
          </View>
        </TouchableOpacity>

        {/* Continue where you left off */}
        <TouchableOpacity style={[styles.card, styles.cardRight]} activeOpacity={0.85}>
          <Text style={styles.cardTag}>Continue</Text>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {CONTINUE.openingName}
          </Text>
          <Text style={styles.cardSub} numberOfLines={1}>
            {CONTINUE.variationName}
          </Text>
          <View style={styles.cardBottom}>
            <Text style={styles.starsText}>
              {'★'.repeat(CONTINUE.masteryStars)}
              {'☆'.repeat(5 - CONTINUE.masteryStars)}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Community activity — placeholder for future */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Community</Text>
      </View>
      <View style={styles.communityPlaceholder}>
        <Text style={styles.communityPlaceholderText}>
          Community activity coming soon
        </Text>
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
    gap: 16,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
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
    borderColor: 'rgba(245, 158, 11, 0.2)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    gap: 4,
  },
  streakFire: { fontSize: 14 },
  streakCount: {
    fontSize: 14,
    fontWeight: FONT.bold,
    color: COLORS.accent,
  },

  // Challenge card
  challengeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  challengeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
  },
  challengeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveTag: {
    backgroundColor: COLORS.accent,
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  liveTagText: {
    fontSize: 10,
    fontWeight: FONT.bold,
    color: COLORS.bgBase,
    letterSpacing: 0.8,
  },
  challengeLabel: {
    fontSize: 13,
    fontWeight: FONT.medium,
    color: COLORS.textMuted,
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
  boardWrapper: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  boardShadow: {
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  challengeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSubtle,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  challengeTurn: {
    fontSize: 14,
    fontWeight: FONT.semibold,
    color: COLORS.text,
    marginBottom: 2,
  },
  challengeSolved: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  solveButton: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.sm,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  solveButtonText: {
    fontSize: 13,
    fontWeight: FONT.bold,
    color: COLORS.bgBase,
  },

  // Two-card row
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
    minHeight: 130,
    justifyContent: 'space-between',
  },
  cardLeft: {},
  cardRight: {},
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  cardTag: {
    fontSize: 11,
    fontWeight: FONT.semibold,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cardEco: {
    fontSize: 10,
    fontWeight: FONT.semibold,
    color: COLORS.textDim,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: FONT.bold,
    color: COLORS.text,
    lineHeight: 18,
  },
  cardSub: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  cardBottom: {
    marginTop: 4,
  },
  likesText: {
    fontSize: 12,
    color: COLORS.accent,
    fontWeight: FONT.semibold,
  },
  starsText: {
    fontSize: 14,
    color: COLORS.accent,
    letterSpacing: 1,
  },

  // Community section
  sectionHeader: {
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: FONT.bold,
    color: COLORS.text,
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
  communityPlaceholderText: {
    fontSize: 13,
    color: COLORS.textDim,
  },
});
