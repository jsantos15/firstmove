import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { COLORS, FONT, RADIUS } from '../lib/constants';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MenuItem {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  sub?: string;
  badge?: string;
  onPress: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MoreScreen() {
  const items: MenuItem[] = [
    {
      icon: 'person-outline',
      label: 'My Profile',
      sub: 'Stats, progress and account',
      onPress: () => {},
    },
    {
      icon: 'shield-checkmark-outline',
      label: 'Sparring',
      sub: 'Test your skills — coming in v2',
      badge: 'Soon',
      onPress: () => {},
    },
    {
      icon: 'people-outline',
      label: 'Community',
      sub: 'Puzzles, comments, debates',
      badge: 'Soon',
      onPress: () => {},
    },
    {
      icon: 'settings-outline',
      label: 'Settings',
      sub: 'Board theme, piece set, notifications',
      onPress: () => {},
    },
    {
      icon: 'star-outline',
      label: 'Rate FirstMove',
      sub: 'Enjoying the app? Leave a review',
      onPress: () => {},
    },
    {
      icon: 'help-circle-outline',
      label: 'Help & Support',
      onPress: () => {},
    },
  ];

  return (
    <View style={styles.container}>
      <ScreenHeader title="More" />

      {/* Profile card */}
      <TouchableOpacity style={styles.profileCard} activeOpacity={0.75}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={28} color={COLORS.accent} />
        </View>
        <View style={styles.profileText}>
          <Text style={styles.profileName}>Guest Player</Text>
          <Text style={styles.profileSub}>Sign in to save your progress</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.textDim} />
      </TouchableOpacity>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {items.map((item, index) => (
          <TouchableOpacity
            key={item.label}
            style={[
              styles.menuRow,
              index === items.length - 1 && styles.menuRowLast,
            ]}
            activeOpacity={0.75}
            onPress={item.onPress}
          >
            <View style={styles.menuIconBox}>
              <Ionicons name={item.icon} size={20} color={COLORS.accent} />
            </View>
            <View style={styles.menuText}>
              <Text style={styles.menuLabel}>{item.label}</Text>
              {item.sub && <Text style={styles.menuSub}>{item.sub}</Text>}
            </View>
            {item.badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.badge}</Text>
              </View>
            ) : (
              <Ionicons name="chevron-forward" size={16} color={COLORS.textDim} />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgBase,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 16,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: { flex: 1 },
  profileName: {
    fontSize: 16,
    fontWeight: FONT.semibold,
    color: COLORS.text,
  },
  profileSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  menuRowLast: {
    borderBottomWidth: 0,
  },
  menuIconBox: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: { flex: 1 },
  menuLabel: {
    fontSize: 14,
    fontWeight: FONT.semibold,
    color: COLORS.text,
  },
  menuSub: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  badge: {
    backgroundColor: COLORS.accentDim,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: FONT.bold,
    color: COLORS.accent,
    letterSpacing: 0.3,
  },
});
