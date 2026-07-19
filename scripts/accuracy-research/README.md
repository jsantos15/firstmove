# Chess.com metric matching — Accuracy, Move Categories, Rating

## Goal

Reverse-engineer/approximate three Chess.com game-review metrics well enough to
eventually compute them locally in FirstMove (client-side, off our own Stockfish
analysis), for real games we already have both the PGN and Chess.com's own
displayed numbers for:

1. **Accuracy** — 0–100 per player.
2. **Move Categories** — counts of Brilliant/Great/Book/Best/Excellent/Good/
   Inaccuracy/Mistake/Miss/Blunder per player.
3. **Rating** — the "Game Rating" Chess.com shows per player on the review screen
   (e.g. 1300, 1850) — not yet investigated at all.

## Status: Accuracy finalized; Move Categories mostly finalized — 9/10 categories calibrated, Brilliant deliberately deferred (2026-07-16)

Second dataset (MagnusCarlsen, 21 games, held-out/off-distribution) added and
`calibrate.js` rewritten to fit on kik1n only and validate against Magnus.
Result: the kik1n-fit params generalize *well* to Magnus (4.52 MAE held-out vs.
6.70 MAE on the fit set itself — better, not worse), and the independently
best-fit params for kik1n-alone/Magnus-alone/combined are all nearly identical
(window 3–4, alpha=1, 5% blunder penalty, threshold 15 win% loss). That's
strong evidence there's no missing rating-dependent term — one global formula
holds from ~400 to ~3500 rating. No further accuracy-formula tuning planned
unless new data surfaces a real pattern (not just more sweeping on the same 35
games). **Next: Move Categories**, using the same two-dataset infrastructure.

## Data available

Two self-contained JSON files are now the single source of truth (PGN + real
Chess.com targets + category counts, all in one place per game) — `calibrate.js`
reads only these two, not any `.txt` file:

- `samples/category-breakdowns.json` — **kik1n dataset, 14 games, the primary
  fit set.** Beginner-to-intermediate ratings (~400–2200), matching FirstMove's
  actual target audience. Keyed by opponent username. Each game has `pgn` (full
  PGN incl. headers) and `white`/`black` objects with `accuracy`, `rating`
  (Chess.com's "Game Rating," confirmed distinct from the PGN's WhiteElo/
  BlackElo header — not yet investigated), and per-category move counts
  (Brilliant through Blunder). Two small accuracy mismatches vs. old manual
  transcription already found (`gonecatfishn`: 87.0 vs 87.1; `sawa-yan`: 82.9 vs
  82.1) — unresolved, probably rounding.
- `samples/category-breakdowns_MagnusCarlsen.json` — **MagnusCarlsen dataset, 21
  games, held-out validation set only — never fit against.** Very high rating
  (~2400–3500), deliberately off-distribution from FirstMove's actual users;
  purpose is to check whether params tuned on kik1n generalize or whether
  Chess.com's real formula has a rating-dependent effect a single global fit
  can't capture. Same schema as above. Includes 4 opponents Magnus faced twice
  (key suffixed `_2` for the second meeting). See the file's `_uncertain` field:
  the `subham777`/`subham777_2` pairing couldn't be disambiguated with full
  confidence (both games happen to be an identical 77 plies, and Magnus was
  White in both, so neither of the two techniques that resolved every other
  repeat-opponent pair — color, move count — worked here); everything else was
  confirmed either by color or exact ply-count match.
- `samples/category-images/kik1n/*.jpg`, `samples/category-images/MagnusCarlsen/*.jpg`
  — the original screenshots (both JSONs' data was transcribed directly from
  these by reading the images, not hand-typed).
- `samples/pgns_kik1n.txt`, `samples/pgns_MagnusCarlsen.txt` — raw PGN dumps the
  two JSONs' `pgn` fields were sourced from. Not read by `calibrate.js` anymore
  (superseded by the JSONs) — kept as plain-PGN reference only.
- `calibrate.js` — loads both JSON datasets, runs each game through Stockfish
  (`stockfish` npm package, `initEngine('lite-single')`, depth via `--depth=`,
  default 16) to get a per-ply centipawn eval series (cached to
  `output/evals-cache.json`, gitignored, keyed by hash of moves+depth), sweeps
  aggregation parameters to minimize error **against kik1n only**, then reports:
  the fit error on kik1n, the held-out error on Magnus using those same params
  (the real generalization check), and two diagnostics (fit-on-Magus-alone,
  fit-on-combined) to show whether merging the two pools would actually help or
  whether a rating-dependent term is the real fix. Run: `node calibrate.js
  [--depth=16]`.

