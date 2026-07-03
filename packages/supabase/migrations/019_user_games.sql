-- ─── User Games ────────────────────────────────────────────────────────────────
-- Games a user has explicitly saved from analysis, imported from Lichess/Chess.com,
-- or (in the future) played inside the app — `source` reserves 'played' for that.
--
-- Flat columns cover the fields the UI actually displays/filters on (mirroring
-- what Chess.com's and Lichess's own game-export APIs report per game).
-- `provider_data` keeps the full raw provider game object as a backstop so no
-- imported field is lost even if we haven't promoted it to a flat column yet.

create table public.user_games (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,

  pgn                    text not null,
  fen                    text,

  white                  text,
  white_elo              text,
  white_result           text,
  black                  text,
  black_elo              text,
  black_result           text,
  result                 text,
  termination            text,

  event                  text,
  round                  text,
  site                   text,
  eco                    text,
  opening_name           text,

  time_control           text,
  time_class             text,
  clock_initial_seconds  integer,
  clock_increment_seconds integer,
  rated                  boolean,
  variant                text,

  white_accuracy         numeric(5, 2),
  black_accuracy         numeric(5, 2),

  played_date            text,

  source                 text not null default 'manual'
                         check (source in ('manual', 'lichess', 'chesscom', 'played')),
  source_game_id         text,
  source_url             text,
  provider_data          jsonb,

  created_at             timestamptz not null default now(),

  constraint user_games_unique_source unique (user_id, source, source_game_id)
);

create index user_games_user_id_idx on public.user_games (user_id);

alter table public.user_games enable row level security;

create policy "Users can manage own games"
  on public.user_games for all using (auth.uid() = user_id);
