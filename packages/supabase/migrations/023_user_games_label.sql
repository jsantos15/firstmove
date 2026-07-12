-- ─── User Games: label ──────────────────────────────────────────────────────────
-- "Save as new copy" forks a saved analysis into a second row with the same players/
-- result/date as the original, making the two indistinguishable in the Saved Analysis
-- list. Add an optional, user-editable label so people can tell copies apart (and
-- organize saved analyses generally) — e.g. "Sicilian sideline" vs "Main line".

alter table public.user_games
  add column label text;
