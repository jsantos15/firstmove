import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PuzzlesScreen } from '../screens/PuzzlesScreen';
import { OpeningTrackScreen } from '../screens/OpeningTrackScreen';
import type { TrainStackParamList } from './types';

const Stack = createNativeStackNavigator<TrainStackParamList>();

export function TrainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="TrainHome" component={PuzzlesScreen} />
      <Stack.Screen name="OpeningTrack" component={OpeningTrackScreen} />
    </Stack.Navigator>
  );
}
