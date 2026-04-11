# apps/web — Context

## Platform & Stack
- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4
- **State:** Zustand (local/UI state) + TanStack Query (server state)
- **Chess board:** `react-chessboard`
- **Chess logic:** `chess.js` — import from `@firstmove/core`, never directly
- **Auth & DB:** `@firstmove/supabase` — never import `@supabase/supabase-js` directly in app code
- **HTTP/cache:** TanStack Query — all Supabase calls go through Query hooks, not raw in components

## Folder Structure
```
apps/web/
├── app/                  → Next.js App Router pages and layouts
│   ├── (auth)/           → Login, signup, callback pages
│   ├── (app)/            → Protected app pages (dashboard, practice, library)
│   └── layout.tsx        → Root layout with providers
├── components/
│   ├── board/            → Chess board and related UI (ChessBoard, MoveList, etc.)
│   ├── openings/         → Opening card, library list, ECO badge
│   ├── practice/         → Practice session UI
│   └── ui/               → Generic reusable UI (Button, Card, Modal, etc.)
├── hooks/                → Custom React hooks (useOpenings, useProgress, etc.)
├── lib/                  → Non-component utilities (formatters, constants)
├── stores/               → Zustand stores
└── context.md            → This file
```

## Naming Conventions
- **Components:** PascalCase — `ChessBoard.tsx`, `OpeningCard.tsx`
- **Hooks:** camelCase prefixed with `use` — `useOpenings.ts`, `usePracticeSession.ts`
- **Stores:** camelCase suffixed with `Store` — `boardStore.ts`, `sessionStore.ts`
- **Pages/layouts:** lowercase — `page.tsx`, `layout.tsx` (Next.js convention)
- **Utilities:** camelCase — `formatEco.ts`, `calculateMastery.ts`

## Import Aliases
- Use `@/*` for all imports from within `apps/web` (configured in tsconfig)
- `@firstmove/core` — chess logic, types, openings data
- `@firstmove/supabase` — DB queries, auth helpers

## Key Rules
- Never import from `@supabase/supabase-js` directly — always use `@firstmove/supabase`
- Never import from `chess.js` directly in app code — always use `@firstmove/core`
- All server data fetching goes through TanStack Query hooks in `/hooks`
- Zustand stores hold UI/local state only (board orientation, active move, modal state)
- Never hardcode values that belong in environment variables
- Never touch `/config` or root `.env` files from this workspace
