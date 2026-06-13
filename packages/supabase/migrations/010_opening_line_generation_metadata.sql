-- Migration 010: Opening line generation metadata
-- Stores the engine source used for generated reference continuations plus
-- compact generation diagnostics for import verification and future audits.

alter table public.opening_lines
  add column if not exists engine_provider text,
  add column if not exists engine_model text,
  add column if not exists avg_engine_depth numeric,
  add column if not exists generation_metadata jsonb not null default '{}'::jsonb;

create index if not exists opening_lines_engine_provider_idx
  on public.opening_lines (opening_slug, engine_provider);

notify pgrst, 'reload schema';
