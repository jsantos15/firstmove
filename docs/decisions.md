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

## 2026-04-28 - Store per-ply opening evals for practice navigation

**Decision:** Store Stockfish centipawn evaluations for every ply in an opening line as `opening_lines.eval_cp_by_ply`, using White-perspective values regardless of whose turn it is. Keep `final_eval_cp` aligned to the last per-ply value.

**Reason:** A practice-board eval bar should update as the learner navigates through the line, not only summarize the final position. Stockfish/UCI reports scores from the side-to-move perspective, so normalizing to White perspective at generation time gives the app a standard, stable eval-bar convention.

---

## 2026-04-29 - Add a template-first opening coach layer

**Decision:** Implement FirstMove's initial move coach as a deterministic web-side handler that combines expected-line moves, per-ply Stockfish evals, trained-side color, and line category metadata into short coaching messages. Define the full move-classification vocabulary up front (`book`, `setup`, `forcing`, `payoff`, `best`, `excellent`, `good`, `inaccuracy`, `mistake`, `blunder`, `miss`, `wrong`, `complete`) while only emitting labels that the current opening-line data can honestly support. Keep the handler separate from the board component and use browser text-to-speech as an optional playback layer.

**Reason:** Stockfish supplies engine facts, not human coaching text. A small template-first layer fits the opening-practice product better than importing a generic game-review tool, keeps messages predictable for learners, and leaves room to replace or enrich the explanation source later without rewiring the board.

## 2026-04-29 - Prepare coach narration for AI without depending on live AI

**Decision:** Expand the coach move vocabulary toward a Chess.com-style analysis set by adding `brilliant` and `great`, while keeping opening practice conservative about when those labels are emitted. Add an AI-ready narration payload containing opening, move, classification, line category, trained-side eval before/after, and style constraints. Keep phrase samples versioned in app code for now; later Supabase should cache final generated messages by stable move/position/context key rather than act as the editing source for first-pass templates.

**Reason:** The coach should eventually explain more than openings, but live AI calls are paid, slower, and less deterministic. A structured payload lets a future model write friendlier text from facts supplied by FirstMove, while deterministic local narration and cached generated messages keep the current app reliable and inexpensive.

## 2026-05-15 - Generate dense per-ply eval timelines for opening lines

**Decision:** Build `opening_lines.eval_cp_by_ply` as a dense timeline during generation. Store index `0` as the starting board eval and every later index as a White-perspective centipawn value after that ply. Keep evals already produced by the accepted reference checkpoint or practical branch path, then replay only missing plies before writing output. Set `final_eval_cp` from the last timeline value and keep `final_eval_perspective = white`.

**Reason:** The practice eval bar must be deterministic and should not depend on browser-side engine calls or sparse trace metadata. Reusing evals that generation already computed avoids unnecessary engine work, while the final gap-fill pass keeps reference and practical-branch rows consistent even when the original move came from Lichess cloud, Chess-API, cached best-known evals, or local Stockfish fallback.

## 2026-05-03 - Resolve opening names by position index, not PGN scanning

**Decision:** Add a Supabase-backed `opening_positions` index generated from `lichess-org/chess-openings`, keyed by normalized FEN position. Opening practice and future game analysis views should batch lookup position keys and then display the latest matched opening name as the user navigates moves.

**Reason:** FirstMove is expected to grow from opening practice into general game analysis. Matching by position handles transpositions and avoids scanning opening PGNs on every move. Keeping the index in Supabase preserves the runtime source-of-truth rule while letting clients memoize only the current game's lookup results.

## 2026-05-04 - Keep Lichess cloud eval as resumable post-generation audit

**Decision:** Generate opening reference lines locally first, then audit generated continuation decisions with `scripts/audit-opening-lines-lichess-cloud.cjs`. The cloud audit uses a 5-second default delay, writes a cache for every cloud result or miss, saves the audit output after every target, resumes by default, and stops auditing downstream positions in a line after the first cloud override because the old downstream positions no longer belong to the regenerated line.

**Reason:** Lichess cloud eval is useful as a deeper authority when available, but it is rate-limited and not guaranteed for every position. Keeping cloud usage in a resumable audit step lets FirstMove cover all generated lines over a long run without making the main local generator dependent on cloud availability. When cloud changes a move, the correct next step is to regenerate that line from the changed move, not patch one move inside an already generated sequence.

## 2026-05-04 - Allow cloud-authoritative reference generation as an explicit long run

**Decision:** Add `--cloud-eval-mode authoritative` to `scripts/generate-opening-candidates.cjs` for reference-line generation runs where Lichess cloud eval is the preferred move authority for both sides. In this mode the generator uses cloud best moves when available, falls back to local Stockfish depth 18 when cloud has no usable position result, saves the output after every completed line, reuses the cloud cache, and writes a `paused` payload before exiting if Lichess returns `429`.

**Reason:** For rebuilding a small focused opening such as the Italian Game, a long resumable cloud-first run is acceptable when the goal is maximum cloud alignment rather than fast local reproducibility. Local Stockfish fallback keeps rare cloud misses from blocking the line, while `429` still pauses the run so the project does not keep hammering Lichess after a rate-limit signal.

## 2026-05-06 - Full opening generation pipeline algorithm

