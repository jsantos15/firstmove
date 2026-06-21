import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

// ─── Tab Navigator ────────────────────────────────────────────────────────────

export type RootTabParamList = {
  Home: undefined;
  Openings: undefined;
  Train: undefined;
  More: undefined;
};

// ─── Openings Stack ───────────────────────────────────────────────────────────

export type OpeningsStackParamList = {
  OpeningLibrary: undefined;
  OpeningDetail: { openingSlug: string };
  Practice: { openingSlug: string; variationId: string; mode: 'learn' | 'practice' };
};

// ─── Train Stack ─────────────────────────────────────────────────────────────

export type TrainStackParamList = {
  TrainHome: undefined;
  OpeningTrack: { openingSlug: string; openingName: string; openingEco: string };
};

// ─── Screen prop helpers ──────────────────────────────────────────────────────

export type HomeScreenProps = BottomTabScreenProps<RootTabParamList, 'Home'>;
export type OpeningsScreenProps = BottomTabScreenProps<RootTabParamList, 'Openings'>;
export type TrainScreenProps = BottomTabScreenProps<RootTabParamList, 'Train'>;
export type MoreScreenProps = BottomTabScreenProps<RootTabParamList, 'More'>;

export type OpeningDetailScreenProps = CompositeScreenProps<
  NativeStackScreenProps<OpeningsStackParamList, 'OpeningDetail'>,
  BottomTabScreenProps<RootTabParamList>
>;

export type PracticeScreenProps = NativeStackScreenProps<OpeningsStackParamList, 'Practice'>;
