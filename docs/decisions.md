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

---

## 2026-04-19 - Define opening line depth by teaching value, not move count

**Decision:** Define FirstMove opening lines with semantic stopping rules rather than fixed move-count thresholds. A line should end once the variation's identity, idea, and practical consequence are clear, and further moves would mostly test memory instead of teaching opening knowledge.

**Reason:** FirstMove is a teaching app, not a raw theory dump. Fixed minimums and maximums would force users to memorize low-value continuation moves in some openings while still cutting off the payoff too early in tactical lines, traps, and gambits. A rule-based definition keeps the dataset focused on practical learning value.

---

## 2026-04-19 - Classify opening lines by teaching purpose

**Decision:** Classify each FirstMove opening line under a single primary teaching category: `setup`, `strategic`, `trap`, `gambit`, `punishment`, or `forcing`, with optional secondary tags for context.

**Reason:** The same stopping rule cannot be interpreted identically across all lines. A quiet tabiya, a tactical trap, and a sacrificial attacking line each become "complete" for different reasons. A shared category system makes line review, sourcing, and future testing more consistent.

---

## 2026-04-19 - Use human opening sources first and Stockfish second

**Decision:** Source FirstMove opening lines from richer human opening data first, then use Stockfish as a secondary tool for validation, final-position evaluation, and selective gap-filling when a line still stops too early.

**Reason:** FirstMove is teaching opening ideas for humans, not reproducing computer-optimal continuations for their own sake. Human opening sources preserve named variation identity and practical move order better than engine-only generation, while Stockfish remains valuable for checking soundness, confirming short continuations, and powering optional learner feedback such as evaluation summaries.

---

## 2026-04-19 - Add Stockfish 17.1 as an offline analysis dependency

**Decision:** Add the `stockfish` npm package pinned to `17.1.0` and start with an offline analysis script workflow before integrating engine output into the app UI.

**Reason:** The engine is needed now to validate candidate opening lines, compare possible stopping points, and analyze final positions while the opening dataset is being rebuilt. Starting with an offline tool keeps the integration small and reusable, while leaving room to add eval-bar or post-line feedback later without changing engine versions.

---

## 2026-04-19 - Use lichess-org/chess-openings as the naming authority

**Decision:** Use the public `lichess-org/chess-openings` dataset as FirstMove's primary authority for opening-family and variation naming audits, while keeping manual review for app-specific setup labels and transpositional edge cases.

**Reason:** FirstMove currently stores manually curated line names that are often standard but not yet checked against a shared reference. The Lichess opening-name dataset is open, structured, move-sequence-based, and better suited for verifying whether a current line maps to a recognized named variation or only to a broader opening family.

---

## 2026-04-20 - Bias line inclusion toward real learner-relevant branches

**Decision:** Treat line inclusion separately from line stopping, and bias inclusion toward any real branch that changes what the learner should recognize, expect, or do. A line may deserve inclusion even if it differs from a nearby line by only one move or later transposes.

**Reason:** FirstMove is trying to build broad practical opening coverage, not a minimal taxonomy. Close neighboring branches can still create different recognition tasks, responses, punishments, setups, or testing prompts. Similarity alone is not a good reason to merge or exclude a line if the learner benefits from practicing it separately.

---

## 2026-04-20 - Prepare the library rebuild around named, practical, and future Others buckets

**Decision:** Regenerate the opening library from a backup-preserved seed inventory and classify included lines into named, practical, and future `Others` buckets at the data-model level before promoting any rebuilt dataset.

**Reason:** FirstMove needs broad real-world coverage without turning the library into a flat, messy list. Some branches should be authoritative named variations, some should be practical learner-facing branches, and some may be useful fallback branches that are worth storing now even if the app does not yet expose an `Others` section in the UI.

---

## 2026-04-20 - Use repo-side JSON export as the first opening-library backup format

**Decision:** Before regenerating the opening library, export the current repo dataset into timestamped JSON backup files under `scripts/output/backups/opening-library/`, with one opening-oriented export and one flattened line-oriented export.

**Reason:** The rebuild should not depend on live DB access to preserve the current library. A timestamped repo-side backup is simple, reviewable, diffable, and enough to protect the current opening families, line IDs, names, descriptions, and SAN sequences before the first generated replacement pass.

---

## 2026-04-20 - Use ChessDB as the first operational continuation source for regeneration

**Decision:** For the first full library regeneration, use `lichess-org/chess-openings` as the naming authority and `ChessDB` as the operational continuation source, with Stockfish validating the final candidate lines.

**Reason:** FirstMove needs a continuation source that is scriptable and usable now. The static Lichess naming dataset works well for authoritative names, but it does not provide sufficient line depth by itself. ChessDB is already close to the repo's existing workflow and can provide broad practical continuation candidates while the framework still controls inclusion, naming, and stopping decisions.