This entry is the canonical reference for the complete opening-line generation pipeline. Future sessions should read this before touching any generation script.

---

### Overview

The pipeline has five stages:

```
generate → dedup → prepare → import → sync
```

Each stage is a separate script. No stage is skipped. Output from each stage can be inspected before the next runs.

---

### Stage 1 — Generate (`scripts/generate-opening-candidates.cjs`)

**Source data:** `lichess-org/chess-openings` TSV files (a–e). Each row is an ECO code, a full opening name, and a PGN. The script fetches them fresh from GitHub at runtime.

**Entry filtering — two independent guards, both must pass:**

1. `--starts-with <name>` — keeps only entries whose opening name starts with the given string (e.g. `"Italian Game"`). This is a text match on Lichess's naming.
2. `--san-prefix <san1,san2,...>` — keeps only entries whose actual move sequence starts with the given SANs (e.g. `"e4,e5,Nf3,Nc6,Bc4"` for Italian Game). This is required because Lichess names some transposition lines under the wrong opening family (e.g. Scotch Gambit lines named "Italian Game: ..."). Without this guard, wrong-anchor lines slip through.

Both filters are mandatory for any opening run. The `--san-prefix` is the opening's defining moves.

**Known san-prefix values:**
| Opening | `--starts-with` | `--san-prefix` |
|---|---|---|
| Italian Game | `Italian Game` | `e4,e5,Nf3,Nc6,Bc4` |
| Caro-Kann Defense | `Caro-Kann` | `e4,c6` |

**Line generation — per source entry:**

Each filtered Lichess entry becomes a "variation anchor" — the named position where the variation begins. The generator then extends the anchor into a full teaching line:

1. Start from the anchor FEN (last position of the source PGN)
2. Fetch cloud or local Stockfish eval for the position
3. Pick the best reference continuation move from the engine, regardless of which side is to move
4. Repeat best-play engine continuation for both sides
5. Repeat until a stopping rule fires

Reference generation does **not** use Lichess Explorer for opponent replies. Explorer-backed human-popular opponent choices belong to future practical branch generation, not current reference lines.

**Shared reference stopping model:**

- Category labels (`setup`, `strategic`, `tactical_payoff`, `forcing`) do not affect reference-line stopping.
- Minimum added plies must be met (`--reference-min-added-plies`, default 2), unless the total line has already reached the soft reference length.
- A mature checkpoint must look like a stable tabiya: low tactical volatility or clear material/compensation, visible plan/development/castling/eval shape, no critical trained king safety, no only-move pressure, no narrow/critical top-move gap, and stable eval.
- If a mature checkpoint is found, it is stored as a rollback candidate.
- If the line reaches a cap, the generator rolls back to the best mature checkpoint found earlier.
- If no mature checkpoint exists, the line stops at the cap and marks the endpoint as a weaker fallback.

**Reference caps:**

- `--reference-soft-total-plies` (default 22): preferred endpoint area.
- `--reference-hard-total-plies` (default 28): force a stop unless the position is still unusually forcing.
- `--reference-exception-total-plies` (default 32): hard reference cap.
- `--max-added-plies` (default 20): maximum continuation after the anchor.
- `--max-total-plies` (default 40): emergency absolute cap.

**Cloud eval router (`scripts/lib/cloud-eval-router.cjs`):**

Engines are tried in priority order: `lichess → chess-api`. Rules:

- **Preferred engine per line:** each new line starts from the next available cloud engine.
- **No-data cascade:** if the preferred engine has no cloud eval for a specific position, try remaining engines for that position only (not a full line restart). This covers coverage gaps, not rate limits. Lines may therefore be marked `mixed` when coverage requires multiple providers.
- **429 → full line restart:** if the locked engine returns 429 (rate limited), mark it as cooling (30-min cooldown), restart the current line from its anchor using the next available engine.
- **Cooldown recovery:** `getNextAvailableEngine()` is called at the start of each new line. After 30 minutes the cooled engine becomes eligible again automatically.
- **Fallback:** if all cloud engines are cooling or have no data, fall through to local Stockfish (depth 18).

**Output fields per line (key ones):**

- `generatedSans` — the full teaching line as a SAN array (this is what gets stored in the DB and shown to users)
- `variationAnchorSans` — the source anchor moves (subset of `generatedSans`)
- `finalEvalCp` / `finalEvalPerspective` — centipawn eval at the last position, white-perspective
- `engineProvider` — which engine generated the continuation (`lichess`, `chess-api`, `stockfish`, `mixed`)
- `avgExtensionDepth` — average depth of cloud evals used during extension plies
- `generation.stopReason` — why the line stopped

**Output files:** `scripts/output/generated-opening-candidates-<opening>-cloud-reference.json`

**Resumability:** pass `--resume` to skip already-processed source names and continue from where a previous interrupted run left off. The script writes a checkpoint after every `--checkpoint-every` lines (default 10).

**Example invocation:**

```
node scripts/generate-opening-candidates.cjs \
  --starts-with "Italian Game" \
  --san-prefix "e4,e5,Nf3,Nc6,Bc4" \
  --output scripts/output/generated-opening-candidates-italian-game-cloud-reference.json \
  --cloud-eval-mode authoritative \
  --resume
```

---

