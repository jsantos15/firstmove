# Architecture Decisions

> Log every major technology or architecture decision here. Format: date, decision, reason.

---

## 2026-04-10 - Monorepo with Turborepo + pnpm workspaces

**Decision:** Use a Turborepo monorepo with two apps (`apps/web`, `apps/mobile`) and two shared packages (`packages/core`, `packages/supabase`).

**Reason:** Avoids duplicating chess logic and opening data across platforms. Each app uses the right tools for its platform while sharing all business logic. Turborepo handles build caching and task orchestration across the workspace.

---

## 2026-04-10 - Supabase as backend

**Decision:** Use Supabase (PostgreSQL + Auth + Edge Functions) instead of a custom Node.js backend.

**Reason:** Provides auth, database, real-time, and storage in one open-source platform. The auto-generated TypeScript client works identically in Next.js and React Native. Row-level security enforces data isolation at the database level. Free tier is sufficient for early-stage development. Can be self-hosted if needed.

---

## 2026-04-10 - Next.js for web, Expo for mobile (separate apps)

**Decision:** Separate web and mobile apps rather than a single React Native + Expo web target.

**Reason:** React Native Web produces an inferior web experience for a chess teaching app. Next.js gives proper SEO, fast page loads, and correct web semantics. Expo gives native mobile performance. Shared logic in `packages/core` eliminates most code duplication.

---

## 2026-04-10 - Openings data bundled as TypeScript + mirrored in Supabase

**Decision:** Store the openings library as typed JSON in `packages/core/src/openings/index.ts` and in Supabase.

**Reason:** Bundling enables offline access and instant load on first open. Supabase mirroring enables content updates without requiring an app release. On launch, the app can check for a newer dataset version from the server and update the local cache silently.

---

## 2026-04-10 - TanStack Query for server state

**Decision:** Use TanStack Query in both apps for all server data fetching.

**Reason:** Handles caching, background refresh, optimistic updates, and offline queuing in a single library. Works identically in Next.js and React Native. Pairs well with Zustand, which handles local client state only.

---

## 2026-04-12 - @supabase/ssr for Next.js App Router auth

**Decision:** Add `@supabase/ssr` to `apps/web` alongside `@supabase/supabase-js`.

**Reason:** The standard `supabase-js` client stores auth tokens in localStorage, which is inaccessible to Next.js middleware and server components. `@supabase/ssr` provides `createBrowserClient` and `createServerClient` helpers that keep auth state readable on both the client and server. The shared `packages/supabase` client remains unchanged for mobile.

---

## 2026-04-10 - Custom SVG board on mobile via react-native-svg

**Decision:** Build a custom chess board component using `react-native-svg` rather than an off-the-shelf React Native chess board.

**Reason:** Available React Native chess board libraries are immature and have limited customization. A teaching app requires custom square highlighting, arrows, move annotations, and step-by-step guidance overlays that off-the-shelf components do not support cleanly.

---

## 2026-04-17 - Keep the web practice board on react-chessboard

**Decision:** Rebuild the web practice flow around a thin `react-chessboard` wrapper instead of continuing the `cm-chessboard` experiment.

**Reason:** `react-chessboard` is a better fit for the current Next.js/React stack, includes built-in premove support, and lets the app keep chess validation logic in `@firstmove/core` without owning low-level board interaction behavior.
