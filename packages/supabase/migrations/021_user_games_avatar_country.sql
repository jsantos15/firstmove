-- ─── User Games: avatar + country ──────────────────────────────────────────────
-- Chess.com avatars and Lichess/Chess.com country flags are fetched live from the
-- provider's public profile API when a game is imported (keyed off username), but
-- were never persisted — so re-selecting a saved game from My Games silently lost
-- them. Store the resolved values at Save time so a reload doesn't depend on a
-- fresh network round-trip (which can also fail, rate-limit, or go stale if the
-- player's username later changes).

alter table public.user_games
  add column white_avatar_url text,
  add column black_avatar_url text,
  add column white_country    text,
  add column black_country    text;
