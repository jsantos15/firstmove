import { useState } from 'react';
import { StyleSheet, TouchableOpacity, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeScreen } from '../screens/HomeScreen';
import { OpeningsStack } from './OpeningsStack';
import { TrainStack } from './TrainStack';
import { MoreScreen } from '../screens/MoreScreen';
import { ProfileSheet } from '../components/ui/ProfileSheet';
import { COLORS, FONT } from '../lib/constants';
import { ProfileVisibilityProvider, useProfileVisible } from '../lib/profileVisibility';
import type { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<keyof RootTabParamList, { active: IoniconName; inactive: IoniconName }> = {
  Home:     { active: 'home',             inactive: 'home-outline' },
  Openings: { active: 'book',             inactive: 'book-outline' },
  Train:    { active: 'extension-puzzle', inactive: 'extension-puzzle-outline' },
  More:     { active: 'menu',             inactive: 'menu-outline' },
};

// Inner component lives inside the ProfileVisibilityProvider so the hook works
function NavigatorContent() {
  const insets = useSafeAreaInsets();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileVisible = useProfileVisible();

  return (
    <View style={StyleSheet.absoluteFill}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => {
            const icons = TAB_ICONS[route.name as keyof RootTabParamList];
            return (
              <Ionicons
                name={focused ? icons.active : icons.inactive}
                size={size}
                color={color}
              />
            );
          },
          tabBarActiveTintColor: COLORS.accent,
          tabBarInactiveTintColor: COLORS.textDim,
          tabBarStyle: {
            backgroundColor: '#0a0c11',
            borderTopWidth: 1,
            borderTopColor: COLORS.border,
            paddingTop: 10,
            paddingBottom: insets.bottom + 20,
            height: 51 + insets.bottom + 20,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: FONT.semibold,
            letterSpacing: 0.2,
          },
        })}
      >
        <Tab.Screen name="Home"     component={HomeScreen}    options={{ tabBarLabel: 'Home' }} />
        <Tab.Screen name="Openings" component={OpeningsStack} options={{ tabBarLabel: 'Openings' }} />
        <Tab.Screen name="Train"    component={TrainStack}    options={{ tabBarLabel: 'Train' }} />
        <Tab.Screen name="More"     component={MoreScreen}    options={{ tabBarLabel: 'More' }} />
      </Tab.Navigator>

      {profileVisible && (
        <TouchableOpacity
          style={[styles.profileButton, { top: insets.top + 18 }]}
          activeOpacity={0.8}
          onPress={() => setProfileOpen(true)}
        >
          <Text style={styles.profileInitial}>J</Text>
        </TouchableOpacity>
      )}

      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </View>
  );
}

export function RootNavigator() {
  return (
    <ProfileVisibilityProvider>
      <NavigatorContent />
    </ProfileVisibilityProvider>
  );
}

const styles = StyleSheet.create({
  profileButton: {
    position: 'absolute',
    right: 20,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.accentDim,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  profileInitial: {
    fontSize: 16,
    fontWeight: FONT.bold,
    color: COLORS.accent,
  },
});
