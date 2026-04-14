-- ─── Migration 002: Variation Progress ────────────────────────────────────────
-- Tracks per-user, per-variation practice completions using text slugs so we
-- don't need openings seeded in the DB yet.

create table public.user_variation_progress (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  opening_slug    text not null,
  variation_slug  text not null,
  times_completed int not null default 0,
  last_practiced_at timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, opening_slug, variation_slug)
);

create index user_variation_progress_user_idx
  on public.user_variation_progress (user_id, opening_slug);

alter table public.user_variation_progress enable row level security;

create policy "Users can manage own variation progress"
  on public.user_variation_progress for all using (auth.uid() = user_id);

create trigger user_variation_progress_updated_at
  before update on public.user_variation_progress
  for each row execute function public.handle_updated_at();

-- ─── Atomic upsert + increment ────────────────────────────────────────────────
-- Called client-side on variation completion. Using security definer so the
-- increment is atomic and can't race with a concurrent request.

create or replace function public.increment_variation_completion(
  p_user_id      uuid,
  p_opening_slug text,
  p_variation_slug text
) returns void language plpgsql security definer as $$
begin
  insert into public.user_variation_progress
    (user_id, opening_slug, variation_slug, times_completed, last_practiced_at)
  values
    (p_user_id, p_opening_slug, p_variation_slug, 1, now())
  on conflict (user_id, opening_slug, variation_slug) do update set
    times_completed   = user_variation_progress.times_completed + 1,
    last_practiced_at = now(),
    updated_at        = now();
end;
$$;