### Stage 2 — Dedup (`scripts/dedup-opening-candidates.cjs`)

**Problem it solves:** Some shorter lines are strict prefixes of longer lines in the same opening. A learner studying the longer line already learns the shorter one — keeping both creates redundant practice and confuses the variations panel.

**Rule:** For each pair of lines in the same opening, if line A's `generatedSans` is a strict prefix of line B's `generatedSans` (A is shorter, all A's moves match B's start), remove A.

**Chain handling:** if A ⊂ B ⊂ C, both A and B are removed. Only C is kept.

**Usage:**

```
# Preview first
node scripts/dedup-opening-candidates.cjs --input <file> --dry-run

# Apply
node scripts/dedup-opening-candidates.cjs --input <file>
```

Overwrites the input file by default. Pass `--output <file>` to write elsewhere.

---

### Stage 3 — Prepare (`scripts/prepare-opening-db-payload.cjs`)

Transforms the generator JSON into DB-ready row shapes. No network calls. Pure transformation.

- Resolves duplicate line display names (appends a disambiguating suffix)
- Generates stable slug IDs for every line
- Infers opening color, difficulty, tags, and description
- Builds exact row shapes for `openings_catalog` and `opening_lines` tables
- Outputs a structured payload JSON with `currentSchema`, `seedPayload`, and sidecar metadata

**Usage:**

```
node scripts/prepare-opening-db-payload.cjs \
  --input scripts/output/generated-opening-candidates-<opening>-cloud-reference.json \
  --output scripts/output/opening-db-payload-<opening>.json
```

---

### Stage 4 — Import (`scripts/import-opening-db-payload.cjs`)

Upserts the prepared payload into Supabase. Adds or updates rows; never deletes.

- Writes opening catalog row
- Writes all line rows with eval, generation metadata, and engine info
- Idempotent — safe to run multiple times on the same payload

**Usage:**

```
node scripts/import-opening-db-payload.cjs --input scripts/output/opening-db-payload-<opening>.json
```

---

### Stage 5 — Sync (`scripts/sync-opening-db-payload.cjs`)

Prunes stale rows from Supabase — lines that existed from a prior import but are no longer in the current payload (removed, renamed, or deduplicated).

- `--scope-payload-openings` restricts pruning to only the openings present in the payload (safe — does not touch other openings)
- `--apply` required to actually delete; omit for a dry-run report

**Usage:**

```
node scripts/sync-opening-db-payload.cjs \
  --input scripts/output/opening-db-payload-<opening>.json \
  --scope-payload-openings \
  --apply
```

---

### Full pipeline for a single opening

```
node scripts/generate-opening-candidates.cjs --starts-with "..." --san-prefix "..." --output ... --cloud-eval-mode authoritative --resume
node scripts/dedup-opening-candidates.cjs --input ...
node scripts/prepare-opening-db-payload.cjs --input ... --output ...
node scripts/import-opening-db-payload.cjs --input ...
node scripts/sync-opening-db-payload.cjs --input ... --scope-payload-openings --apply
```

### Full pipeline orchestrator

For known opening reruns, `scripts/run-opening-reference-pipeline.cjs` wraps the five-stage flow without replacing any stage:

```
node scripts/run-opening-reference-pipeline.cjs --openings italian-game,caro-kann --apply-sync
```

- Runs `generate → dedup → prepare → import → sync` for each selected opening.
- Uses the known `--starts-with` and `--san-prefix` values from this decision log.
- Overwrites generated JSON and prepared payload files for the selected openings.
- Before overwriting a generated JSON file, snapshots the previous results and writes a diff report after dedup to `scripts/output/opening-reference-diff-<opening>.json`; terminal output lists changed/added/removed counts and the first changed lines to review.
- Requires either `--openings <list>` or `--all` so imports are never started by an accidental no-arg run.
- Refuses to continue past generation unless the generated JSON status is `complete`.
- Supports `--start-at generate|dedup|prepare|import|sync` for restarting after a failed later stage.
- `--apply-sync` is required for stale-row pruning. Without it, sync runs as a dry-run.
- `--resume` can be passed for interrupted generation runs, but fresh regeneration should omit it.

---

## 2026-05-05 - Store opening reference generation metadata in Supabase

**Decision:** Add `opening_lines.engine_provider`, `engine_model`, `avg_engine_depth`, and compact `generation_metadata` so imported reference lines preserve which engine source generated the continuation, the average continuation depth, source counts, anchor metadata, and stop diagnostics.

**Reason:** The app runtime source of truth is Supabase, so generated JSON artifacts should not be the only place that explains how a reference line was produced. Keeping compact generation metadata on each line makes future audits, UI filtering, and debugging possible without re-reading local output files.

---

## 2026-05-06 - Use one stopping model for all generated reference lines

**Decision:** Reference-best-play generation must use one reference/tobiya stopping model regardless of the line's tactical, strategic, setup, or forcing classification. The category-specific completion rules remain available only for future practical-human branches.

**Reason:** Reference lines are engine/reference continuations, not tactic-type lessons. Applying category-specific payoff rules caused some reference lines to chase tactical resolution unnecessarily and then stop at continuation caps. A shared tabiya endpoint model keeps reference lines consistent and lets cap fallbacks roll back to the best mature checkpoint instead of ending on a forced-looking final move.