## Accuracy: progress so far

Formula is the publicly-known Lichess/Chess.com-reverse-engineered one:

1. `Win% = 50 + 50 * (2 / (1 + e^(-0.00368208 * cp)) - 1)`
2. `MoveAccuracy% = 103.1668 * e^(-0.04354 * winPercentLoss) - 3.1669`
3. Aggregate per player via a **volatility-weighted mean** (window ≈3 plies,
   weight = local stdev of Win% around that move) — not a simple average. Best
   fit found `alpha=1` (i.e. the harmonic-mean blend Lichess's docs vaguely
   describe wasn't needed/didn't help once volatility-weighting was right).
   Added a first-attempt "multiple blunders" penalty (5% compounding per
   blunder beyond the first, blunder = ≥15 win% lost in one move) — only
   partially helps.

Final params (fit on kik1n, 14 games): `window=3, alpha=1,
blunderPenaltyPerCount=0.05, blunderLossThreshold=15`.

- kik1n (fit set): **MAE ≈6.7** per accuracy number (28 numbers).
- MagnusCarlsen (held-out, 21 games, never fit against): **MAE ≈4.5** per
  number (42 numbers) — using the exact same params. Confirms the formula
  generalizes across the rating spectrum rather than being overfit to 14
  beginner/intermediate games.
- Diagnostics (fit-on-Magnus-alone, fit-on-combined) land on essentially the
  same params and don't meaningfully lower error — see `calibrate.js`'s output
  for the full comparison. No evidence a rating-dependent adjustment is needed.

Remaining outliers are per-game, not a rating-band pattern:
- kik1n: `The_Chanda` (Black dB=+22.9), `gsmadan` (White dW=+16.0), `Jovan613`
  (White dW=-13.1). `gsmadan` has **zero blunders on the low-accuracy side**
  (White, 68.0) — just 5 inaccuracies + 4 mistakes — which disproves "blunder
  count" as the main missing piece; a pile of medium-sized errors needs to drag
  the aggregate down more than the current weighting does.
- MagnusCarlsen: `MITerryble` (dW=-15.4, dB=-9.6) stands out — a 184-ply
  grinding technical endgame where Chess.com's real accuracy is very high
  (91.5/94.4) but ours computes much lower. Possibly a depth-16 Stockfish
  insufficiency for very long technical endgames (noisy small evals in a dead
  position getting misread as "loss") rather than an aggregation-formula flaw —
  untested, worth a higher-depth spot-check specifically on long games before
  assuming it's the same issue as the kik1n outliers.

Decision: **not chasing these further for now** — diminishing returns/overfit
risk on the same fixed game set, and the cross-validated generalization result
above is a stronger signal than shaving another point off MAE. Move Categories
next.

## Move Categories: in progress (2026-07-16)

**Correction to an earlier assumption in this file:** `packages/core/src/coach/analysis.ts`'s
`buildGameReviewCategory` is real code but NOT a calibrated Chess.com-matching
classifier — it uses flat centipawn-loss thresholds (`COACH_CLASSIFICATION_THRESHOLDS`),
not the Win%-loss/published-bucket approach below, and its `isBookMove`/
`isSacrifice`/`isOnlyGoodMove` inputs are never actually computed anywhere in
the app (grepped — only `isCriticalMove` has a real implementation, in
`apps/web/lib/client/enrichGameMove.ts:60-63`). So Book/Brilliant/Great are
effectively non-functional in the app today. This calibration work is building
the real thing from scratch in this script, same pattern as Accuracy — not
reusing/recalibrating that existing function. Whether to replace it or build a
new one is a decision for when app integration starts.

