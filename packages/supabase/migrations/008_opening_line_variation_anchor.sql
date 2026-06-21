-- Add Lichess-authoritative variation anchor metadata to opening_lines.
-- Stores the exact move depth at which a named variation is first identified,
-- so the app can display the anchor position without guessing.

ALTER TABLE opening_lines
  ADD COLUMN IF NOT EXISTS variation_anchor_ply    integer,
  ADD COLUMN IF NOT EXISTS variation_anchor_name   text,
  ADD COLUMN IF NOT EXISTS variation_anchor_fen    text,
  ADD COLUMN IF NOT EXISTS variation_anchor_sans   text[];
