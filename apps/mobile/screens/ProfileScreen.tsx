import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT, RADIUS } from '../lib/constants';

const STATS = [
  { label: 'Streak', value: '14 days' },
  { label: 'Openings', value: '6' },
  { label: 'Puzzles', value: '48' },
];

export function ProfileScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
      {/* Avatar + name */}
      <View style={styles.avatarRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>J</Text>
        </View>
        <View>
          <Text style={styles.name}>Jorge</Text>
          <Text style={styles.level}>Casual player · 800–1200</Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        {STATS.map(s => (
          <View key={s.label} style={styles.statBox}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Settings rows */}
      {['Board settings', 'Notifications', 'Subscription', 'Sign out'].map(item => (
        <TouchableOpacity key={item} style={styles.settingRow} activeOpacity={0.85}>
          <Text style={[styles.settingLabel, item === 'Sign out' && styles.signOut]}>
            {item}
          </Text>
          {item !== 'Sign out' && <Text style={styles.chevron}>›</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bgBase,
    paddingHorizontal: 20,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.accentDim,
    borderWidth: 2,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: FONT.bold,
    color: COLORS.accent,
  },
  name: {
    fontSize: 20,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  level: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 15,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: FONT.medium,
    color: COLORS.text,
  },
  signOut: {
    color: COLORS.error,
  },
  chevron: {
    fontSize: 20,
    color: COLORS.textDim,
  },
});
