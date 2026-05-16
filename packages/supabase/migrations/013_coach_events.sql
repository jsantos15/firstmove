-- Store locale-neutral coach events for openings now and game analysis later.
-- Localized display/spoken templates stay in source-controlled @firstmove/i18n files.

create table if not exists public.coach_events (
  id text primary key,
  domain text not null check (
    domain in ('opening_practice', 'game_analysis', 'tactics', 'endgame')
  ),
  subject_kind text not null check (
    subject_kind in ('opening_line', 'game', 'position', 'session')
  ),
  subject_id text not null,
  parent_subject_id text,
  ply_index integer not null check (ply_index >= 0),
  event_type text not null check (
    event_type in (
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
      'only_move'
    )
  ),
  classification text not null check (
    classification in (
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
      'complete'
    )
  ),
  tone text not null check (
    tone in ('neutral', 'positive', 'payoff', 'warning', 'negative', 'complete')
  ),
  persona text not null default 'neutral' check (
    persona in ('friendly', 'neutral', 'strict', 'calm', 'hype', 'beginner', 'technical')
  ),
  severity text not null check (
    severity in ('info', 'minor', 'medium', 'major', 'critical')
  ),
  phase text check (phase in ('opening', 'middlegame', 'endgame')),
  theme_tags text[] not null default '{}',
  message_key text not null,
  spoken_key text not null,
  variables jsonb not null default '{}'::jsonb,
  analysis_facts jsonb not null default '{}'::jsonb,
  source text not null check (
    source in ('opening_practice', 'engine_analysis', 'tactical_detector', 'manual')
  ),
  content_version integer not null default 1 check (content_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_events_subject_idx
  on public.coach_events (domain, subject_kind, subject_id, ply_index);

create index if not exists coach_events_parent_subject_idx
  on public.coach_events (domain, parent_subject_id)
  where parent_subject_id is not null;

create index if not exists coach_events_type_idx
  on public.coach_events (event_type, classification, severity);

drop trigger if exists coach_events_updated_at on public.coach_events;
create trigger coach_events_updated_at
  before update on public.coach_events
  for each row execute function public.handle_updated_at();

alter table public.coach_events enable row level security;

drop policy if exists "Coach events are readable by everyone"
  on public.coach_events;
create policy "Coach events are readable by everyone"
  on public.coach_events for select using (true);