---

## 2026-05-07 - Short-horizon review before accepting reference endpoints

**Decision:** Cloud-authoritative reference generation should not stop immediately at the first acceptable mature checkpoint. The first acceptable checkpoint becomes a candidate, then the generator checks a short horizon for a clearly better endpoint. Reference signals also flag unresolved capture decisions, where the engine's best move is a capture but playable non-capture alternatives remain; those positions should continue at least briefly instead of ending one move before the choice is resolved.

**Reason:** An endpoint can be technically acceptable but still poor for teaching if the next move resolves an obvious practical question, such as whether a side should capture or maintain tension. A short-horizon review keeps lines from overextending while avoiding premature endings like stopping immediately before a best capture.

**Update:** Reference endpoints also penalize pending recaptures: if the last move was a capture and the next engine move is a forced-looking recapture, that position is treated as a poor endpoint and should continue briefly or lose to a cleaner rollback checkpoint.

**Update:** Reference endpoints also score small material debt lower. If the trained side is down one pawn before ply 18, the line should continue rather than accepting a low-value early endpoint. After ply 18, the short-horizon review may use a bounded material-recovery window so the line can prefer a nearby endpoint where the pawn is recovered, provided the recovered position also satisfies the normal mature-checkpoint rules.

**Update:** Positions rejected by tactical reference-quality guards are not allowed to become rollback checkpoints. This prevents cap fallback from restoring an endpoint that was correctly rejected earlier, such as stopping at `5. d3` when `...exd3` is the next best capture. Early one-pawn-debt positions are different: they should not be accepted as direct stops before ply 18, but they may still be kept as lower-ranked rollback checkpoints so a later cap does not force a worse tactical endpoint.

**Update:** The hard reference cap may use the exception window when the current position is explicitly non-stoppable because an unresolved capture decision or pending recapture remains. This lets the generator play the next resolving move, up to the absolute exception cap, instead of ending one ply before the position becomes understandable.

**Update:** The generated-continuation cap (`maxAddedPlies`) follows the same principle for reference lines: if the current position is explicitly non-stoppable because of an unresolved capture decision or pending recapture, the generator may continue beyond `maxAddedPlies` until the issue resolves or the absolute exception cap is reached.

---

## 2026-05-07 - Preserve best cached engine data across reference reruns

**Decision:** Reference generation should treat cached cloud results as higher-authority move data even when that engine is currently cooling down. For each position, the generator checks cached Lichess cloud eval first, cached Chess-API eval second, then live cloud engines, then persistent local Stockfish fallback. Stockfish fallback results are written to `scripts/output/stockfish-eval-cache.json`, and cached cloud misses expire after a TTL so later reruns can fill positions that previously had no cloud data.

**Reason:** Rerunning the same algorithm should refine or preserve existing line quality, not downgrade a known cloud-backed move to a lower-depth fallback because the cloud provider is temporarily unavailable. Keeping a move-by-move cache ladder lets future reruns reuse the best available result and gradually replace fallback positions when higher-authority cloud data becomes available.

**Update:** Add a unified best-known eval cache at `scripts/output/best-known-eval-cache.json`. It stores one best result per normalized FEN position, ranking Lichess cloud above Chess-API above local Stockfish, and preferring deeper results within the same provider. The normal import stage also upserts this cache into Supabase table `opening_position_evals` when migration `011_opening_position_evals.sql` has been applied, so DB state improves as generation discovers higher-quality moves.

**Pointer:** The stable handoff document for the current reference-line algorithm is `docs/reference-line-generation.md`. If the generator script is renamed, replaced, or split later, update that file in the same change so future sessions can see how the app's reference lines were created.

## 2026-05-08 - Keep practical branch generation separate from reference generation

**Decision:** Add `scripts/generate-opening-branches.cjs` as a separate Phase 2 step that reads completed reference artifacts, scans opponent-to-move positions after the variation anchor, uses Lichess Explorer to find common deviations from the reference move, and then uses Stockfish to keep only deviations with a teachable trained-side eval gain. The output is a combined reference-plus-branch generated artifact so the existing prepare/import/sync path can import branches without replacing reference lines.

**Reason:** Reference lines teach best play from the named opening position, while branches teach the response to likely human deviations. Mixing those concerns back into reference generation would make reference endpoints harder to reason about and risk over-expanding every bad move. A separate branch step lets FirstMove prioritize moves that are common enough, distinct from the reference continuation, and engine-validated as practical punishments or strategic improvements.

**Update:** Practical branch generation is now a separate additive pipeline: `generate-opening-branches.cjs` -> `dedup-opening-branches.cjs` -> `prepare-opening-db-payload.cjs` -> `import-opening-db-payload.cjs`, wrapped by `run-opening-branch-pipeline.cjs`. Branches are generated from any opponent-to-move position after the variation anchor, follow top human Explorer moves inside a cumulative popularity window that tightens as depth increases, and use the same trained-side engine ladder as reference generation: best-known cache, cached Lichess cloud, cached Chess-API, live cloud with cooldown, then local Stockfish fallback. The default cap is 10 practical branches per variation, with a best-available fallback branch when no preferred checkpoint is found.

