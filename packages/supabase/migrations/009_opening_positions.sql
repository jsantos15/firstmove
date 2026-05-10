-- Migration 009: Opening position name index
-- Stores Lichess-authoritative opening names by normalized FEN position so
-- practice and future game analysis views can resolve names without scanning
-- PGN text or relying on bundled opening data.

create table if not exists public.opening_positions (
  position_key text primary key,
  fen text not null,
  eco_code text not null,
  name text not null,
  family text not null,
  variation text,
  pgn text not null,
  sans text[] not null,
  ply integer not null,
  source text not null default 'lichess-org/chess-openings',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opening_positions_ply_check check (ply >= 0)
);

create index if not exists opening_positions_name_idx
  on public.opening_positions (name);

create index if not exists opening_positions_family_idx
  on public.opening_positions (family);

drop trigger if exists opening_positions_updated_at on public.opening_positions;
create trigger opening_positions_updated_at
  before update on public.opening_positions
  for each row execute procedure public.handle_updated_at();

alter table public.opening_positions enable row level security;

drop policy if exists "Opening positions are readable by everyone" on public.opening_positions;
create policy "Opening positions are readable by everyone"
  on public.opening_positions for select using (true);

notify pgrst, 'reload schema';