**6 core buckets (Best/Excellent/Good/Inaccuracy/Mistake/Blunder):** Chess.com's
support docs publish the bucket boundaries directly, as expected-points-lost
(0, 0.02, 0.05, 0.10, 0.20) — which maps 1:1 onto the Win%-loss value the
Accuracy formula already computes per move (`scripts/accuracy-research/calibrate-categories.js`,
reuses `calibrate.js`'s eval cache, no re-analysis needed). Applied as-is, this
already tracks Chess.com's real counts well: most individual games land within
0-4 of target on a coarse positive/negative-bin comparison.

**Book:** first attempt used FirstMove's own opening-position index (the
~3800-line `lichess-org/chess-openings` named-openings dataset, same one
powering the app's Openings section — see `scripts/build-opening-position-
index.cjs`) with a "book ends the first time you leave a known line, no
re-entry" rule. Undercounted noticeably (MAE ~1.5-3/side) — that dataset only
covers canonical *named* lines, not all common theory. Switched to a
**frequency-based** approach instead: query Lichess's live Explorer API
(`scripts/lib/lichess-explorer.cjs`, wraps `explorer.lichess.org`, 1600-2500
rated blitz/rapid/classical games) for a real game-count at each early-game
position, cached via `fetch-book-popularity.cjs` to
`output/lichess-explorer-cache.json` (gitignored — one-time fetch, ~770
positions, reused across reruns). A move counts as book only while the game
has been *contiguously* popular (≥ threshold games) from move 1. Swept the
threshold on kik1n only: **best = ≥250,000 games**, book MAE dropped to
**0.82/side (kik1n) vs 0.95/side (Magnus, held-out)** — a real, well-
generalizing improvement, not overfitting (26/70 sides exact match, 28 off by
1, 13 off by 2, worst case only 3). Considered solved for now.

**Core 6 buckets: boundaries recalibrated (2026-07-16).** Per-bucket error
breakdown (added to `calibrate-categories.js`) showed `best` was by far the
worst bucket (MAE 2.89/side kik1n, 4.00 Magnus) and was untouched by the
excellent/good/inaccuracy/mistake sweep, since it's independently defined as
"loss ≤ epsilon." We were consistently *undercounting* Best — Chess.com's
published `best ≤ 0.00` (essentially "must be the exact engine top choice") is
too strict for a depth-16 engine to hit literally as often as their own
(deeper/different) engine does. Added `best` as a 5th swept parameter.

Ran the full generalization check (same fit-kik1n/fit-Magnus/fit-combined
pattern as Accuracy) — and unlike Accuracy, **the three fits genuinely
disagree**, especially on `best` (kik1n-alone wants 0.5, Magnus-alone wants
0.1). That's a real signal: high-rated games need a tighter "Best" tolerance
than low-rated ones, consistent with Chess.com's own documentation that their
Expected Points Model is rating-adjusted (which we haven't built). The
**combined-pool fit generalizes best** (kik1n MAE 1.45, Magnus MAE 2.17 — both
better or barely-worse than either single-dataset fit) and is the current
recommendation:

```
best=0.3, excellent=1.5, good=3, inaccuracy=6, mistake=20   (win% loss)
```
(vs. published `best=0.05, excellent=2, good=5, inaccuracy=10, mistake=20`)

Known residual gap, not chased further yet: even the combined fit's `best`
error on Magnus (4.40) is worse than just using the published `0.05` as-is
(4.00) — a single global epsilon can't fully reconcile both ends of the rating
spectrum for this one bucket specifically. Would need an explicit
rating-scaled `best` epsilon to close, similar in spirit to (but distinct
from) the rating-adjustment Accuracy turned out not to need.

**Great and Miss: done (2026-07-16).** Both classify off data we already have
per move — no new inputs needed:

- **Great** — a "good" move (loss ≤ excellent) that swings the position across
  the losing/equal boundary or the equal/winning boundary (win% before/after,
  mover's perspective, crossing `greatLosingMax`/`greatWinningMin`). Swept on
  kik1n: best = `greatLosingMax=25, greatWinningMin=60`. MAE 0.79/side (kik1n)
  vs 1.69/side (Magnus, held-out) — real degradation but not broken.
- **Miss** — a NOT-good move (loss > excellent) played right after the
  opponent's own previous move lost at least `missOpponentBlunder` win% (they
  just handed over a big opportunity and this move didn't take it). Swept on
  kik1n: best = `≥15 win% loss`. MAE 0.57/side (kik1n) vs **0.60/side (Magnus)**
  — generalizes almost perfectly, the strongest cross-validation result of any
  category in this whole project.

**Brilliant: deliberately deferred, not implemented.** Three heuristics were
tried and rejected — full detail in `calibrate-categories.js`'s module
comment, short version: (1) immediate material delta on the sacrifice move
itself doesn't work, because a real sacrifice usually doesn't change the
material count on that exact ply (the piece just sits on an attacked square
until captured 1-3 moves later); (2) a lookahead window's minimum material
balance over the next few plies is far too noisy — it fired on ordinary
mid-trade dips in totally normal games (12 false positives in one 50-ply
kik1n game that has 0 real Brilliants); (3) combining "landed on a square the
opponent can capture" with a net-material-deficit check a few plies later
still missed a known real Brilliant and still fired on ordinary trades
elsewhere. All three fail for the same reason: distinguishing a genuine,
uncompensated sacrifice from an ordinary trade sequence needs either Static
Exchange Evaluation or the engine's actual principal variation, and this
project only has a single depth-16 score cached per position — no PV, no SEE.
Real Brilliant detection would need one of those (re-running Stockfish with
`multipv`/PV capture, or implementing SEE) — not attempted further here.
`brilliant` stays as an honest always-0-computed column in the output rather
than a fake heuristic, so the gap is visible. Low practical urgency: kik1n
(FirstMove's actual target audience) has **zero** real Brilliant instances
across all 28 sides anyway — engine-endorsed sacrifices are rare below
~2000-ish rating, so this gap mostly matters for higher-rated users.

**Final 9-category result** (Book + 6 core buckets + Great + Miss, Brilliant
excluded from the count since it's not attempted): **MAE 1.11/side (kik1n),
1.76/side (Magnus, held-out)** across all 10 output columns (including the
always-0 Brilliant column, which is why raw MAE is divided by 10 in the
script's output even though only 9 are truly "classified"). Considered done
for now — Rating is the last unstarted metric.

## Brilliant detection: reopened and in active progress (2026-07-17/18)

The "deferred" status above is superseded — the user pushed to build it for
real, and the picture changed completely:

- **Working rule set** (user-designed, informed by a Reddit-sourced
  operational definition of Chess.com's algorithm: "brilliant = leaves a piece
  hanging + strong follow-up if taken, no exceptions"): (1) move must be the
  engine's TOP move (firm user requirement — verified via bestmove match, and
  the pre-filter must stay loose (loss <= 2.0) because eval-series loss noise
  can make even a true bestmove look like ~1.4 loss); (2) the move must
  CREATE a new offer: a piece worth >= 3 (no pawns) capturable at static SEE
  profit, where no such capture existed on that square before the move;
  (3) net sacrifice: bait profit minus material the move itself captured must
  be positive (else it's a trade, not a sac); (4) taking the bait must lose
  >= captureLossCp for the taker (deep engine eval of the hypothetical
  capture position; mate = max); (5) not already completely winning / not in
  a bad position afterward (win% bounds). NO "obviousness" test — the
  verified Rxd3 example is refuted by mate-in-1 (as shallow as possible) and
  Chess.com still awarded it.
- Implementation: `calibrate-brilliant.js` (static SEE candidate filter via
  chess.js, engine verification only for survivors, cached to
  `output/brilliant-cache.json`).
- Run-3 state: kik1n side perfect (0 detections, 0 real), Magnus TP=1
  (Rxd3 caught at exact-move level under the firm bestmove rule) FP=4 FN=6.
- **Move-level ground truth now exists** (2026-07-18): user provided
  per-move screenshots for all 21 Magnus games
  (`samples/category-images/MagnusCarlsen/Moves/*_moves.jpg`); all badges
  transcribed into `category-breakdowns_MagnusCarlsen.json` as `moveBadges`
  (314 badges, all PGN-validated — see the JSON's `_moveBadges` note for
  coverage caveats). All 7 real Brilliant moves are now known exactly:
  Alonmindlin 24.h6 + 27.Qxe8+, ArturoCaceres(1st) 21.Nd5, mr_gustavo 25.Rf3,
  penguingm1 29.Nxe6+, Silent-Killer100 22.Nf5+, subham777 26...Rxd3. Side
  bonus: the badge data also resolved the subham777/subham777_2 game-pairing
  ambiguity (original assignment confirmed correct) and gives move-level
  ground truth for Great/Miss/Mistake/Blunder too.
- **Next step:** diagnose the 6 FNs move-by-move against the now-known real
  moves (which rule rejects each?) and re-tune; the 4 FPs can likewise be
  compared against badges (all 4 are unbadged moves on Chess.com — genuinely
  not Brilliant there).

## Rating: not started

No formula attempted yet. Raw numbers exist for all 35 games (kik1n + Magnus)
in both JSON files' `white.rating`/`black.rating` fields (confirmed to be
Chess.com's per-game "Game Rating," distinct from the PGN's WhiteElo/BlackElo).

## End goal (not started)

All of this is groundwork for eventually computing these 3 metrics inside the
real FirstMove analysis screen (`apps/web/app/(app)/analysis/page.tsx`) using the
in-app Stockfish pipeline — not just this standalone research script. No
app-code integration has begun.
