-- ─── Migration 004: Learned Progress ──────────────────────────────────────────
-- Adds has_learned column to user_variation_progress so the app can track
-- whether a user has gone through a variation in Learn mode (separate from
-- Practice-mode completions).

alter table public.user_variation_progress
  add column if not exists has_learned boolean not null default false;

-- ─── Record learned ───────────────────────────────────────────────────────────
-- Called client-side when a user finishes a variation in Learn mode.
-- Upserts the row and sets has_learned = true.

create or replace function public.record_variation_learned(
  p_user_id        uuid,
  p_opening_slug   text,
  p_variation_slug text
) returns void language plpgsql security definer as $$
begin
  insert into public.user_variation_progress
    (user_id, opening_slug, variation_slug, has_learned, last_practiced_at)
  values
    (p_user_id, p_opening_slug, p_variation_slug, true, now())
  on conflict (user_id, opening_slug, variation_slug) do update set
    has_learned       = true,
    last_practiced_at = now(),
    updated_at        = now();
end;
$$;
