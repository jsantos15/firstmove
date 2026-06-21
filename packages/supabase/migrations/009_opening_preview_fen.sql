-- Migration 009: Add preview_fen to openings_catalog
-- Used by the opening card thumbnail in the Learn screen.
-- Populated by scripts/fetch-opening-popularity.cjs from the opening's main line.

alter table public.openings_catalog
  add column if not exists preview_fen text;
