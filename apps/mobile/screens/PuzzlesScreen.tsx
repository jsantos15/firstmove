import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { MiniBoard } from '../components/board/MiniBoard';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { COLORS, FONT, RADIUS } from '../lib/constants';
import type { TrainStackParamList } from '../navigation/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OpeningTrack {
  id: string;
  slug: string;
  name: string;
  eco: string;
  fen: string;
  nodeCount: number;
  completedCount: number;
}

interface GridItem {
  id: string;
  label: string;
  description: string;
  theme: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  dimColor: string;
}

interface EndgameCategory {
  id: string;
  label: string;
  topics: GridItem[];
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const OPENING_TRACKS: OpeningTrack[] = [
  {
    id: 'caro-kann',
    slug: 'caro-kann-defense',
    name: 'Caro-Kann',
    eco: 'B10–B19',
    fen: 'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    nodeCount: 18,
    completedCount: 6,
  },
  {
    id: 'italian',
    slug: 'italian-game',
    name: 'Italian Game',
    eco: 'C50–C59',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
    nodeCount: 18,
    completedCount: 0,
  },
  {
    id: 'sicilian',
    slug: 'sicilian-defense',
    name: 'Sicilian Defense',
    eco: 'B20–B99',
    fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    nodeCount: 18,
    completedCount: 0,
  },
  {
    id: 'ruy-lopez',
    slug: 'ruy-lopez',
    name: 'Ruy López',
    eco: 'C60–C99',
    fen: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
    nodeCount: 18,
    completedCount: 0,
  },
  {
    id: 'french',
    slug: 'french-defense',
    name: 'French Defense',
    eco: 'C00–C19',
    fen: 'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    nodeCount: 18,
    completedCount: 0,
  },
  {
    id: 'queens-gambit',
    slug: 'queens-gambit',
    name: "Queen's Gambit",
    eco: 'D06–D69',
    fen: 'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2',
    nodeCount: 18,
    completedCount: 0,
  },
  {
    id: 'kings-indian',
    slug: 'kings-indian-defense',
    name: "King's Indian",
    eco: 'E60–E99',
    fen: 'rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
    nodeCount: 18,
    completedCount: 0,
  },
];

// Lichess theme tag in `theme` — used directly as the puzzle filter when navigating
const TACTIC_ITEMS: GridItem[] = [
  {
    id: 'fork',
    label: 'Fork',
    description: 'Attack two pieces simultaneously with one move',
    theme: 'fork',
    icon: 'git-branch-outline',
    color: COLORS.accent,
    dimColor: COLORS.accentDim,
  },
  {
    id: 'pin',
    label: 'Pin',
    description: 'Immobilize a piece that shields a more valuable target',
    theme: 'pin',
    icon: 'lock-closed-outline',
    color: COLORS.accent,
    dimColor: COLORS.accentDim,
  },
  {
    id: 'skewer',
    label: 'Skewer',
    description: 'Force a valuable piece to move, exposing one behind it',
    theme: 'skewer',
    icon: 'arrow-forward-circle-outline',
    color: COLORS.accent,
    dimColor: COLORS.accentDim,
  },
  {
    id: 'discovered-attack',
    label: 'Discovered Attack',
    description: 'Uncover a hidden attack by moving another piece',
    theme: 'discoveredAttack',
    icon: 'eye-outline',
    color: COLORS.accent,
    dimColor: COLORS.accentDim,
  },
  {
    id: 'double-check',
    label: 'Double Check',
    description: 'Check with two pieces at once — the king must move',
    theme: 'doubleCheck',
    icon: 'flash-outline',
    color: COLORS.accent,
    dimColor: COLORS.accentDim,
  },
  {
    id: 'deflection',
    label: 'Deflection',
    description: 'Force a defender away from its key square or file',
    theme: 'deflection',
    icon: 'return-down-forward-outline',
    color: COLORS.accent,
    dimColor: COLORS.accentDim,
  },
  {
    id: 'back-rank',
    label: 'Back Rank Mate',
    description: 'Exploit an undefended first or eighth rank',
    theme: 'backRankMate',
    icon: 'reorder-four-outline',
    color: COLORS.accent,
    dimColor: COLORS.accentDim,
  },
  {
    id: 'interference',
    label: 'Interference',
    description: 'Cut communication between two enemy pieces',
    theme: 'interference',
    icon: 'remove-circle-outline',
    color: COLORS.accent,
    dimColor: COLORS.accentDim,
  },
  {
    id: 'zwischenzug',
    label: 'Zwischenzug',
    description: 'An in-between move that changes the evaluation',
    theme: 'zwischenzug',
    icon: 'repeat-outline',
    color: COLORS.accent,
    dimColor: COLORS.accentDim,
  },
  {
    id: 'desperado',
    label: 'Desperado',
    description: 'A piece about to be captured goes down fighting',
    theme: 'desperado',
    icon: 'flame-outline',
    color: COLORS.accent,
    dimColor: COLORS.accentDim,
  },
];

const ENDGAME_CATEGORIES: EndgameCategory[] = [
  {
    id: 'king-pawn',
    label: 'King & Pawn',
    topics: [
      { id: 'eg-opposition',   label: 'Opposition',        description: 'Control the board with just kings',           theme: 'pawnEndgame', icon: 'swap-horizontal-outline', color: COLORS.success, dimColor: COLORS.successDim },
      { id: 'eg-key-squares',  label: 'Key Squares',       description: 'Squares the king must reach to promote',      theme: 'pawnEndgame', icon: 'grid-outline',            color: COLORS.success, dimColor: COLORS.successDim },
      { id: 'eg-pawn-races',   label: 'Pawn Races',        description: 'Who promotes first — and what happens',       theme: 'pawnEndgame', icon: 'flash-outline',           color: COLORS.success, dimColor: COLORS.successDim },
      { id: 'eg-passed-pawns', label: 'Passed Pawns',      description: 'Escort a passer to promotion',                theme: 'pawnEndgame', icon: 'arrow-up-outline',        color: COLORS.success, dimColor: COLORS.successDim },
    ],
  },
  {
    id: 'rook-endgames',
    label: 'Rook Endgames',
    topics: [
      { id: 'eg-lucena',       label: 'Lucena Position',   description: 'The fundamental winning rook + pawn method',  theme: 'rookEndgame', icon: 'trophy-outline',          color: COLORS.success, dimColor: COLORS.successDim },
      { id: 'eg-philidor',     label: 'Philidor Position', description: 'The defensive drawing technique',             theme: 'rookEndgame', icon: 'shield-outline',          color: COLORS.success, dimColor: COLORS.successDim },
      { id: 'eg-rook-behind',  label: 'Rook Behind Pawn',  description: 'Active rook placement behind the passer',     theme: 'rookEndgame', icon: 'albums-outline',          color: COLORS.success, dimColor: COLORS.successDim },
      { id: 'eg-cutoff',       label: 'Cutoff Technique',  description: 'Cut off the defending king along a rank',     theme: 'rookEndgame', icon: 'remove-outline',          color: COLORS.success, dimColor: COLORS.successDim },
    ],
  },
  {
    id: 'minor-pieces',
    label: 'Minor Piece Endgames',
    topics: [
      { id: 'eg-good-bad-bishop', label: 'Good vs Bad Bishop', description: 'Pawn structure determines bishop strength', theme: 'bishopEndgame', icon: 'checkmark-done-outline', color: COLORS.success, dimColor: COLORS.successDim },
      { id: 'eg-bishop-knight',   label: 'Bishop vs Knight',   description: 'Open vs closed — when each piece wins',    theme: 'bishopEndgame', icon: 'shuffle-outline',         color: COLORS.success, dimColor: COLORS.successDim },
      { id: 'eg-opp-bishops',     label: 'Opposite Bishops',   description: 'The drawing fortress with unlike bishops', theme: 'bishopEndgame', icon: 'contrast-outline',        color: COLORS.success, dimColor: COLORS.successDim },
      { id: 'eg-knight-endings',  label: 'Knight Endgames',    description: 'Outposts, blockades, unique geometry',     theme: 'knightEndgame', icon: 'refresh-outline',         color: COLORS.success, dimColor: COLORS.successDim },
    ],
  },
  {
    id: 'checkmate-patterns',
    label: 'Checkmate Patterns',
    topics: [
      { id: 'eg-two-bishops',  label: 'Two Bishops',          description: 'Force the king to the corner',             theme: 'matingNet',   icon: 'apps-outline',            color: COLORS.success, dimColor: COLORS.successDim },
      { id: 'eg-bn-mate',      label: 'Bishop & Knight',      description: 'The hardest elementary mate',              theme: 'matingNet',   icon: 'build-outline',           color: COLORS.success, dimColor: COLORS.successDim },
      { id: 'eg-queen-pawn',   label: 'Queen vs Pawn',        description: 'Win or draw depending on file and rank',   theme: 'queenEndgame', icon: 'star-outline',           color: COLORS.success, dimColor: COLORS.successDim },
      { id: 'eg-rook-pawn',    label: 'Rook vs Pawn',         description: 'When can the stronger side win?',          theme: 'rookEndgame', icon: 'medal-outline',           color: COLORS.success, dimColor: COLORS.successDim },
    ],
  },
  {
    id: 'pawn-structures',
    label: 'Pawn Structures',
    topics: [
      { id: 'eg-zugzwang',     label: 'Zugzwang',             description: 'Any move worsens your position',           theme: 'zugzwang',    icon: 'pause-outline',           color: COLORS.success, dimColor: COLORS.successDim },
      { id: 'eg-triangulation',label: 'Triangulation',        description: 'Lose a tempo to force zugzwang',           theme: 'pawnEndgame', icon: 'triangle-outline',        color: COLORS.success, dimColor: COLORS.successDim },
      { id: 'eg-outside-pawn', label: 'Outside Passed Pawn',  description: 'A pawn decoy to win material elsewhere',   theme: 'pawnEndgame', icon: 'exit-outline',            color: COLORS.success, dimColor: COLORS.successDim },
      { id: 'eg-breakthrough', label: 'Breakthrough',         description: 'Create a passed pawn by force',            theme: 'pawnEndgame', icon: 'rocket-outline',          color: COLORS.success, dimColor: COLORS.successDim },
    ],
  },
];

// ─── Opening track card ───────────────────────────────────────────────────────

const CARD_WIDTH = 160;
const BOARD_SIZE = 104;

type TrainNav = NativeStackNavigationProp<TrainStackParamList, 'TrainHome'>;

function TrackCard({ track }: { track: OpeningTrack }) {
  const navigation = useNavigation<TrainNav>();
  const pct = track.nodeCount > 0 ? track.completedCount / track.nodeCount : 0;
  const hasProgress = track.completedCount > 0;

  return (
    <TouchableOpacity
      style={styles.trackCard}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('OpeningTrack', {
        openingSlug: track.slug,
        openingName: track.name,
        openingEco: track.eco,
      })}
    >
      <View style={styles.trackBoardWrap}>
        <MiniBoard fen={track.fen} size={BOARD_SIZE} />
      </View>
      <View style={styles.trackBody}>
        <Text style={styles.trackName} numberOfLines={2}>{track.name}</Text>
        {hasProgress && (
          <View style={styles.trackProgressBar}>
            <View style={[styles.trackProgressFill, { width: `${pct * 100}%` }]} />
          </View>
        )}
        <View style={styles.trackFooter}>
          <Text style={styles.trackEco}>{track.eco}</Text>
          {hasProgress
            ? <Text style={styles.trackProgressText}>{track.completedCount}/{track.nodeCount}</Text>
            : <Ionicons name="arrow-forward-circle" size={18} color={COLORS.accent} />
          }
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Grid card (shared by Tactics and Endgame) ────────────────────────────────

function GridCard({ item }: { item: GridItem }) {
  return (
    <TouchableOpacity style={styles.gridCard} activeOpacity={0.7}>
      <View style={[styles.gridIconBox, { backgroundColor: item.dimColor }]}>
        <Ionicons name={item.icon} size={22} color={item.color} />
      </View>
      <Text style={styles.gridLabel}>{item.label}</Text>
      <Text style={styles.gridDescription} numberOfLines={2}>{item.description}</Text>
    </TouchableOpacity>
  );
}

// Endgame category sub-section
function EndgameCategorySection({ category }: { category: EndgameCategory }) {
  return (
    <View style={styles.categorySection}>
      <Text style={styles.categoryLabel}>{category.label}</Text>
      <GridSection items={category.topics} />
    </View>
  );
}

// Two-column grid — paired explicitly so flex: 1 gives exact equal widths
function GridSection({ items }: { items: GridItem[] }) {
  const rows: GridItem[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2));
  }
  return (
    <View style={styles.grid}>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.gridRow}>
          {row.map((item) => <GridCard key={item.id} item={item} />)}
          {row.length === 1 && <View style={styles.gridPlaceholder} />}
        </View>
      ))}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function PuzzlesScreen() {
  return (
    <View style={styles.root}>
      <ScreenHeader title="Train" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >

        {/* Opening Tracks */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Opening Tracks</Text>
            <Text style={styles.sectionSub}>Puzzles rooted in openings you're studying</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.trackListContent}
          >
            {OPENING_TRACKS.map((track, idx) => (
              <View key={track.id} style={idx > 0 ? styles.trackGap : undefined}>
                <TrackCard track={track} />
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Tactics */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Tactics</Text>
            <Text style={styles.sectionSub}>Core patterns every player must know</Text>
          </View>
          <GridSection items={TACTIC_ITEMS} />
        </View>

        {/* Endgame */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Endgame</Text>
            <Text style={styles.sectionSub}>Convert advantages with precise technique</Text>
          </View>
          {ENDGAME_CATEGORIES.map(cat => (
            <EndgameCategorySection key={cat.id} category={cat} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bgBase,
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 40,
  },

  // Sections
  section: {
    marginBottom: 36,
  },
  categorySection: {
    marginBottom: 20,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: FONT.semibold,
    color: COLORS.textDim,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    marginBottom: 14,
    gap: 3,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: FONT.bold,
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  sectionSub: {
    fontSize: 12,
    color: COLORS.textMuted,
  },

  // Opening track cards
  trackListContent: {
    paddingHorizontal: 20,
  },
  trackGap: {
    marginLeft: 12,
  },
  trackCard: {
    width: CARD_WIDTH,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  trackBoardWrap: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: COLORS.surfaceElevated,
  },
  trackBody: {
    padding: 12,
    gap: 8,
  },
  trackName: {
    fontSize: 13,
    fontWeight: FONT.semibold,
    color: COLORS.text,
    lineHeight: 18,
  },
  trackFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trackEco: {
    fontSize: 11,
    fontWeight: FONT.medium,
    color: COLORS.textDim,
  },
  trackProgressBar: {
    height: 3,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  trackProgressFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 2,
  },
  trackProgressText: {
    fontSize: 11,
    fontWeight: FONT.semibold,
    color: COLORS.accent,
  },

  // Grid (Tactics + Endgame)
  grid: {
    paddingHorizontal: 20,
    gap: 10,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 10,
  },
  gridCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 9,
  },
  gridPlaceholder: {
    flex: 1,
  },
  gridIconBox: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridLabel: {
    fontSize: 13,
    fontWeight: FONT.semibold,
    color: COLORS.text,
  },
  gridDescription: {
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 15,
  },
});