**Update:** Branch rows stay in `opening_lines` with `line_kind = 'practical_branch'` because they are practiceable lines. Branch-specific data lives in `opening_line_branch_metadata`: parent line, branch key, trigger move, reference move, node/move games, play rate, cumulative play rate, eval before/after, final trained-side eval, branch score, structured continuation trace, and selection metadata. Local JSON artifacts remain review/debug outputs before DB import; Supabase is the durable runtime source after import.

**Update:** Branch generation supports top-up runs with `--only-under-branch-count`, `--target-branches-per-variation`, and `--max-new-branches-per-variation`. This lets repeated executions focus only on variations that still have too few practical lines instead of regenerating every variation. Existing branch keys are skipped, and dedup keeps the best duplicate candidate by branch score.

**Update:** Practical branch endpoints use shared branch-only completion guards before category-specific acceptance. A branch cannot stop while the current position still has an unresolved forcing sequence or material conversion: the last trained-side move gives check and the opponent has not answered, the next best move is forcing, a capture or recapture is pending, or a capture sequence has produced a large eval gain without material or forcing stability. Normal branch depth caps do not accept these unfinished checkpoints; the generator must continue beyond the normal branch cap until the forcing/material condition is resolved, checkmate/stalemate ends the line, or there is no legal/engine move to play.

**Update:** Trained-side branch generation may scan engine-sound alternatives instead of always forcing the top engine move. For each human-popular opponent trigger, the generator can test up to the top 3 trained-side MultiPV moves within 60cp of the best move, continue each candidate against the same Lichess Explorer opponent policy, and keep every resolved candidate that reaches at least +200cp for the trained side. If no trained-side alternative creates that winning practical outcome, the branch falls back to the normal engine-best continuation and keeps searching later trigger positions. The variation-level cap still applies after all candidates are scored, so the default imported set remains the top 10 practical branches by branch score.

**Update:** Forced resolution moves are a narrow exception to the normal opponent popularity floor. If a branch is inside an unresolved forcing or material-conversion state and the opponent's Explorer node is below the usual sample threshold, the generator may still play the top legal Explorer reply, or the engine reply if Explorer has no legal reply, so the branch can finish the teaching payoff instead of being cut off by sample-count limits.

**Update:** Practical branch selection ranks by final trained-side eval first, even when the highest-payoff line cannot satisfy the normal clean endpoint guards before the search/closing cap. The generator now tracks the best high-eval payoff reached during each candidate search, including opponent-move endpoints, and can keep that line as a `payoff_cap` fallback. This prevents strong practical punishments from being discarded only because unresolved forcing/material guards never found a formally clean checkpoint.

**Update:** A reference variation should not be left with zero practical branches when positive human-deviation candidates exist. If normal branch search finds no accepted branches for a variation, the generator runs a positive fallback pass across all candidates and keeps every fallback line at or above +100cp, plus up to 3 additional positive lines below +100cp, still bounded by the variation-level branch cap.

**Update:** Practical branch discovery must start at the trained-side move immediately after a variation anchor when the anchor itself ends with an opponent move. The opponent anchor move is treated as a branch trigger so candidate trained replies can compete by engine value from the true first teachable position, instead of forcing the reference continuation's next trained-side move before branch search begins.

**Update:** Practical branch search should not keep lines after they transpose into another reference variation anchor. Exact duplicate practical branches are deduped globally by generated SAN sequence, but reference-anchor transpositions are now stopped during search so ownership moves to the more specific variation instead of duplicating the same teachable line under an earlier parent.

**Update:** The practice-board eval bar must not depend on live browser calls to external engine APIs. Runtime eval display should use imported line-level `eval_cp_by_ply` first, then FirstMove's own `opening_position_evals` table keyed by normalized FEN. If neither source has a value, the UI keeps the reserved eval-bar shell neutral instead of calling Lichess from the client.

**Update:** Terminal checkmate and draw positions are valid branch endpoints even though they have no legal best move. The branch generator's terminal analysis may use `bestMove: "(none)"`; scoring must still trust that analysis when its normalized FEN matches the current board. This lets unresolved forcing lines continue through the forced reply and finish on the actual mate or draw endpoint instead of keeping the previous checking move as a `payoff_cap` fallback.

**Update:** After a branch has reached a strong trained-side advantage, the search still narrows to the top engine continuation by default, but it must also keep bounded material-recovery candidates. A checked trained move that directly attacks recoverable opponent material may stay in the candidate set when it is within the material-recovery eval-loss window, even if it is outside the normal trained-candidate loss threshold. This gives high-payoff material-recovery lines a chance to close cleanly instead of being filtered out by a tiny engine-ordering difference.

**Update:** High final trained-side eval is the primary branch-selection signal. Clean endpoint guards are still preferred, but `payoff_cap` is allowed to preserve any line that reaches the practical-opportunity eval floor after the minimum post-trigger search distance, even when the search did not find a fully resolved stopping point. This includes positions where the trained side still has unresolved forcing or material conversion. Material resolution, visible threats, and fork checks improve endpoint quality, but they must not be required before keeping a high-eval practical branch.

