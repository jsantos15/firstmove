# Architecture Decisions

> Log every major technology or architecture decision here. Format: date, decision, reason.

---

## 2026-04-10 — Monorepo with Turborepo + pnpm workspaces

**Decision:** Use a Turborepo monorepo with two apps (`apps/web`, `apps/mobile`) and two shared packages (`packages/core`, `packages/supabase`).

**Reason:** Avoids duplicating chess logic and opening data across platforms. Each app uses the right tools for its platform (react-chessboard on web, react-native-svg custom board on mobile) while sharing all business logic. Turborepo handles build caching and task orchestration across the workspace.

---

## 2026-04-10 — Supabase as backend

**Decision:** Use Supabase (PostgreSQL + Auth + Edge Functions) instead of a custom Node.js backend.

**Reason:** Provides auth, database, real-time, and storage in one open-source platform. The auto-generated TypeScript client works identically in Next.js and React Native. Row-level security enforces data isolation at the database level. Free tier is sufficient for early-stage development. Can be self-hosted if needed.

---

## 2026-04-10 — Next.js for web, Expo for mobile (separate apps)

**Decision:** Separate web and mobile apps rather than a single React Native + Expo web target.

**Reason:** React Native Web produces an inferior web experience for a chess teaching app. react-chessboard (the standard web chess board library) is DOM-only. Next.js gives proper SEO, fast page loads, and correct web semantics. Expo gives native mobile performance. Shared logic in `packages/core` eliminates most code duplication.

---

## 2026-04-10 — Openings data bundled as TypeScript + mirrored in Supabase

**Decision:** Store the openings library as typed JSON in `packages/core/src/openings/index.ts` AND in Supabase.

**Reason:** Bundling enables offline access and instant load on first open. Supabase mirror enables content updates (new openings, corrections) without requiring an App Store release. On launch, the app checks for a newer dataset version from the server and updates the local cache silently.

---

## 2026-04-10 — TanStack Query for server state

**Decision:** Use TanStack Query (React Query) in both apps for all server data fetching.

**Reason:** Handles caching, background refresh, optimistic updates, and offline queuing in a single library. Works identically in Next.js and React Native. Pairs well with Zustand (which handles local client state only).

---

## 2026-04-10 — Custom SVG board on mobile via react-native-svg

**Decision:** Build a custom chess board component using react-native-svg rather than using an off-the-shelf React Native chess board.

**Reason:** Available React Native chess board libraries are immature and have limited customization. A teaching app requires custom square highlighting, arrows, move annotations, and step-by-step guidance overlays — none of which off-the-shelf components support cleanly. react-native-svg works on iOS, Android, and web (via react-native-web).
