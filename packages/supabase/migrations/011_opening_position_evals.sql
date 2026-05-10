-- Migration 011: Opening position eval cache
-- Stores the best-known engine move per normalized position so generation,
-- branch work, and future analysis can reuse/refine high-quality evals.

create table if not exists public.opening_position_evals (
  position_key text primary key,
  fen text not null,
  provider text not null,
  source text not null,
  engine_model text,
  depth integer,
  multipv integer,
  best_move_uci text not null,
  ponder_uci text,
  score_type text,
  score_value integer,
  white_score_value integer,
  line_count integer not null default 0,
  quality jsonb not null default '{}'::jsonb,
  lines jsonb not null default '[]'::jsonb,
  raw_eval jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opening_position_evals_provider_idx
  on public.opening_position_evals (provider);

create index if not exists opening_position_evals_depth_idx
  on public.opening_position_evals (depth);

drop trigger if exists opening_position_evals_updated_at on public.opening_position_evals;
create trigger opening_position_evals_updated_at
  before update on public.opening_position_evals
  for each row execute procedure public.handle_updated_at();

alter table public.opening_position_evals enable row level security;

drop policy if exists "Opening position evals are readable by everyone" on public.opening_position_evals;
create policy "Opening position evals are readable by everyone"
  on public.opening_position_evals for select using (true);

notify pgrst, 'reload schema';