**Update:** Near-tied trained-side candidate replies should not disappear just because the bounded search cannot close their continuation. When the generator explicitly searches a non-top trained candidate from the trigger position, that first trained response may be kept as a short `payoff_cap` if it already reaches the practical-opportunity eval floor and no longer clean branch survives. Longer continuations still supersede strict-prefix fallbacks, but distinct high-eval first responses remain eligible for the top branch set.

**Update:** Practical branch search must keep multiple high-eval `payoff_cap` fallback lines per trigger search, not only the single highest fallback. A single fallback slot lets one forcing line erase other high-value sibling ideas before the normal top-branch ranking step can compare them. Fallbacks are deduped by exact SAN line and then pass through the same final eval-first selection as clean checkpoints.

**Update:** Practical branches under the same parent variation must not include strict-prefix duplicates. If one branch PGN is fully contained at the start of a longer branch for the same parent line, keep only the longer branch because the shorter row does not teach a distinct decision. Branch names should also be unique within a parent variation; if the generated title motif collides, append a short continuation suffix. Once a branch has reached a trained-side advantage, opponent continuation should still consider the bounded popular-move set unless the current state specifically needs forced tactical/material resolution; otherwise common second replies such as a 25%+ Explorer move can be incorrectly skipped.

**Update:** Do not use the same eval threshold for "worth teaching" and "stop exploring." `trainedOpportunityMinEvalCp` remains the lower practical-opportunity floor for keeping positive branches, while `advantageLockMinEvalCp` is a higher threshold for treating the trained-side advantage as settled enough to narrow trained-side continuations. This prevents positions that are already around +200cp at or near the anchor from suppressing useful branch discovery.

**Update:** Dedup may collapse mate-equivalent practical branches, but only under a narrow same-parent rule. If two practical branches under the same reference variation have the same length, finish with the same checkmate move, and differ by exactly one checking move immediately before the forced mate tail, keep one branch by endpoint quality, branch score, play-rate confidence, then stable SAN order. This cleanup is intentionally limited to checkmate lines; non-mate branches that differ by one move can still teach different decisions and should remain eligible for final eval-first ranking.

**Update:** Non-top trained-side candidate moves must justify themselves against the comparable top trained-side path. When a practical branch deviates from the engine-best trained move, the generator and branch dedup look for sibling branches under the same parent variation that share the exact prefix and play the rank-1 trained move at that same ply. The non-top deviation is kept only if its completed final trained-side eval is higher than the best comparable top-move sibling, even when the immediate engine eval loss is `0`. This preserves speculative trained deviations only when later human continuation creates a better practical outcome, and removes equal-outcome move-order alternatives that do not improve on the top move.

**Update:** High-eval `payoff_cap` fallbacks must not end immediately after the trained side gives check. A checking move with `pendingCheckReply` is unresolved unless it is actual checkmate, so the branch search must continue through the opponent reply or omit the unresolved fallback from the emitted branch set. This prevents mate-score alternatives such as a non-terminal checking queen move from being imported as if the forced sequence were complete.

**Update:** The trained-side deviation comparison applies across every non-top trained move in the branch, not only the first one. Any non-top move is removed if a comparable rank-1 sibling from the same position finishes at an equal-or-better final trained-side eval. If the comparable rank-1 sibling reaches checkmate, it dominates all non-top sibling moves from that same position, even if the non-top move is also mate-scored, because no practical branch can improve on an already forced mate.

**Update:** Practical branch display names must be unique within a parent variation after all pruning. When title motifs collide, the generator and branch dedup expand the continuation suffix until the names are distinct, then fall back to a stable line-id suffix only if the SAN tail still cannot disambiguate them. Repeated trailing parenthetical suffixes are collapsed before adding the final unique suffix so rerunning dedup does not compound duplicate labels.

**Update:** Practical branches under the same parent variation should not keep multiple move orders that transpose to the same final board. After exact-line, prefix, mate-equivalent, and trained-deviation pruning, the generator and branch dedup collapse same-parent branches with the same normalized final FEN. The retained branch prefers the better trained-side engine choice at the first differing trained ply, then falls back to final eval, endpoint quality, branch score, play-rate confidence, and stable SAN order.

---

## 2026-05-16 - Keep localized coach templates in source control

**Decision:** Add a shared `@firstmove/i18n` workspace package as the source-controlled home for locale config, message keys, fallback rules, and coach display/spoken templates. Coach feedback should be built from generic `CoachEvent` facts, stable keys, and named variables, with rendered text produced by the app for the active locale. The shared `CoachEvent` contract lives in `@firstmove/core` so opening practice, tactics, endgames, and future full-game analysis can all trigger text and speech through the same event system. Supabase stores generic `coach_events` facts such as domain, subject, ply, event type, tone, classification, severity, theme tags, variables, and analysis facts, but not translated prose.

**Reason:** FirstMove needs the coach to work consistently on web, iOS, and Android across multiple countries. Translation strings need PR review, version history, deploy-time consistency with the code that references them, and automated missing-key checks. Modeling the coach around events instead of moves keeps the foundation expandable: one move may emit zero, one, or many coach events, and the later game analyzer can explain blunders, missed tactics, only moves, strategic mistakes, and summaries without inventing a second narration model. Keeping display text and spoken text as separate templates also prepares the app for free native TTS first and cached generated audio later without coupling the coach model to one voice provider.

