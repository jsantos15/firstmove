-- Migration 005: Opening Library Metadata
-- Adds library metadata needed for the regenerated opening dataset so the app
-- can later sort, filter, and feature openings without rebuilding the content.

alter table public.openings_catalog
  add column if not exists display_tier text,
  add column if not exists is_featured boolean,
  add column if not exists popularity_rank integer,
  add column if not exists popularity_score double precision,
  add column if not exists popularity_games integer,
  add column if not exists has_main_line boolean not null default false;

alter table public.openings_catalog
  drop constraint if exists openings_catalog_display_tier_check;

alter table public.openings_catalog
  add constraint openings_catalog_display_tier_check
  check (display_tier in ('core', 'extended', 'other') or display_tier is null);

create index if not exists openings_catalog_display_tier_idx
  on public.openings_catalog (display_tier);

create index if not exists openings_catalog_popularity_rank_idx
  on public.openings_catalog (popularity_rank);

alter table public.opening_lines
  add column if not exists full_name text,
  add column if not exists primary_category text,
  add column if not exists inclusion_outcome text,
  add column if not exists line_difficulty opening_difficulty,
  add column if not exists is_main_line boolean not null default false,
  add column if not exists popularity_rank integer,
  add column if not exists popularity_score double precision,
  add column if not exists popularity_games integer,
  add column if not exists source_name text,
  add column if not exists source_confidence text;

alter table public.opening_lines
  drop constraint if exists opening_lines_primary_category_check;

alter table public.opening_lines
  add constraint opening_lines_primary_category_check
  check (
    primary_category in (
      'setup',
      'strategic',
      'tactical_payoff',
      'forcing'
    ) or primary_category is null
  );

create index if not exists opening_lines_is_main_line_idx
  on public.opening_lines (opening_slug, is_main_line, sort_order);

create index if not exists opening_lines_popularity_rank_idx
  on public.opening_lines (opening_slug, popularity_rank);
