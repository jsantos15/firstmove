import { useState } from 'react';
import { TouchableOpacity, StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { HomeScreen } from '../screens/HomeScreen';
import { LearnScreen } from '../screens/LearnScreen';
import { AnalysisScreen } from '../screens/AnalysisScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { MoreMenu } from '../components/ui/MoreMenu';
import { COLORS, FONT } from '../lib/constants';
import type { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Partial<Record<keyof RootTabParamList, { active: IoniconName; inactive: IoniconName }>> = {
  Home:     { active: 'home',               inactive: 'home-outline' },
  Learn:    { active: 'book',               inactive: 'book-outline' },
  Analysis: { active: 'stats-chart',        inactive: 'stats-chart-outline' },
  Profile:  { active: 'person',             inactive: 'person-outline' },
};

// Dummy screen — never actually rendered because More intercepts the press
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

          tabBarStyle: {
            backgroundColor: '#0a0c11',
            borderTopWidth: 1,
            borderTopColor: COLORS.border,
            height: 62,
            paddingBottom: 10,
            paddingTop: 8,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: FONT.semibold,
            letterSpacing: 0.2,
          },
          tabBarIconStyle: {
            marginBottom: -2,
          },
        })}
      >
        <Tab.Screen name="Home"     component={HomeScreen}     options={{ tabBarLabel: 'Home' }} />
        <Tab.Screen name="Learn"    component={LearnScreen}    options={{ tabBarLabel: 'Learn' }} />
        <Tab.Screen name="Analysis" component={AnalysisScreen} options={{ tabBarLabel: 'Analysis' }} />
        <Tab.Screen name="Profile"  component={ProfileScreen}  options={{ tabBarLabel: 'Profile' }} />

        {/* 5th item — intercepts press, opens menu instead of navigating */}
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
                <View style={styles.moreIconWrap}>
                  <Ionicons
                    name="ellipsis-horizontal"
                    size={22}
                    color={COLORS.textDim}
                  />
                </View>
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
    paddingBottom: 10,
    paddingTop: 8,
    gap: 2,
  },
  moreIconWrap: {
    marginBottom: -2,
  },
  moreLabel: {
    fontSize: 10,
    fontWeight: FONT.semibold,
    color: COLORS.textDim,
    letterSpacing: 0.2,
  },
});
