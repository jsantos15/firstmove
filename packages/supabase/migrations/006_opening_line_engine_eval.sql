-- Migration 006: Opening line engine evaluation metadata
-- Stores final Stockfish evaluations for generated opening lines so the app can
-- render a standard evaluation bar beside the practice board.

alter table public.opening_lines
  add column if not exists final_eval_cp integer,
  add column if not exists final_eval_perspective opening_color,
  add column if not exists engine_checked boolean not null default false;

create index if not exists opening_lines_final_eval_idx
  on public.opening_lines (opening_slug, final_eval_cp);
