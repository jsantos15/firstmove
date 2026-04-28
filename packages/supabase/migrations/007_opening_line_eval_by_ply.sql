-- Migration 007: Per-ply opening line evaluations
-- Stores Stockfish centipawn evaluations from White's perspective for each
-- board position in a line. Index 0 is the starting position; index N is after
-- N SAN moves.

alter table public.opening_lines
  add column if not exists eval_cp_by_ply integer[];
