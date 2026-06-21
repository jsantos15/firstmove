# packages/i18n - Context

## Purpose

Shared localization configuration, source-controlled message templates, and small formatting helpers used by the web and mobile apps.

## What lives here

- Locale definitions and fallback rules
- ICU-style message keys and English base messages
- Coach text templates for display and spoken narration
- Validation scripts that keep supported locale files complete

## Key Rules

- Keep translated strings in source control, not Supabase
- Supabase stores coach event facts and variables, not localized prose
- Use stable message keys with named variables; do not concatenate localized sentence fragments
- Keep spoken coach text separate from display text so TTS can sound natural on web, iOS, and Android
- Add a locale to `SUPPORTED_LOCALES` only when its required keys are complete