**Update:** Keep a single shared coach taxonomy in `@firstmove/core/src/coach` rather than separate taxonomies for openings, tactics, endgames, and full-game analysis. The `domain`, `phase`, `event_type`, and `theme_tags` fields describe where an event came from and what it means, while the same renderer can choose localized text and spoken output for any domain. Coach personality is modeled as a `persona` dimension (`friendly`, `neutral`, `strict`, `calm`, `hype`, `beginner`, `technical`) with template fallbacks, so FirstMove can add different writing styles and later different voice/audio caches without needing every event to have every persona variant on day one.

**Update:** Coach event producers should live in shared core modules, not inside platform apps. Opening practice now uses `@firstmove/core/src/coach/openingPractice` to classify expected and wrong moves into generic `CoachEvent`s, while `@firstmove/i18n` renders those events into localized display and spoken text. Future game analysis should follow the same split: analyzers produce events from engine/tactic facts, then the renderer handles persona, locale, and voice-ready text.

**Update:** AI-generated coach wording should remain optional enrichment rather than a live dependency for practice or analysis. The durable pipeline is still deterministic events first: engine/tactic/opening producers emit `CoachEvent`s with variables and analysis facts, the app renders source-controlled templates, and a future offline job may ask an AI model to produce reviewed/cached variants keyed by event type, locale, persona, content version, and fact hash. This keeps runtime fast, predictable, and inexpensive while leaving a path to richer Chess.com-style prose later.

**Update:** The coach taxonomy should be broad but controlled. The shared `CoachEventType` vocabulary now covers opening moves, evaluation swings, move-quality labels, tactical misses/finds, strategic themes, conversion/endgame moments, and phase/game summaries. Individual producers should emit only the events they can justify from available facts; for example, the first game-analysis producer can classify blunders, mistakes, inaccuracies, best/only moves, brilliant/great moves, missed wins, missed tactics, tactical finds, and advantage gains from engine and tactic-detector facts, while deeper strategic events such as weak squares, piece activity, and endgame conversion should wait for dedicated detectors.

**Update:** Web coach UI should consume rendered `CoachEvent` data as structured feedback, not just a plain message string. The opening practice coach bubble renders the localized label, title, tone, display text, and future spoken text from `@firstmove/i18n`, while `apps/web/lib/coachFeedback.ts` exposes the same render path for game-analysis facts. This keeps the UI contract stable as the coach expands from opening practice to full-game analysis.

**Update:** Coach persona selection starts as a web-local practice setting stored in localStorage and passed into opening-practice event producers. This exercises the same persona dimension that future analysis and voice output will use while avoiding premature profile persistence; profile-backed preferences can later hydrate the same setting shape.

**Update:** Game-analysis coach adapters should accept engine snapshots in a single documented convention: centipawn evaluations are passed from White's perspective, and the adapter normalizes them into the played side's perspective before computing centipawn loss, centipawn gain, missed opportunity size, and coach events. This keeps analyzer producers from duplicating move-quality math and makes web/mobile render the same event contract.

**Update:** The web app now exposes an `/analysis` preview path that renders fixed engine-analysis samples through the real game-analysis coach adapter and shared `CoachBubble`. This is a UI integration proof for the analysis coach contract, not the final game analyzer; the next production step is to replace sample snapshots with a real PGN/eval timeline source.

**Update:** The analysis coach input model now starts at an `AnalyzedGame` object: game id, optional PGN/FEN metadata, and a move timeline containing SAN, ply index, played side, phase, White-perspective evals after the played and best moves, best-move SAN, and detector flags. Core converts that game timeline into coach events, and web renders from the same shape, so the future PGN parser and engine runner have one target contract instead of feeding page-specific snapshots.

**Update:** Analysis coach generation now has an explicit candidate layer. Engine and detector facts are normalized into move facts, candidate teaching events are matched and ranked by priority/teaching weight, then the selected events render through the same localized coach templates. Coach events may also carry generic evidence (`line`, `single_move`, `square`, `piece`, or `plan`) so the UI can show a refutation, better line, strategic square, piece route, or plan without coupling evidence to only mistakes.

**Update:** The first chess-state detector pass uses optional `beforeFen` plus the played SAN to derive reliable board facts with `chess.js`: origin square, target square, moved piece, captured piece, capture, check, checkmate, and resulting FEN. These facts are added to candidate analysis facts and can create ranked material/check candidates alongside engine-eval candidates. Later detectors should build on the same normalized facts layer for loose pieces, mate threats, development, activity, king safety, and positional plans.

**Update:** Missed-opportunity ranking now inspects the best move or first best-line move for forcing tactical properties. When `beforeFen` is available, core applies the best move with `chess.js`; otherwise it falls back to SAN markers such as capture, check, and mate. Missed best lines that start with mate, check, or material gain produce higher-priority `missed_win`/`missed_tactic` candidates before the generic eval-loss explanation, so the coach can teach what was missed instead of only reporting the centipawn consequence.

**Update:** The analysis coach now has a conservative board-state material-risk detector. After applying the played move, core scans the moved side's non-king pieces and counts simple opponent attacks versus friendly defenses. Pieces that are attacked and under-defended emit `hanging_material` or `loose_piece` candidates with piece/square evidence, giving the coach a deterministic way to explain newly exposed material before deeper tactic search is available.

