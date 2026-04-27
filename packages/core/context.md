# packages/core — Context

## Purpose
The single source of truth for chess logic and shared TypeScript types across the entire monorepo. Both `apps/web` and `apps/mobile` import from here via `@firstmove/core`.

## What lives here
- **`src/types/`** — All shared TypeScript interfaces (Opening, Move, Progress, Repertoire, etc.)
- **`src/game/`** — chess.js wrappers: move validation, FEN utilities, practice session logic

## What does NOT live here
- UI components — those are platform-specific, in `apps/web` or `apps/mobile`
- Supabase queries — those are in `packages/supabase`
- Opening-library content — that now lives in Supabase and is loaded through `@firstmove/supabase`
- Any platform-specific code (no React imports, no DOM, no React Native)

## Naming Conventions
- **Types:** PascalCase interfaces — `Opening`, `OpeningMove`, `UserProgress`
- **Functions:** camelCase — `buildMoveSequence`, `applyMoveToSession`
- **Constants:** SCREAMING_SNAKE_CASE — `STARTING_FEN`

## Key Rules
- This package has zero platform dependencies — no React, no DOM, no React Native, no Expo
- chess.js is the only allowed dependency
- All types that cross the web/mobile boundary must be defined here, not in either app
- Never duplicate logic from this package in either app
