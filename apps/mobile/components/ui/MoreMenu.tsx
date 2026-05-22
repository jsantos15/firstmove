import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT, RADIUS } from '../../lib/constants';

interface MenuItem {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  sub?: string;
  badge?: string;
  onPress: () => void;
}

interface MoreMenuProps {
  visible: boolean;
  onClose: () => void;
}

export function MoreMenu({ visible, onClose }: MoreMenuProps) {
  const insets = useSafeAreaInsets();

  const items: MenuItem[] = [
    {
      icon: 'person-outline',
      label: 'My Profile',
      sub: 'Stats, progress and account',
      onPress: onClose,
    },
    {
      icon: 'shield-checkmark-outline',
      label: 'Sparring',
      sub: 'Test your skills — coming in v2',
      badge: 'Soon',
      onPress: onClose,
    },
    {
      icon: 'people-outline',
      label: 'Community',
      sub: 'Puzzles, comments, debates',
      badge: 'Soon',
      onPress: onClose,
    },
    {
      icon: 'settings-outline',
      label: 'Settings',
      sub: 'Board theme, piece set, notifications',
      onPress: onClose,
    },
    {
      icon: 'star-outline',
      label: 'Rate FirstMove',
      sub: 'Enjoying the app? Leave a review',
      onPress: onClose,
    },
    {
      icon: 'help-circle-outline',
      label: 'Help & Support',
      onPress: onClose,
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Dim overlay — tap to close */}
      <Pressable style={styles.overlay} onPress={onClose} />

      {/* Sheet */}
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        {/* Handle */}
        <View style={styles.handle} />

        <Text style={styles.sheetTitle}>More</Text>

        {items.map(item => (
          <TouchableOpacity
            key={item.label}
            style={styles.menuRow}
            activeOpacity={0.75}
            onPress={() => { item.onPress(); }}
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    paddingTop: 12,
    paddingHorizontal: 20,
    gap: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: FONT.bold,
    color: COLORS.text,
    marginBottom: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
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
