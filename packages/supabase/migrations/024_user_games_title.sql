-- ─── User Games: player titles ─────────────────────────────────────────────
-- Chess.com/Lichess titles (GM, IM, WGM, etc.) are fetched live from the
-- provider's public profile API when a game is imported, same as avatar/
-- country (see 021_user_games_avatar_country.sql) — persist them the same
-- way so a reload from My Games doesn't depend on a fresh network round-trip.

alter table public.user_games
  add column white_title text,
  add column black_title text;
