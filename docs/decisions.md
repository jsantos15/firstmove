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

---

## 2026-04-27 - Retire the bundled core opening library in favor of Supabase-only opening content

**Decision:** Remove the old bundled `packages/core/src/openings` dataset and the scripts that fetched, applied, seeded, audited, or backed it up. Keep `@firstmove/core` focused on shared chess logic and shared types, while treating Supabase as the only active opening-library runtime source.

**Reason:** The app already reads openings from `openings_catalog` and `opening_lines`, and keeping the old bundled library alive created conflicting truths, stale generation scripts, and dead maintenance paths. Removing that branch makes the current architecture honest: openings live in Supabase, generation happens in `scripts/`, and `@firstmove/core` supplies logic and types only.

---

## 2026-04-27 - Replace the old six-category line model with the new four-category model

**Decision:** Supersede the earlier primary-category model (`setup`, `strategic`, `trap`, `gambit`, `punishment`, `forcing`) with the active Phase 1 model: `setup`, `strategic`, `tactical_payoff`, and `forcing`.

**Reason:** The newer generator and stopping model treat traps, gambits, punishments, and similar concrete payoffs as one practical family with the same stopping standard: keep going until the payoff is visible, then stop before deeper moves become mostly conversion. The four-category model is cleaner, matches the implemented generator, and removes the need to force tactical lines into multiple overlapping older buckets.

---

## 2026-04-27 - Replace ChessDB with authenticated Lichess Explorer for continuation sourcing

**Decision:** Use `lichess-org/chess-openings` as naming authority, authenticated `Lichess Explorer` as the human continuation source, and `Stockfish` as the trained-side move and validation source for the active generator.

**Reason:** The current FirstMove model needs practical human continuation data, not generic engine-tree depth. Lichess Explorer provides popularity, node sample counts, and the real practical opponent-move model that the stopping and continuation policies now rely on. ChessDB no longer matches the active generation algorithm and was removed from the live pipeline.

---

## 2026-04-27 - Standardize opening-generation scripts on `scripts/.env`

**Decision:** Treat `scripts/.env` as the canonical environment file for opening-generation, payload-preparation, and Supabase import/sync scripts. Allow `apps/web/.env.local` as a compatibility fallback, but keep script auth and service-role configuration centered in `scripts/.env`.

**Reason:** The active opening pipeline now depends on both a Lichess personal API token and Supabase service-role credentials. Keeping those script-only secrets in `scripts/.env` decouples generation/import tooling from the web app runtime and gives future sessions one stable place to look when the opening pipeline needs to run.

---

## 2026-04-27 - Keep fresh schema bootstrap aligned to the active opening category model

**Decision:** Bake the active opening-line category set directly into `packages/supabase/migrations/005_opening_library_metadata.sql` instead of relying on a later corrective migration. A fresh database should land immediately on `setup`, `strategic`, `tactical_payoff`, and `forcing`.

**Reason:** The project now treats the old six-category model as retired, not transitional. Keeping the initial metadata migration aligned to the live generator avoids reintroducing obsolete categories during a clean bootstrap and keeps the repo honest about what the active database schema is supposed to be.

---

## 2026-04-28 - Tune opening continuation confidence for rare named branches

**Decision:** Lower the opening generator's default Lichess node confidence floor from `500` games to `250` games, while still allowing an already-visible payoff to satisfy the stop guard when material plus eval, strong material, or clear compensation is present.

**Reason:** Auditing the Italian Game and Caro-Kann payload showed that `500` was too conservative for rare but useful named branches. Lines with only a handful of games should still stop as reference continuations, but nodes in the 250-400 game range often had enough practical signal to continue toward a teachable endpoint instead of stopping before the payoff was visible.

---

## 2026-04-28 - Preserve parent named-node teaching lines alongside main-line references

**Decision:** Treat source entries labeled as `Main Line` as reference theory rows without generated extension, and generate practical teaching continuations from non-main named variation nodes. Rank generated tactical and forcing teaching lines ahead of deeper reference leaves during merge and normalization so parent gambit and attack nodes are not hidden by later main-line entries.

**Reason:** Auditing the Evans Gambit showed that deeper named main-line rows can otherwise replace earlier gambit nodes in the final capped payload. FirstMove needs both: main-line reference theory and practical payoff lines from the point where a named variation starts, especially when common opponent moves create large teaching opportunities.

---

## 2026-04-28 - Remove the default DB normalization line cap

**Decision:** Stop applying a default per-opening cap during opening-candidate normalization. Keep all generated named-node and reference lines in the database payload unless an explicit `--max-lines-per-opening` cap is passed for review exports.

