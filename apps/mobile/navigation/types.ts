import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

// ─── Tab Navigator ────────────────────────────────────────────────────────────

export type RootTabParamList = {
  Home: undefined;
  Openings: undefined;
  Puzzles: undefined;
  News: undefined;
  More: undefined;
};

// ─── Openings Stack ───────────────────────────────────────────────────────────

export type OpeningsStackParamList = {
  OpeningLibrary: undefined;
  OpeningDetail: { openingSlug: string };
  Practice: { openingSlug: string; variationId: string; mode: 'learn' | 'practice' };
};

// ─── Screen prop helpers ──────────────────────────────────────────────────────

export type HomeScreenProps = BottomTabScreenProps<RootTabParamList, 'Home'>;
export type OpeningsScreenProps = BottomTabScreenProps<RootTabParamList, 'Openings'>;
export type PuzzlesScreenProps = BottomTabScreenProps<RootTabParamList, 'Puzzles'>;
export type NewsScreenProps = BottomTabScreenProps<RootTabParamList, 'News'>;

export type OpeningDetailScreenProps = CompositeScreenProps<
  NativeStackScreenProps<OpeningsStackParamList, 'OpeningDetail'>,
  BottomTabScreenProps<RootTabParamList>
>;

export type PracticeScreenProps = NativeStackScreenProps<OpeningsStackParamList, 'Practice'>;
