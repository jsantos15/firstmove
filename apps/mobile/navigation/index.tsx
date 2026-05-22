import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { HomeScreen } from '../screens/HomeScreen';
import { LearnScreen } from '../screens/LearnScreen';
import { PuzzlesScreen } from '../screens/PuzzlesScreen';
import { NewsScreen } from '../screens/NewsScreen';
import { MoreMenu } from '../components/ui/MoreMenu';
import { COLORS, FONT } from '../lib/constants';
import type { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Partial<Record<keyof RootTabParamList, { active: IoniconName; inactive: IoniconName }>> = {
  Home:     { active: 'home',           inactive: 'home-outline' },
  Openings: { active: 'book',           inactive: 'book-outline' },
  Puzzles:  { active: 'flash',          inactive: 'flash-outline' },
  News:     { active: 'newspaper',      inactive: 'newspaper-outline' },
};

function NullScreen() { return null; }

export function RootNavigator() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => {
            const icons = TAB_ICONS[route.name as keyof RootTabParamList];
            if (!icons) return null;
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
          // No fixed height — React Navigation + SafeAreaProvider automatically
          // place the bar above the Android system navigation buttons
          tabBarStyle: {
            backgroundColor: '#0a0c11',
            borderTopWidth: 1,
            borderTopColor: COLORS.border,
            paddingTop: 10,
            paddingBottom: 6,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: FONT.semibold,
            letterSpacing: 0.2,
          },
        })}
      >
        <Tab.Screen name="Home"     component={HomeScreen}    options={{ tabBarLabel: 'Home' }} />
        <Tab.Screen name="Openings" component={LearnScreen}   options={{ tabBarLabel: 'Openings' }} />
        <Tab.Screen name="Puzzles"  component={PuzzlesScreen} options={{ tabBarLabel: 'Puzzles' }} />
        <Tab.Screen name="News"     component={NewsScreen}    options={{ tabBarLabel: 'News' }} />

        {/* Hamburger — intercepts press, opens slide-up menu */}
        <Tab.Screen
          name="More"
          component={NullScreen}
          options={{
            tabBarLabel: 'More',
            tabBarButton: () => (
              <TouchableOpacity
                style={styles.moreButton}
                activeOpacity={0.7}
                onPress={() => setMenuOpen(true)}
                accessibilityLabel="More options"
              >
                <Ionicons name="menu-outline" size={26} color={COLORS.textDim} />
                <Text style={styles.moreLabel}>More</Text>
              </TouchableOpacity>
            ),
          }}
        />
      </Tab.Navigator>

      <MoreMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  moreButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    gap: 3,
  },
  moreLabel: {
    fontSize: 10,
    fontWeight: FONT.semibold,
    color: COLORS.textDim,
    letterSpacing: 0.2,
  },
});
