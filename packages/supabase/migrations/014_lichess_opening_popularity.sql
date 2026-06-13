-- Store every named opening and variation from lichess-org/chess-openings
-- with Lichess Explorer game counts at each anchor position.
--
-- type = 'opening'   -> top-level family entry, e.g. Italian Game
-- type = 'variation' -> named sub-line, e.g. Italian Game: Giuoco Piano

create table if not exists public.lichess_opening_popularity (
  id                bigserial primary key,
  eco_code          text        not null,
  full_name         text        not null,
  family_name       text        not null,
  variation_name    text,
  type              text        not null check (type in ('opening', 'variation')),
  opening_eco_code  text,
  anchor_sans       text[]      not null,
  anchor_fen        text        not null,
  popularity_games  bigint,
  fetched_at        timestamptz,
  created_at        timestamptz not null default now(),

  unique (eco_code, full_name)
);

create index if not exists lop_family_name_idx
  on public.lichess_opening_popularity (family_name);
create index if not exists lop_type_idx
  on public.lichess_opening_popularity (type);
create index if not exists lop_eco_code_idx
  on public.lichess_opening_popularity (eco_code);
create index if not exists lop_opening_eco_idx
  on public.lichess_opening_popularity (opening_eco_code);
create index if not exists lop_popularity_idx
  on public.lichess_opening_popularity (popularity_games desc nulls last);

alter table public.lichess_opening_popularity enable row level security;

drop policy if exists "Anyone can read lichess_opening_popularity"
  on public.lichess_opening_popularity;
create policy "Anyone can read lichess_opening_popularity"
  on public.lichess_opening_popularity for select using (true);
