-- ─── FirstMove Initial Schema ─────────────────────────────────────────────────
-- Migration: 001_initial_schema
-- Run this in your Supabase project → SQL Editor

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─── Enums ────────────────────────────────────────────────────────────────────

create type opening_color as enum ('white', 'black');
create type opening_difficulty as enum ('beginner', 'intermediate', 'advanced');
create type mastery_level as enum ('new', 'learning', 'familiar', 'mastered');

-- ─── User Profiles ─────────────────────────────────────────────────────────────
-- Extends Supabase auth.users — one row per user

create table public.user_profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  skill_level  opening_difficulty,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ─── Openings ─────────────────────────────────────────────────────────────────

create table public.openings (
  id          uuid primary key default gen_random_uuid(),
  eco_code    text not null,
  name        text not null,
  color       opening_color not null,
  difficulty  opening_difficulty not null,
  description text,
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create index openings_eco_code_idx on public.openings (eco_code);
create index openings_color_idx on public.openings (color);
create index openings_difficulty_idx on public.openings (difficulty);

-- ─── Opening Moves ─────────────────────────────────────────────────────────────

create table public.opening_moves (
  id          uuid primary key default gen_random_uuid(),
  opening_id  uuid not null references public.openings(id) on delete cascade,
  move_number int not null,
  san         text not null,
  fen         text not null,
  annotation  text,
  created_at  timestamptz not null default now()
);

create index opening_moves_opening_id_idx on public.opening_moves (opening_id, move_number);

-- ─── Opening Variations ────────────────────────────────────────────────────────

create table public.opening_variations (
  id          uuid primary key default gen_random_uuid(),
  opening_id  uuid not null references public.openings(id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table public.variation_moves (
  id           uuid primary key default gen_random_uuid(),
  variation_id uuid not null references public.opening_variations(id) on delete cascade,
  move_number  int not null,
  san          text not null,
  fen          text not null,
  annotation   text
);

-- ─── User Progress ─────────────────────────────────────────────────────────────

create table public.user_progress (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  opening_id       uuid not null references public.openings(id) on delete cascade,
  times_practiced  int not null default 0,
  success_rate     numeric(5,2) not null default 0,
  mastery_level    mastery_level not null default 'new',
  last_practiced_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, opening_id)
);

create index user_progress_user_id_idx on public.user_progress (user_id);

-- ─── User Repertoires ──────────────────────────────────────────────────────────

create table public.user_repertoires (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index user_repertoires_user_id_idx on public.user_repertoires (user_id);

create table public.repertoire_openings (
  repertoire_id uuid not null references public.user_repertoires(id) on delete cascade,
  opening_id    uuid not null references public.openings(id) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (repertoire_id, opening_id)
);

-- ─── User Favorites ────────────────────────────────────────────────────────────

create table public.user_favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  opening_id uuid not null references public.openings(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (user_id, opening_id)
);

-- ─── Row Level Security ────────────────────────────────────────────────────────
-- Users can only read/write their own data.

alter table public.user_profiles enable row level security;
alter table public.user_progress enable row level security;
alter table public.user_repertoires enable row level security;
alter table public.repertoire_openings enable row level security;
alter table public.user_favorites enable row level security;

-- Openings are public (read-only for all authenticated users)
alter table public.openings enable row level security;
alter table public.opening_moves enable row level security;
alter table public.opening_variations enable row level security;
alter table public.variation_moves enable row level security;

-- Policies: user_profiles
create policy "Users can view own profile"
  on public.user_profiles for select using (auth.uid() = user_id);
create policy "Users can update own profile"
  on public.user_profiles for update using (auth.uid() = user_id);
create policy "Users can insert own profile"
  on public.user_profiles for insert with check (auth.uid() = user_id);

-- Policies: openings (public read)
create policy "Anyone can read openings"
  on public.openings for select using (true);
create policy "Anyone can read opening moves"
  on public.opening_moves for select using (true);
create policy "Anyone can read opening variations"
  on public.opening_variations for select using (true);
create policy "Anyone can read variation moves"
  on public.variation_moves for select using (true);

-- Policies: user_progress
create policy "Users can manage own progress"
  on public.user_progress for all using (auth.uid() = user_id);

-- Policies: repertoires
create policy "Users can manage own repertoires"
  on public.user_repertoires for all using (auth.uid() = user_id);
create policy "Users can manage own repertoire openings"
  on public.repertoire_openings for all
  using (auth.uid() = (select user_id from public.user_repertoires where id = repertoire_id));

-- Policies: favorites
create policy "Users can manage own favorites"
  on public.user_favorites for all using (auth.uid() = user_id);

-- ─── Auto-update updated_at ────────────────────────────────────────────────────

create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.handle_updated_at();

create trigger user_progress_updated_at
  before update on public.user_progress
  for each row execute function public.handle_updated_at();

create trigger user_repertoires_updated_at
  before update on public.user_repertoires
  for each row execute function public.handle_updated_at();

-- ─── Auto-create profile on signup ────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_profiles (user_id, display_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