**Reason:** A hard `20`-line database cap hid valuable parent teaching lines in dense openings such as the Italian Game. FirstMove should generate and store broader coverage, then use app-side ranking and filtering to decide which subset is visible to learners.

---

## 2026-05-22 - Use Lichess Open Puzzle Database as the puzzle content source

**Decision:** Source all puzzle content from the Lichess Open Puzzle Database (https://database.lichess.org/#puzzles), imported into the FirstMove Supabase `puzzles` table via `scripts/import-puzzles.cjs`. Do not use Chess.com puzzles (proprietary, no bulk API) or build a manual puzzle set.

**Reason:** The Lichess database contains 5.9 million rated puzzles under CC0 (public domain), tagged with tactical themes and ECO opening codes. This gives FirstMove unlimited puzzle content, difficulty tiers derived from Lichess ratings, and the opening-tag data needed to power Opening Track screens without manual curation. The import script is idempotent (upsert on puzzle_id), filterable by rating/theme/opening, and mirrors the existing opening import pattern so no new infrastructure is needed.

**Difficulty bands:** rating < 1200 = beginner, 1200–1599 = intermediate, 1600+ = advanced. These map to the existing `opening_difficulty` enum.

**Import process:** Download CSV from database.lichess.org → decompress → run `node scripts/import-puzzles.cjs --input <path>` with any desired filters.

---

## 2026-06-01 - Drive opening popularity and track stages from Lichess Explorer

**Decision:** Add a `scripts/fetch-opening-popularity.cjs` script that queries the Lichess Opening Explorer for each `opening_lines` row's final position, stores the game count as `popularity_games` on `opening_lines`, ranks lines within each opening as `popularity_rank`, and aggregates totals to `openings_catalog`. Also computes `preview_fen` from the main line for card thumbnails. The Learn screen and Opening Track screen now read from Supabase exclusively — all mock data removed from those screens.

**Reason:** The Learn screen needed real ordering (most-played openings first, not a hardcoded list). The Opening Track screen needed a dynamic node count driven by how many popular variations each opening actually has in the DB, rather than a hardcoded 18-node Caro-Kann template. Lichess Explorer is already the sourcing authority for opening continuations; using it for popularity counts keeps the data consistent and avoids a separate analytics dependency.

**How to run:** `node scripts/fetch-opening-popularity.cjs` (needs `scripts/.env` with `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `LICHESS_API_TOKEN`). Supports `--force` to re-fetch all lines and `--opening <slug>` to update a single opening.

---

## 2026-06-07 - Split opening index from generated course details

**Decision:** Use `lichess_opening_popularity` as the lightweight opening-index source for web and mobile list screens, sorted by `popularity_games`. The index returns opening name, ECO, anchor FEN/SAN, game count, variation count, and nullable generated-course metadata from `openings_catalog`. Full `opening_lines` rows, reference lines, punish lines, and SAN arrays are loaded only after a generated course is selected.

**Reason:** The Openings screen should list the complete popularity-ranked opening catalog without downloading every generated line. The Lichess popularity table now contains broad opening coverage even before FirstMove has generated lessons for every opening. Separating index data from course-detail data lets the apps show all openings immediately, mark unavailable courses as coming soon, and keep mobile/network payloads small.

**Implementation note:** Migration `011_opening_index_view.sql` defines `public.opening_index` as the preferred one-query source. The shared `getOpeningIndex()` helper falls back to the base tables so the apps still work before the view is applied.

---

## 2026-06-07 - Hide broad opening bucket names from the learner index

**Decision:** Exclude broad Lichess naming buckets such as `King's Pawn Game`, `Queen's Pawn Game`, `Zukertort Opening`, and `Indian Defense` from the learner-facing opening index. Dedupe repeated opening names by keeping the most popular anchor. Do not exclude all one-move openings: named openings such as English Opening, Bird Opening, Nimzo-Larsen Attack, and Polish Opening remain eligible.

**Reason:** The excluded names are useful taxonomy containers, but they are too generic to present as opening courses. FirstMove should teach recognizable opening families and defenses rather than broad move-order buckets. An explicit denylist is safer than filtering by move depth, because some legitimate openings are defined by one move while some generic buckets are two moves.

---

## 2026-04-28 - Store per-ply opening evals for practice navigation

**Decision:** Store Stockfish centipawn evaluations for every ply in an opening line as `opening_lines.eval_cp_by_ply`, using White-perspective values regardless of whose turn it is. Keep `final_eval_cp` aligned to the last per-ply value.

**Reason:** A practice-board eval bar should update as the learner navigates through the line, not only summarize the final position. Stockfish/UCI reports scores from the side-to-move perspective, so normalizing to White perspective at generation time gives the app a standard, stable eval-bar convention.
