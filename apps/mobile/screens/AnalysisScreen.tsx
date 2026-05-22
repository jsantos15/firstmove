import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT, RADIUS } from '../lib/constants';

export function AnalysisScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.heading}>Analysis</Text>
      <Text style={styles.sub}>Import a game and see exactly what you missed</Text>

      <View style={styles.importCard}>
        <Text style={styles.importIcon}>📋</Text>
        <Text style={styles.importTitle}>Paste your game</Text>
        <Text style={styles.importSub}>PGN or FEN format</Text>
        <TouchableOpacity style={styles.importButton} activeOpacity={0.85}>
          <Text style={styles.importButtonText}>Import game</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <Text style={styles.orText}>or</Text>
        <View style={styles.orLine} />
      </View>

      <TouchableOpacity style={styles.platformRow} activeOpacity={0.85}>
        <Text style={styles.platformIcon}>⚡</Text>
        <Text style={styles.platformLabel}>Connect Lichess account</Text>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.platformRow} activeOpacity={0.85}>
        <Text style={styles.platformIcon}>♟</Text>
        <Text style={styles.platformLabel}>Import from Chess.com</Text>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
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
    marginBottom: 24,
  },
  importCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 6,
  },
  importIcon: { fontSize: 36, marginBottom: 4 },
  importTitle: {
    fontSize: 16,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  importSub: { fontSize: 13, color: COLORS.textMuted, marginBottom: 8 },
  importButton: {
    marginTop: 8,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: 11,
    paddingHorizontal: 28,
  },
  importButtonText: {
    fontSize: 14,
    fontWeight: FONT.bold,
    color: COLORS.bgBase,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 20,
  },
  orLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  orText: { fontSize: 12, color: COLORS.textDim },
  platformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 14,
    marginBottom: 10,
  },
  platformIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  platformLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: FONT.medium,
    color: COLORS.text,
  },
  chevron: { fontSize: 20, color: COLORS.textDim },
});
