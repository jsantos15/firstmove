// ─── Opening Types ────────────────────────────────────────────────────────────

export type OpeningColor = 'white' | 'black';
export type OpeningDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface OpeningMove {
  san: string; // Standard Algebraic Notation e.g. "e4"
  fen: string; // Board state after this move
  annotation?: string; // Optional explanation for this move
}

export interface OpeningVariation {
  id: string;
  name: string;
  moves: OpeningMove[];
  description?: string;
}

export interface Opening {
  id: string;
  ecoCode: string; // e.g. "B20"
  name: string; // e.g. "Sicilian Defense"
  color: OpeningColor;
  difficulty: OpeningDifficulty;
  description: string;
  moves: OpeningMove[]; // Main line
  variations: OpeningVariation[];
  tags: string[];
}

// ─── User Progress Types ──────────────────────────────────────────────────────

export type MasteryLevel = 'new' | 'learning' | 'familiar' | 'mastered';

export interface UserProgress {
  userId: string;
  openingId: string;
  timesPracticed: number;
  successRate: number; // 0–100
  masteryLevel: MasteryLevel;
  lastPracticedAt: string; // ISO date string
}

// ─── Repertoire Types ─────────────────────────────────────────────────────────

export interface Repertoire {
  id: string;
  userId: string;
  name: string;
  description?: string;
  openingIds: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Game / Board Types ───────────────────────────────────────────────────────

export interface BoardPosition {
  fen: string;
  moveNumber: number;
  lastMove?: {
    from: string;
    to: string;
    san: string;
  };
}

export interface PracticeSession {
  openingId: string;
  variationId?: string;
  moves: OpeningMove[];
  currentMoveIndex: number;
  isComplete: boolean;
  errors: number;
}

// Coach event types ----------------------------------------------------------

export type CoachDomain = 'opening_practice' | 'game_analysis' | 'tactics' | 'endgame';

export type CoachClassification =
  | 'brilliant'
  | 'great'
  | 'book'
  | 'setup'
  | 'forcing'
  | 'payoff'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'miss'
  | 'wrong'
  | 'complete';

export type CoachTone = 'neutral' | 'positive' | 'payoff' | 'warning' | 'negative' | 'complete';

export type CoachSeverity = 'info' | 'minor' | 'medium' | 'major' | 'critical';

export type CoachGamePhase = 'opening' | 'middlegame' | 'endgame';

export type CoachEventType =
  | 'opening_book_move'
  | 'opening_setup'
  | 'opening_forcing'
  | 'tactical_payoff'
  | 'wrong_move'
  | 'line_complete'
  | 'eval_gain'
  | 'eval_loss'
  | 'missed_tactic'
  | 'best_move'
  | 'only_move';

export type CoachThemeTag =
  | 'development'
  | 'center'
  | 'king_safety'
  | 'initiative'
  | 'tempo'
  | 'material'
  | 'pawn_structure'
  | 'piece_activity'
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'discovered_attack'
  | 'mate_threat'
  | 'defense'
  | 'endgame_conversion';

export type CoachEventVariableValue = string | number | boolean | null;
export type CoachEventVariables = Record<string, CoachEventVariableValue>;
export type CoachAnalysisFacts = Record<
  string,
  CoachEventVariableValue | CoachEventVariableValue[]
>;

export interface CoachSubjectRef {
  kind: 'opening_line' | 'game' | 'position' | 'session';
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
  phase?: CoachGamePhase;
  themeTags: CoachThemeTag[];
  messageKey: string;
  spokenKey: string;
  variables: CoachEventVariables;
  analysisFacts: CoachAnalysisFacts;
  source: 'opening_practice' | 'engine_analysis' | 'tactical_detector' | 'manual';
  contentVersion: number;
}
