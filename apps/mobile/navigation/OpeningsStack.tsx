import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OpeningLibraryScreen } from '../screens/LearnScreen';
import { OpeningDetailScreen } from '../screens/OpeningDetailScreen';
import type { OpeningsStackParamList } from './types';

const Stack = createNativeStackNavigator<OpeningsStackParamList>();

export function OpeningsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="OpeningLibrary" component={OpeningLibraryScreen} />
      <Stack.Screen name="OpeningDetail"  component={OpeningDetailScreen} />
    </Stack.Navigator>
  );
}
