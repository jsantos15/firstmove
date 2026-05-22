import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT, RADIUS } from '../lib/constants';

const SECTIONS = [
  { icon: '♟', label: 'Openings', sub: 'Learn and practice opening lines' },
  { icon: '⚡', label: 'Tactics', sub: 'Puzzles, patterns, punish lines' },
  { icon: '♛', label: 'Endgame', sub: 'Essential endgame techniques' },
];

export function LearnScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.heading}>Learn</Text>
      <Text style={styles.sub}>Choose what to train today</Text>

      <View style={styles.list}>
        {SECTIONS.map(s => (
          <View key={s.label} style={styles.row}>
            <View style={styles.iconBox}>
              <Text style={styles.icon}>{s.icon}</Text>
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>{s.label}</Text>
              <Text style={styles.rowSub}>{s.sub}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bgBase,
    paddingHorizontal: 20,
  },
  heading: {
    fontSize: 28,
    fontWeight: FONT.bold,
    color: COLORS.text,
    marginBottom: 4,
  },
  sub: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 28,
  },
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
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 22 },
  rowText: { flex: 1 },
  rowLabel: {
    fontSize: 15,
    fontWeight: FONT.semibold,
    color: COLORS.text,
    marginBottom: 2,
  },
  rowSub: { fontSize: 12, color: COLORS.textMuted },
  chevron: { fontSize: 22, color: COLORS.textDim },
});
