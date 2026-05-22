import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

// ─── Tab Navigator ────────────────────────────────────────────────────────────

export type RootTabParamList = {
  Home: undefined;
  Learn: undefined;
  Analysis: undefined;
  Profile: undefined;
  More: undefined;
};

// ─── Learn Stack ──────────────────────────────────────────────────────────────

export type LearnStackParamList = {
  LearnHub: undefined;
  OpeningLibrary: undefined;
  OpeningDetail: { openingSlug: string };
  Practice: { openingSlug: string; variationId: string; mode: 'learn' | 'practice' };
};

// ─── Screen prop helpers ──────────────────────────────────────────────────────

export type HomeScreenProps = BottomTabScreenProps<RootTabParamList, 'Home'>;
export type LearnScreenProps = BottomTabScreenProps<RootTabParamList, 'Learn'>;
export type AnalysisScreenProps = BottomTabScreenProps<RootTabParamList, 'Analysis'>;
export type ProfileScreenProps = BottomTabScreenProps<RootTabParamList, 'Profile'>;

export type LearnHubScreenProps = CompositeScreenProps<
  NativeStackScreenProps<LearnStackParamList, 'LearnHub'>,
  BottomTabScreenProps<RootTabParamList>
>;

export type OpeningDetailScreenProps = NativeStackScreenProps<LearnStackParamList, 'OpeningDetail'>;
export type PracticeScreenProps = NativeStackScreenProps<LearnStackParamList, 'Practice'>;
