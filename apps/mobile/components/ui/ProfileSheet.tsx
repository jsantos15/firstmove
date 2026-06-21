import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS } from '../../lib/constants';

interface ProfileSheetProps {
  visible: boolean;
  onClose: () => void;
}

const MOCK_OPENINGS_STATS = [
  { label: 'Learned',   value: 1, color: COLORS.accent },
  { label: 'Completed', value: 0, color: '#60a5fa' },
  { label: 'Mastered',  value: 0, color: COLORS.success },
];

const MENU_ITEMS = [
  { icon: 'settings-outline',      label: 'Settings'         },
  { icon: 'star-outline',          label: 'Rate FirstMove'   },
  { icon: 'help-circle-outline',   label: 'Help & Support'   },
] as const;

export function ProfileSheet({ visible, onClose }: ProfileSheetProps) {
  const insets = useSafeAreaInsets();

  const slideAnim = useRef(new Animated.Value(700)).current;
  const [modalVisible, setModalVisible] = useState(false);
  const dismissingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      dismissingRef.current = false;
      setModalVisible(true);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
        speed: 14,
      }).start();
    } else if (!dismissingRef.current) {
      Animated.timing(slideAnim, {
        toValue: 700,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setModalVisible(false));
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, { dy }) => dy > 4,
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) slideAnim.setValue(dy);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > 80 || vy > 0.4) {
          dismissingRef.current = true;
          Animated.timing(slideAnim, {
            toValue: 700,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setModalVisible(false);
            onClose();
          });
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
            speed: 14,
          }).start();
        }
      },
    })
  ).current;

  const overlayOpacity = slideAnim.interpolate({
    inputRange: [0, 700],
    outputRange: [1, 0],
  });

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Dim overlay — absolute so it doesn't affect column flow */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}>
        <Pressable style={styles.overlayFill} onPress={onClose} />
      </Animated.View>

      {/* Container pushes sheet to bottom of screen */}
      <View style={styles.sheetContainer} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 20, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Drag handle */}
        <View style={styles.dragArea} {...panResponder.panHandlers}>
          <View style={styles.handle} />
        </View>

        {/* Avatar + identity */}
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>J</Text>
          </View>
          <View style={styles.identityText}>
            <Text style={styles.displayName}>Jorge Santos</Text>
            <Text style={styles.email}>jesntcruz@gmail.com</Text>
            <Text style={styles.memberSince}>Member since May 2025</Text>
          </View>
        </View>

        {/* Openings progress */}
        <View style={styles.statsCard}>
          <Text style={styles.statsCardLabel}>Openings</Text>
          <View style={styles.statsRow}>
            {MOCK_OPENINGS_STATS.map(s => (
              <View key={s.label} style={styles.statBox}>
                <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Menu items */}
        <View style={styles.menuSection}>
          {MENU_ITEMS.map(item => (
            <TouchableOpacity
              key={item.label}
              style={styles.menuRow}
              activeOpacity={0.75}
              onPress={onClose}
            >
              <Ionicons name={item.icon} size={18} color={COLORS.textMuted} style={styles.menuIcon} />
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={14} color={COLORS.textDim} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutRow} activeOpacity={0.75} onPress={onClose}>
          <Ionicons name="log-out-outline" size={18} color={COLORS.error} style={styles.menuIcon} />
          <Text style={styles.signOutLabel}>Sign Out</Text>
        </TouchableOpacity>
      </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayFill: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheetContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 20,
  },
  dragArea: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
  },

  // Identity
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
    marginBottom: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accentDim,
    borderWidth: 2,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 22,
    fontWeight: FONT.bold,
    color: COLORS.accent,
  },
  identityText: { flex: 1, gap: 2 },
  displayName: { fontSize: 16, fontWeight: FONT.bold, color: COLORS.text },
  email: { fontSize: 12, color: COLORS.textMuted },
  memberSince: { fontSize: 11, color: COLORS.textDim, marginTop: 2 },

  // Stats
  statsCard: {
    backgroundColor: COLORS.bgBase,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  statsCardLabel: {
    fontSize: 11,
    fontWeight: FONT.semibold,
    color: COLORS.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statsRow: { flexDirection: 'row' },
  statBox: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
    borderRightWidth: 1,
    borderRightColor: COLORS.borderSubtle,
  },
  statValue: { fontSize: 24, fontWeight: FONT.bold },
  statLabel: { fontSize: 11, color: COLORS.textDim },

  // Menu
  menuSection: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.bgBase,
    overflow: 'hidden',
    marginBottom: 10,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  menuIcon: { marginRight: 12 },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: FONT.medium, color: COLORS.text },

  // Sign out
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.bgBase,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  signOutLabel: { fontSize: 14, fontWeight: FONT.medium, color: COLORS.error },
});
