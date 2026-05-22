import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS } from '../lib/constants';

const CATEGORIES = [
  { icon: 'flash', label: 'Daily Puzzle', sub: 'One new puzzle every day' },
  { icon: 'flame', label: 'Punish Lines', sub: 'Highest CP-gain traps & wins' },
  { icon: 'git-branch', label: 'Patterns', sub: 'Fork, pin, skewer, discovered attack' },
  { icon: 'trophy', label: 'Endgame', sub: 'King+pawn, rook, queen techniques' },
];

export function PuzzlesScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.heading}>Puzzles</Text>
      <Text style={styles.sub}>Train your tactical eye</Text>

      <View style={styles.list}>
        {CATEGORIES.map(c => (
          <View key={c.label} style={styles.row}>
            <View style={styles.iconBox}>
              <Ionicons name={c.icon as any} size={20} color={COLORS.accent} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>{c.label}</Text>
              <Text style={styles.rowSub}>{c.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textDim} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bgBase, paddingHorizontal: 20 },
  heading: { fontSize: 28, fontWeight: FONT.bold, color: COLORS.text, marginBottom: 4 },
  sub: { fontSize: 14, color: COLORS.textMuted, marginBottom: 28 },
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 14,
  },
  iconBox: {
    width: 44, height: 44, borderRadius: RADIUS.md,
    backgroundColor: COLORS.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: FONT.semibold, color: COLORS.text, marginBottom: 2 },
  rowSub: { fontSize: 12, color: COLORS.textMuted },
});
