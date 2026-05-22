import { useState } from 'react';
import { TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { HomeScreen } from '../screens/HomeScreen';
import { OpeningsStack } from './OpeningsStack';
import { PuzzlesScreen } from '../screens/PuzzlesScreen';
import { NewsScreen } from '../screens/NewsScreen';
import { MoreMenu } from '../components/ui/MoreMenu';
import { COLORS, FONT } from '../lib/constants';
import type { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<keyof RootTabParamList, { active: IoniconName; inactive: IoniconName }> = {
  Home:     { active: 'home',      inactive: 'home-outline' },
  Openings: { active: 'book',      inactive: 'book-outline' },
  Puzzles:  { active: 'flash',     inactive: 'flash-outline' },
  News:     { active: 'newspaper', inactive: 'newspaper-outline' },
  More:     { active: 'menu',      inactive: 'menu-outline' },
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
            paddingBottom: 20,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: FONT.semibold,
            letterSpacing: 0.2,
          },
        })}
      >
        <Tab.Screen name="Home"     component={HomeScreen}   options={{ tabBarLabel: 'Home' }} />
        <Tab.Screen name="Openings" component={OpeningsStack} options={{ tabBarLabel: 'Openings' }} />
        <Tab.Screen name="Puzzles"  component={PuzzlesScreen} options={{ tabBarLabel: 'Puzzles' }} />
        <Tab.Screen name="News"     component={NewsScreen}    options={{ tabBarLabel: 'News' }} />

        {/* Hamburger — pass children through so RN renders icon+label identically to other tabs */}
        <Tab.Screen
          name="More"
          component={NullScreen}
          options={{
            tabBarLabel: 'More',
            tabBarButton: ({ children, style, accessibilityRole, accessibilityState, testID }) => (
              <TouchableOpacity
                style={style}
                accessibilityRole={accessibilityRole}
                accessibilityState={accessibilityState}
                testID={testID}
                activeOpacity={0.7}
                onPress={() => setMenuOpen(true)}
                accessibilityLabel="More options"
              >
                {children}
              </TouchableOpacity>
            ),
          }}
        />
      </Tab.Navigator>

      <MoreMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