**Update:** The analysis coach now also scans the opponent's immediate legal replies after a move. Replies that give mate, give check while winning material, or win meaningful material produce `opponent_threat` candidates with single-move evidence. This keeps the detector deterministic while letting the coach explain risk phrases such as "this allows a forcing reply" before a full multi-ply tactic search exists.

**Update:** The first positional detector pass compares `beforeFen` and `afterFen` for low-risk teaching signals: minor-piece development from home squares, increased central-square control, and moved-piece mobility gains. These emit `development`, `center_control`, and `piece_activity` candidates only when the move is not a clear tactical mistake, so small setup lessons can appear without overriding tactical or material warnings.

**Update:** Pawn-structure detection now compares the moved side's pawns before and after a pawn move. It flags newly created doubled or isolated pawns as `pawn_structure` candidates and newly created passed pawns as `conversion` candidates with square evidence. This keeps structural lessons deterministic and tied to board-state changes rather than generic eval movement.

**Update:** Game-analysis coach rendering now supports composition: core keeps emitting ranked candidate events, then selects one complementary secondary event when it adds a different teaching point from the primary. The i18n renderer combines the primary localized message with a localized secondary note while preserving the primary event/evidence, so web/mobile can present "main lesson plus also note" without hardcoding prose in platform UI.

**Update:** The first real analysis input path parses pasted or uploaded PGN in shared core into an `AnalyzedGame` timeline with SAN, side, phase, and `beforeFen` for every move. These imported moves are marked `hasEngineAnalysis: false`, so the coach can run deterministic board-state detectors without pretending engine eval/best-move data exists; Stockfish-backed eval enrichment remains the next analyzer slice.

**Update:** Web analysis now enriches parsed `AnalyzedGame` timelines through a bounded Stockfish 17.1 route. The route runs the same pinned engine family used by the offline opening tools, converts UCI best moves into SAN through `@firstmove/core`, stores evaluations in the existing White-perspective convention, and fills `beforeEvalCp`, `afterPlayedEvalCp`, `afterBestEvalCp`, `bestMoveSan`, and `bestLine` so the game-analysis coach can explain real imported PGNs instead of fixed samples. The first UI pass is intentionally capped per request; longer games should move to chunked/background analysis rather than blocking the page on one large engine job.

**Update:** Game-analysis coach event selection now treats engine output as a spectrum of candidate teaching signals instead of a single move label. Stockfish MultiPV data supplies candidate gaps for `only_move` and defensive-resource detection, while eval deltas and board-state facts produce ranked candidates for `game_turning_point`, `advantage_lost`, `advantage_preserved`, `defensive_resource`, `time_to_simplify`, and `endgame_transition` in addition to the existing tactics, material-risk, opponent-threat, development, center, activity, and pawn-structure detectors. The rule remains deterministic: normalize evals to the moved side, derive board facts from before/after FEN, match every justified event, rank by teaching value, and render localized display/spoken templates from the selected event composition.

**Update:** The analysis coach now has a conservative tactical-motif layer on top of the generic tactic events. From `beforeFen` plus the played or best SAN, core can tag clear forks, pins, skewers, discovered attacks, trapped pieces, and back-rank motifs. These motifs are stored as theme tags and analysis facts on `tactic_found`, `missed_tactic`, or `missed_win` candidates rather than creating separate event types, so localization and voice rendering stay stable while the coach can explain the specific tactical idea behind a move.

**Update:** Localized coach rendering now uses those motif facts as an optional template specialization layer. The event taxonomy still stays generic, but when a tactic event carries a known motif such as a fork, pin, skewer, discovered attack, trapped piece, or back-rank idea, `@firstmove/i18n` prefers motif-aware display and spoken templates before falling back to the generic tactic wording.

**Update:** Coach evidence is rendered through `@firstmove/i18n` rather than directly from raw core evidence titles. A `RenderedCoachEvent` may now carry localized evidence with an action label, title, summary, and structured move/square/piece/plan payload. This gives web and mobile a shared "show the idea" contract for refutation lines, key moves, tactical squares, and material targets while keeping raw `CoachEvidence` available on the underlying event.

**Update:** Game-analysis coach selection now separates event selection policy from secondary ordering. The selected primary event follows deterministic mixed-event rules: missed mate and allowed mate are always treated as the main lesson, missed tactics outrank plain move-quality labels, and plain blunders remain primary only when there is no more specific missed idea. Severity still remains visible through complementary events, so a move can teach the missed tactic while also surfacing the blunder label. Selected events also normalize evidence before rendering, preferring full best lines, then best moves, then target squares or pieces. Spoken coach output now has event-specific fallback keys and basic SAN-to-speech conversion so future voice output can be shorter and less written-style. Deterministic phase and game summary events are available from core as a post-analysis summarizer, with AI enrichment left as a later optional layer.

**Update:** Opening Explorer requests should use `https://explorer.lichess.org/lichess` rather than the older `https://explorer.lichess.ovh/lichess` host. The older host can still resolve to the Explorer service, but it presents a TLS certificate for `explorer.lichess.org`, causing strict clients such as Node fetch, PowerShell, and Windows Schannel curl to fail hostname validation before any HTTP response is returned.
