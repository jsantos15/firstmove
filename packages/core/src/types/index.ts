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
