import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configureSupabase } from '@firstmove/supabase';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from './navigation';

configureSupabase({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar style="light" />
          <RootNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
