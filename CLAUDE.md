# FirstMove — Project Master

## Identity
- **App:** FirstMove
- **Purpose:** A chess openings teaching app that helps beginner-to-intermediate players learn and practice openings through an interactive chessboard, guided move sequences, and a library organized by name and ECO code.
- **Platform:** Web (Next.js) + iOS + Android (Expo / React Native)
- **Stack:** Turborepo monorepo · Next.js 14 · Expo · TypeScript · Supabase · TanStack Query · Zustand · chess.js · react-chessboard (web) · react-native-svg custom board (mobile)
- **GitHub:** https://github.com/jsantos15/firstmove

## Global Rules
These apply to every session, every request, without exception:
- **Challenge suboptimal decisions:** If the user suggests anything — a technology, architecture, feature design, product logic, UX approach, or any other kind of decision — that you know to be suboptimal for their stated goals, say so clearly. Explain why a better option exists and recommend it. Only proceed with their original suggestion if they explicitly confirm after hearing the reasoning. This applies to all decisions, not just technical ones.
- **No dead code or orphaned files:** When updating or replacing existing functionality, removing the old implementation is part of completing the task. Before closing out any feature, scan for unused imports, unreferenced components or screens, superseded functions, commented-out code blocks, and files no longer imported anywhere. A feature is not done until the old version is fully removed.
- **Proactively apply well-established UX patterns:** Do not default to the obvious choice when a better pattern exists. Do not make login the landing page for consumer-facing apps — try-before-signup is the norm. Do not leave empty states unaddressed — an onboarding flow that populates the experience before the user sees it is the standard solution. Surface these proactively, do not wait to be asked.

## Monorepo Structure
```
firstmove/
├── apps/
│   ├── web/          → Next.js 14 App Router (Web)
│   └── mobile/       → Expo + React Native (iOS + Android)
├── packages/
│   ├── core/         → chess.js wrappers, openings data, shared types, game logic
│   └── supabase/     → Supabase client, schema, generated types, DB helpers
├── docs/             → Architecture decisions, API docs, decisions log
└── scripts/          → Build, deploy, and database automation scripts
```

## Environment Map
- `main` branch → Production (live app)
- `staging` branch → Pre-production (review before going live)
- `feature/*` branches → All development work

## Routing Table
| Request Type | Workspace(s) to touch | Notes |
|---|---|---|
| Web UI component or page | `apps/web` | Follow context.md conventions |
| Mobile screen or component | `apps/mobile` | Follow context.md conventions |
| Chess logic or game rules | `packages/core/src/game` | Never duplicate in apps |
| Openings data (add/edit) | `packages/core/src/openings` | Keep JSON + TypeScript types in sync |
| Shared TypeScript types | `packages/core/src/types` | Import from `@firstmove/core` in apps |
| Supabase schema change | `packages/supabase/migrations` | Always use a migration file, never alter prod DB directly |
| Supabase client/helpers | `packages/supabase/src` | Both apps import from `@firstmove/supabase` |
| Auth logic | `packages/supabase/src/auth.ts` | Shared across both apps |
| New environment variable | `apps/web/.env.example` or root `.env.example` | Never hardcode — always via env |
| Dependency added | `docs/decisions.md` | Log what it is and why |
| Documentation update | `docs/` only | Markdown only |
| Deploy to staging | Run staging deploy | Confirm with user first |
| Deploy to production | **STOP — confirm with user** | Never auto-deploy to production |

## Architecture Decisions
- **Backend:** Supabase (PostgreSQL + Auth + Edge Functions). No separate Node.js server.
- **Openings data:** Bundled in `packages/core` as typed JSON for offline access. Also stored in Supabase for server-side updates without an app release.
- **Chessboard:** `react-chessboard` on web. Custom SVG board via `react-native-svg` on mobile. Both consume `chess.js` from `packages/core`.
- **Auth:** Supabase Auth — email/password + Google OAuth + Apple Sign In (required for iOS App Store).
- **Data fetching:** TanStack Query in both apps. Zustand for local client state.
- **Offline:** expo-sqlite on mobile as a local cache. TanStack Query handles sync and background refresh.
- **Deployment:** Vercel (web), EAS Build (mobile), Supabase cloud (backend).

## Database Schema (Supabase / PostgreSQL)
| Table | Purpose |
|---|---|
| `user_profiles` | Display name, avatar, skill level, preferences |
| `openings` | ECO code, name, color (white/black), difficulty, description |
| `opening_moves` | Move sequence (PGN/JSON) per opening |
| `opening_variations` | Named variations per opening |
| `user_progress` | Per-user mastery per opening (times practiced, success rate, last practiced) |
| `user_repertoires` | Named collections of openings a user is building |
| `repertoire_openings` | Junction: openings ↔ repertoires |
| `user_favorites` | Quick-access openings per user |

## Escalation Rules
- Never merge into `main` without explicit user confirmation
- Never deploy to production without explicit user confirmation
- Never delete a file without explicit user confirmation
- If a request touches more than 2 workspaces, summarize the plan and wait for approval
- If adding a new dependency, state what it is and why before installing
- If modifying `CLAUDE.md` itself, confirm the change with the user first
- If a request is ambiguous, ask — do not assume

## Git Workflow
- All new work starts on a `feature/*` branch
- Commit after each logical unit of work
- Commit message format: `type: short description`
  - Types: `feat`, `fix`, `docs`, `test`, `config`, `refactor`
  - Example: `feat: add Sicilian Defense opening sequence`
- Merge `feature/*` → `staging` for review
- Merge `staging` → `main` only after user approval
- Never force push to `main` or `staging`

## Automated Git Behavior
Claude handles branch creation, commits, and pushes automatically — no need to ask or wait to be told:

- **Branch creation:** When starting work that introduces a new user-facing capability (a new screen, a new data flow, a new integration, a complete new function of the app), automatically create and switch to a `feature/*` branch before touching any code. Do not create a new branch for UI tweaks, copy changes, style adjustments, small menu additions, or anything that does not add a distinct new capability.
- **Commit and push:** When a feature is complete and the user confirms it (explicitly or clearly implicitly — e.g. "looks good", "ship it", "that's done"), automatically commit all changes with an appropriate message and push the feature branch to the remote. Do not wait to be asked.
- **Merging:** Never automatic. Merging feature/* into staging, or staging into main, always requires explicit user confirmation regardless of context. This is a hard rule — do not infer approval from positive feedback alone.

## How to Work on This Project
1. Read this file first — every session, every time
2. Read `/docs/decisions.md` to understand the reasoning behind key project decisions
3. Identify which workspace the routing table says to touch
4. Read that workspace's `context.md` before making any changes
5. Make changes only in the specified workspaces
6. If the work involves a decision that a future session would need to know to avoid a contradictory or uninformed choice, log it in `/docs/decisions.md` before closing out the task
7. Summarize what changed