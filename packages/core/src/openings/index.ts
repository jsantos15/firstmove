import { Chess } from 'chess.js';
import type { Opening, OpeningMove, OpeningVariation } from '../types';
import { OPENING_DEFINITIONS } from './data';

export type { OpeningDefinition, OpeningLineDefinition } from './data';

// ─── Build Full Opening Objects ───────────────────────────────────────────────
// Computes FENs from SAN arrays using chess.js so source data stays clean.

function buildMoves(sans: string[]): OpeningMove[] {
  const chess = new Chess();
  const moves: OpeningMove[] = [];
  for (const san of sans) {
    const result = chess.move(san);
    if (!result) break;
    moves.push({ san: result.san, fen: chess.fen() });
  }
  return moves;
}

function buildVariation(def: import('./data').OpeningLineDefinition): OpeningVariation {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    moves: buildMoves(def.sans),
  };
}

export const OPENINGS: Opening[] = OPENING_DEFINITIONS.map(def => ({
  id: def.id,
  ecoCode: def.ecoCode,
  name: def.name,
  color: def.color,
  difficulty: def.difficulty,
  description: def.description,
  moves: buildMoves(def.mainLine.sans),
  variations: [
    buildVariation(def.mainLine),
    ...def.variations.map(buildVariation),
  ],
  tags: def.tags,
}));

// ─── Lookup Helpers ───────────────────────────────────────────────────────────

export function getOpeningById(id: string): Opening | undefined {
  return OPENINGS.find(o => o.id === id);
}

export function getOpeningByEco(ecoCode: string): Opening | undefined {
  return OPENINGS.find(o => o.ecoCode === ecoCode);
}

export function getOpeningsByColor(color: 'white' | 'black'): Opening[] {
  return OPENINGS.filter(o => o.color === color);
}

export function getOpeningsByDifficulty(difficulty: Opening['difficulty']): Opening[] {
  return OPENINGS.filter(o => o.difficulty === difficulty);
}

export function searchOpenings(query: string): Opening[] {
  const q = query.toLowerCase();
  return OPENINGS.filter(
    o =>
      o.name.toLowerCase().includes(q) ||
      o.ecoCode.toLowerCase().includes(q) ||
      o.tags.some(tag => tag.includes(q))
  );
}

export function getCharacteristicFen(opening: Opening): string {
  const lastMove = opening.moves[opening.moves.length - 1];
  return lastMove?.fen ?? 'start';
}
