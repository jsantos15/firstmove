import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { HomeScreen } from '../screens/HomeScreen';
import { LearnScreen } from '../screens/LearnScreen';
import { AnalysisScreen } from '../screens/AnalysisScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { COLORS, FONT } from '../lib/constants';
import type { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.45 }}>{icon}</Text>
  );
}

export function RootNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.bgBase,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.textDim,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: FONT.semibold,
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="⌂" focused={focused} />,
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen
        name="Learn"
        component={LearnScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="♟" focused={focused} />,
          tabBarLabel: 'Learn',
        }}
      />
      <Tab.Screen
        name="Analysis"
        component={AnalysisScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="📈" focused={focused} />,
          tabBarLabel: 'Analysis',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="◉" focused={focused} />,
          tabBarLabel: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
}
