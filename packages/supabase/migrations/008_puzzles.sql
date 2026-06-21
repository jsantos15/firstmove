-- Migration 008: Puzzles
-- Source: Lichess Open Puzzle Database (https://database.lichess.org/#puzzles), CC0.
-- puzzles maps 1:1 to the Lichess CSV columns plus a difficulty tier derived from rating.
-- user_puzzle_attempts records every attempt so progress and streaks can be computed later.

-- ─── Puzzle content ────────────────────────────────────────────────────────────
-- FEN: board position before the first entry in moves[] (opponent has not yet played).
-- moves: full UCI array — moves[0] is the opponent's setup move played automatically;
--        moves[1], moves[3], … are the player's solution moves.
-- Rating / difficulty bands: <1200 = beginner, 1200–1599 = intermediate, 1600+ = advanced.

create table public.puzzles (
  -- Lichess source fields (preserved verbatim so re-imports are idempotent)
  puzzle_id        text primary key,
  fen              text not null,
  moves            text[] not null,
  rating           int not null,
  rating_deviation int not null default 0,
  popularity       int not null default 0,
  nb_plays         int not null default 0,
  themes           text[] not null default '{}',
  game_url         text,
  opening_tags     text[] not null default '{}',
  -- FirstMove-derived
  difficulty       opening_difficulty not null,
  created_at       timestamptz not null default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index puzzles_difficulty_idx   on public.puzzles (difficulty);
create index puzzles_rating_idx       on public.puzzles (rating);
create index puzzles_popularity_idx   on public.puzzles (popularity desc);
create index puzzles_themes_idx       on public.puzzles using gin (themes);
create index puzzles_opening_tags_idx on public.puzzles using gin (opening_tags);

-- Composite index for the most common query: difficulty + popularity ordering
create index puzzles_difficulty_popularity_idx on public.puzzles (difficulty, popularity desc);

-- ─── User puzzle attempts ──────────────────────────────────────────────────────

create table public.user_puzzle_attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  puzzle_id    text not null references public.puzzles(puzzle_id) on delete cascade,
  solved       boolean not null,
  time_ms      int,
  attempted_at timestamptz not null default now()
);

create index user_puzzle_attempts_user_idx   on public.user_puzzle_attempts (user_id, attempted_at desc);
create index user_puzzle_attempts_puzzle_idx on public.user_puzzle_attempts (puzzle_id);

-- ─── Row Level Security ────────────────────────────────────────────────────────

alter table public.puzzles              enable row level security;
alter table public.user_puzzle_attempts enable row level security;

-- Puzzles are public read (same pattern as openings_catalog)
create policy "Anyone can read puzzles"
  on public.puzzles for select using (true);

-- Attempts are private per user
create policy "Users can manage own puzzle attempts"
  on public.user_puzzle_attempts for all using (auth.uid() = user_id);
