# packages/core — Context

## Purpose
The single source of truth for chess logic, opening data, and shared TypeScript types across the entire monorepo. Both `apps/web` and `apps/mobile` import from here via `@firstmove/core`.

## What lives here
- **`src/types/`** — All shared TypeScript interfaces (Opening, Move, Progress, Repertoire, etc.)
- **`src/game/`** — chess.js wrappers: move validation, FEN utilities, practice session logic
- **`src/openings/`** — The full openings library as typed TypeScript/JSON, plus lookup helpers

## What does NOT live here
- UI components — those are platform-specific, in `apps/web` or `apps/mobile`
- Supabase queries — those are in `packages/supabase`
- Any platform-specific code (no React imports, no DOM, no React Native)

## Naming Conventions
- **Types:** PascalCase interfaces — `Opening`, `OpeningMove`, `UserProgress`
- **Functions:** camelCase — `buildMoveSequence`, `applyMoveToSession`, `getOpeningById`
- **Constants:** SCREAMING_SNAKE_CASE — `STARTING_FEN`, `OPENINGS`

## Adding New Openings
1. Add to the `OPENINGS` array in `src/openings/index.ts`
2. Include ECO code, name, color, difficulty, all moves with FEN, and at least one variation if applicable
3. FENs must be verified — use `buildMoveSequence()` from `src/game/index.ts` to generate them programmatically
4. Export new lookup helpers if needed
5. The Supabase mirror should be updated in the same PR (add to `packages/supabase/migrations/`)

## Key Rules
- This package has zero platform dependencies — no React, no DOM, no React Native, no Expo
- chess.js is the only allowed dependency
- All types that cross the web/mobile boundary must be defined here, not in either app
- Never duplicate logic from this package in either app
