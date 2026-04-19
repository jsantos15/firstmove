-- ─── Migration 003: Clean Openings Catalog ─────────────────────────────────────
-- Drops the old UUID-based opening tables (never used in production) and
-- replaces them with a clean slug-keyed catalog that matches the app's data model.
-- Also recreates user_favorites and repertoire_openings with slug references.

-- ─── Drop old UUID-based tables (reverse dependency order) ────────────────────

drop table if exists public.user_favorites;
drop table if exists public.repertoire_openings;
drop table if exists public.user_progress;
drop table if exists public.variation_moves;
drop table if exists public.opening_variations;
drop table if exists public.opening_moves;
drop table if exists public.openings;

-- ─── Openings Catalog ─────────────────────────────────────────────────────────
-- One row per opening. Slug is the stable identifier used everywhere.

create table public.openings_catalog (
  slug        text primary key,
  eco_code    text not null,
  name        text not null,
  color       opening_color not null,
  difficulty  opening_difficulty not null,
  description text not null default '',
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index openings_catalog_color_idx      on public.openings_catalog (color);
create index openings_catalog_difficulty_idx on public.openings_catalog (difficulty);
create index openings_catalog_tags_idx       on public.openings_catalog using gin (tags);

-- ─── Opening Lines ────────────────────────────────────────────────────────────
-- All named lines per opening (main line + variations).
-- sort_order 0 = main line, 1+ = variations (in display order).
-- FENs are computed at runtime from sans via chess.js — not stored.

create table public.opening_lines (
  slug         text not null,
  opening_slug text not null references public.openings_catalog(slug) on delete cascade,
  name         text not null,
  description  text,
  sans         text[] not null,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  primary key (opening_slug, slug)
);

create index opening_lines_opening_idx on public.opening_lines (opening_slug, sort_order);

-- ─── User Favorites ───────────────────────────────────────────────────────────

create table public.user_favorites (
  user_id      uuid not null references auth.users(id) on delete cascade,
  opening_slug text not null references public.openings_catalog(slug) on delete cascade,
  added_at     timestamptz not null default now(),
  primary key (user_id, opening_slug)
);

-- ─── Repertoire Openings ──────────────────────────────────────────────────────

create table public.repertoire_openings (
  repertoire_id uuid not null references public.user_repertoires(id) on delete cascade,
  opening_slug  text not null references public.openings_catalog(slug) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (repertoire_id, opening_slug)
);

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table public.openings_catalog   enable row level security;
alter table public.opening_lines      enable row level security;
alter table public.user_favorites     enable row level security;
alter table public.repertoire_openings enable row level security;

-- Openings are public read
create policy "Anyone can read openings catalog"
  on public.openings_catalog for select using (true);

create policy "Anyone can read opening lines"
  on public.opening_lines for select using (true);

-- User-scoped tables
create policy "Users can manage own favorites"
  on public.user_favorites for all using (auth.uid() = user_id);

create policy "Users can manage own repertoire openings"
  on public.repertoire_openings for all
  using (auth.uid() = (select user_id from public.user_repertoires where id = repertoire_id));

-- ─── Auto-update updated_at on openings_catalog ───────────────────────────────

create trigger openings_catalog_updated_at
  before update on public.openings_catalog
  for each row execute function public.handle_updated_at();
