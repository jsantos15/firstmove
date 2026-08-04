-- ─── User Profiles: synced board settings ──────────────────────────────────────
-- Board/piece theme, coordinates, sounds, engine panel prefs (useBoardSettings) were
-- purely localStorage — per browser profile, not per account, so signing into the same
-- account on another device/browser showed defaults. Account settings are now
-- authoritative once signed in: pulled down on sign-in, pushed up on change (see
-- apps/web/components/BoardSettingsSync.tsx). Nullable/no default — absence means "this
-- account has never synced settings yet", client falls back to localStorage/defaults.

alter table public.user_profiles
  add column board_settings jsonb;
