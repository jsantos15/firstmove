export const COACH_DOMAINS = ['opening_practice', 'game_analysis', 'tactics', 'endgame'] as const;

export const COACH_PERSONAS = [
  'friendly',
  'neutral',
  'strict',
  'calm',
  'hype',
  'beginner',
  'technical',
] as const;

export const COACH_CLASSIFICATIONS = [
  'brilliant',
  'great',
  'book',
  'setup',
  'forcing',
  'payoff',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
  'miss',
  'wrong',
  'complete',
] as const;

export const COACH_TONES = [
  'neutral',
  'positive',
  'payoff',
  'warning',
  'negative',
  'complete',
] as const;

export const COACH_SEVERITIES = ['info', 'minor', 'medium', 'major', 'critical'] as const;

export const COACH_GAME_PHASES = ['opening', 'middlegame', 'endgame'] as const;

export const COACH_EVENT_TYPES = [
  'opening_book_move',
  'opening_setup',
  'opening_forcing',
  'tactical_payoff',
  'wrong_move',
  'line_complete',
  'eval_gain',
  'eval_loss',
  'missed_tactic',
  'best_move',
  'only_move',
] as const;

export const COACH_THEME_TAGS = [
  'development',
  'center',
  'king_safety',
  'initiative',
  'tempo',
  'material',
  'pawn_structure',
  'piece_activity',
  'fork',
  'pin',
  'skewer',
  'discovered_attack',
  'mate_threat',
  'defense',
  'endgame_conversion',
] as const;

export const COACH_SUBJECT_KINDS = ['opening_line', 'game', 'position', 'session'] as const;

export const COACH_EVENT_SOURCES = [
  'opening_practice',
  'engine_analysis',
  'tactical_detector',
  'manual',
] as const;

export type CoachDomain = (typeof COACH_DOMAINS)[number];
export type CoachPersona = (typeof COACH_PERSONAS)[number];
export type CoachClassification = (typeof COACH_CLASSIFICATIONS)[number];
export type CoachTone = (typeof COACH_TONES)[number];
export type CoachSeverity = (typeof COACH_SEVERITIES)[number];
export type CoachGamePhase = (typeof COACH_GAME_PHASES)[number];
export type CoachEventType = (typeof COACH_EVENT_TYPES)[number];
export type CoachThemeTag = (typeof COACH_THEME_TAGS)[number];
export type CoachSubjectKind = (typeof COACH_SUBJECT_KINDS)[number];
export type CoachEventSource = (typeof COACH_EVENT_SOURCES)[number];

export type CoachEventVariableValue = string | number | boolean | null;
export type CoachEventVariables = Record<string, CoachEventVariableValue>;
export type CoachAnalysisFacts = Record<
  string,
  CoachEventVariableValue | CoachEventVariableValue[]
>;

export interface CoachSubjectRef {
  kind: CoachSubjectKind;
  id: string;
  parentId?: string;
}

export interface CoachEvent {
  id: string;
  domain: CoachDomain;
  subject: CoachSubjectRef;
  plyIndex: number;
  eventType: CoachEventType;
  classification: CoachClassification;
  tone: CoachTone;
  severity: CoachSeverity;
  persona?: CoachPersona;
  phase?: CoachGamePhase;
  themeTags: CoachThemeTag[];
  messageKey: string;
  spokenKey: string;
  variables: CoachEventVariables;
  analysisFacts: CoachAnalysisFacts;
  source: CoachEventSource;
  contentVersion: number;
}

export function getCoachEventMessageFallbacks(
  eventType: CoachEventType,
  persona: CoachPersona = 'neutral'
) {
  return [
    `coach.persona.${persona}.event.${eventType}.message`,
    `coach.event.${eventType}.message`,
    `coach.event.generic.message`,
  ] as const;
}

export function getCoachEventSpokenFallbacks(
  eventType: CoachEventType,
  persona: CoachPersona = 'neutral'
) {
  return [
    `coach.persona.${persona}.spoken.${eventType}`,
    `coach.persona.${persona}.spoken.event`,
    eventType === 'wrong_move' ? 'coach.spoken.wrong_move' : 'coach.spoken.event',
  ] as const;
}

export * from './analysis';
export * from './gameAnalysis';
export * from './openingPractice';
