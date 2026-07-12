-- ─── User Games: imported username ─────────────────────────────────────────────
-- When importing from the Chess.com/Lichess tabs, the analysis page orients the
-- board so the searched-for player's pieces sit at the bottom (the "my games" view
-- people expect). That orientation was only ever kept in transient in-memory state
-- (ImportMeta.importedUsername), never persisted — so reloading a saved game from
-- Saved Analysis lost the original orientation and defaulted back to White-on-bottom.
-- Store the searched username so a reload can reapply the same orientation logic.

alter table public.user_games
  add column imported_username text;
