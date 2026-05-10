-- Migration 012: Opening line practical branch metadata
-- Keeps practical branch lines in opening_lines while storing branch-specific
-- selection, popularity, and continuation trace data in a sidecar table.

alter table public.opening_lines
  add column if not exists line_kind text not null default 'reference';

alter table public.opening_lines
  drop constraint if exists opening_lines_line_kind_check;

alter table public.opening_lines
  add constraint opening_lines_line_kind_check
  check (line_kind in ('reference', 'practical_branch'));

create index if not exists opening_lines_line_kind_idx
  on public.opening_lines (opening_slug, line_kind, sort_order);

create table if not exists public.opening_line_branch_metadata (
  opening_slug text not null,
  line_slug text not null,
  parent_opening_slug text not null,
  parent_line_slug text not null,
  branch_key text not null unique,
  lesson_title text,
  theme_tags text[] not null default '{}',
  advantage_type text,
  branch_score numeric,
  branch_stem_ply integer not null,
  branch_stem_fen text not null,
  trigger_ply integer not null,
  trigger_move_san text not null,
  trigger_move_uci text not null,
  reference_move_san text,
  reference_move_uci text,
  trigger_node_games integer,
  trigger_move_games integer,
  trigger_move_play_rate numeric,
  trigger_cumulative_play_rate numeric,
  eval_before_trigger_cp integer,
  eval_after_trigger_cp integer,
  final_trained_eval_cp integer,
  eval_gain_cp integer,
  continuation_trace jsonb not null default '[]'::jsonb,
  selection_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (opening_slug, line_slug),
  foreign key (opening_slug, line_slug)
    references public.opening_lines(opening_slug, slug)
    on delete cascade,
  foreign key (parent_opening_slug, parent_line_slug)
    references public.opening_lines(opening_slug, slug)
    on delete cascade
);

create index if not exists opening_line_branch_metadata_parent_idx
  on public.opening_line_branch_metadata (parent_opening_slug, parent_line_slug);

create index if not exists opening_line_branch_metadata_score_idx
  on public.opening_line_branch_metadata (opening_slug, branch_score desc);

drop trigger if exists opening_line_branch_metadata_updated_at
  on public.opening_line_branch_metadata;
create trigger opening_line_branch_metadata_updated_at
  before update on public.opening_line_branch_metadata
  for each row execute procedure public.handle_updated_at();

alter table public.opening_line_branch_metadata enable row level security;

drop policy if exists "Opening branch metadata is readable by everyone"
  on public.opening_line_branch_metadata;
create policy "Opening branch metadata is readable by everyone"
  on public.opening_line_branch_metadata for select using (true);

notify pgrst, 'reload schema';
