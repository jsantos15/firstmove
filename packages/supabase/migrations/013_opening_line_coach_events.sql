-- Store locale-neutral coach event facts for opening lines.
-- Localized display/spoken templates stay in source-controlled @firstmove/i18n files.

create table if not exists public.opening_line_coach_events (
  opening_slug text not null,
  line_slug text not null,
  ply_index integer not null check (ply_index >= 0),
  event_key text not null,
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
  variables jsonb not null default '{}'::jsonb,
  source text not null default 'generated',
  content_version integer not null default 1 check (content_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (opening_slug, line_slug, ply_index, event_key),
  constraint opening_line_coach_events_line_fkey
    foreign key (opening_slug, line_slug)
    references public.opening_lines(opening_slug, slug)
    on delete cascade
);

create index if not exists opening_line_coach_events_line_idx
  on public.opening_line_coach_events (opening_slug, line_slug, ply_index);

create index if not exists opening_line_coach_events_event_key_idx
  on public.opening_line_coach_events (event_key);

drop trigger if exists opening_line_coach_events_updated_at
  on public.opening_line_coach_events;
create trigger opening_line_coach_events_updated_at
  before update on public.opening_line_coach_events
  for each row execute function public.handle_updated_at();

alter table public.opening_line_coach_events enable row level security;

drop policy if exists "Opening line coach events are readable by everyone"
  on public.opening_line_coach_events;
create policy "Opening line coach events are readable by everyone"
  on public.opening_line_coach_events for select using (true);