---

## 2026-04-20 - Treat popularity as ordering metadata, not an inclusion filter

**Decision:** Add popularity metadata to the regenerated opening library so openings and lines can later be sorted in the app by real game usage, but do not use popularity as the primary inclusion filter.

**Reason:** FirstMove should surface the most common openings and lines first, but a line can still be worth teaching even if it is less popular. Popularity is best used for ordering and emphasis, while inclusion should still follow the learner-focused framework.

---

## 2026-04-20 - Show main line first, then sort remaining lines by popularity

**Decision:** When an opening has a clear main line, pin that line first in the app and sort the remaining lines by popularity. If no clear main line exists, use popularity order only.

**Reason:** In chess, the main line is usually the standard theoretical reference branch, which is not always identical to the most-played branch in a given data slice. FirstMove should preserve that familiar learning anchor while still surfacing the most common practical branches immediately after it.

---

## 2026-04-20 - Classify difficulty at the line level first

**Decision:** Assign difficulty to every generated line first, then derive opening-level difficulty later from the opening's most representative study entry instead of inheriting old library labels.

**Reason:** Different branches inside the same opening family can vary dramatically in complexity. A quiet setup line and a forcing gambit line may both belong to the same opening but clearly do not belong to the same learner level. Line-first difficulty gives FirstMove a more honest basis for later filtering by opening level.

---

## 2026-04-21 - Normalize umbrella opening families before DB import

**Decision:** Insert a post-merge normalization pass before any database import. Promote clearly named subfamilies out of umbrella openings such as `Queen's Pawn Game`, `Indian Defense`, `Modern Defense`, and `King's Pawn Game`, then enforce the final per-opening line cap on the already-normalized families.

**Reason:** The source-first rebuild produces valid candidates, but some naming-source families are too broad to use directly in the app or database. Trimming those umbrella buckets before normalization would discard named branches that deserve to stand on their own. Promoting specific subfamilies first keeps the rebuilt library more coherent and makes the final `20`-line cap much less arbitrary.

---

## 2026-04-21 - Keep the full rebuilt library in DB and defer featured tiers until popularity is real

**Decision:** Prepare the rebuilt opening library for database import as a complete dataset, while exporting future `display_tier`, `is_featured`, and popularity metadata in sidecar payloads instead of guessing them now.

**Reason:** FirstMove should preserve the full opening library in the database even if the app only shows a curated subset by default. Real core/extended/other grouping depends on a trustworthy popularity pass that is not available yet in this environment. Exporting the metadata shape now keeps the future UI model ready without forcing fake popularity or a misleading featured list into the database today.

---

## 2026-04-21 - Add opening-library metadata columns before importing the rebuilt dataset

**Decision:** Add a dedicated migration for opening-library metadata before importing the rebuilt dataset. Store display-tier, featured, popularity, main-line, category, source, and line-difficulty fields directly on `openings_catalog` and `opening_lines`, then import from the rebuilt payload through a dedicated script rather than the older seed script.

**Reason:** The rebuilt library now carries more than names and SAN arrays. FirstMove needs stable metadata for future ordering, filtering, and UI presentation, and that metadata should live with the content in Supabase instead of remaining only in repo-side JSON. Preparing the migration and importer first keeps the import path explicit and reversible without touching live data until the user says to run it.

---

## 2026-04-21 - Treat rebuilt-library sync as upsert plus explicit stale-row pruning

**Decision:** Keep the rebuilt-library importer idempotent through upserts, and handle stale rows with a separate sync/prune step that compares the current payload to Supabase and removes rows that no longer belong to the rebuilt library.

**Reason:** Upserts keep repeated imports safe, but they do not delete older opening rows that were imported by previous datasets. Splitting prune behavior into a separate step keeps the import safe by default, while still giving FirstMove a reliable way to converge the database exactly onto the rebuilt library when the user is ready.

---

## 2026-04-23 - Replace the old continuation-import logic with variation-anchor practical branching

**Decision:** Supersede the earlier rebuild/import generation logic that extended named source lines mainly through a single continuation workflow. The new opening-line generation model should start from known named variation anchors, generate one main line per variation, and then create post-anchor teaching branches using human-popular opponent moves, best-practical responses, depth-aware branching limits, and payoff-based stopping.

**Reason:** The previous rebuild logic was strong at preserving naming authority and teaching-value stopping, but it still treated continuation generation too linearly for the product direction FirstMove now wants. The revised model preserves official opening structure while better matching how users actually learn openings: know the variation, recognize common opponent branches, and learn the practical conversion, punishment, setup, or strategic payoff inside that variation. This also makes it possible to keep a richer DB representation than the app may immediately show, while deprecating the older import algorithm as the active target going forward.
