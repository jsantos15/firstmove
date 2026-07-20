# Handoff prompt — Chess.com Game Review metric matching (move-level phase)

Copy-paste for the next session:

---

Continue the Chess.com metric-matching research in `scripts/accuracy-research/` — read its `README.md` first (full history). Accuracy is DONE (don't touch). Current work: matching Chess.com's 10 move categories at EXACT-MOVE level against ground truth, one category at a time; we're currently on **Best**.

**GROUND TRUTH:** `samples/category-breakdowns_MagnusCarlsen.json` — 21 games, each with `pgn`, per-side summary counts, and `moveBadges` = per-move labels `{moveNo, side, san, category}` transcribed from Chess.com screenshots (~600 labels incl. book expansion and 120 inaccuracies, all PGN-validated). Read the `_comment`/`_uncertain`/`_moveBadges` fields — they document three critical doctrines: (1) **the move list is authoritative over the summary tab** (Chess.com's summary has bugs — GeneralZod, penguingm1, blitzking1729 cases documented there); (2) **book semantics**: the single book badge per game marks the LAST book ply; all unbadged plies before it were expanded to `book` in moveBadges. In 4 games (DenLaz, ChristopherYoo, subham777_2, Alonmindlin) the summary's book counts disagree with that rule — unresolved, ask the user before leaning on book counts there; (3) unbadged moves after book are implied positive-tier (best/excellent/good — only selectively badged). The kik1n dataset (`samples/category-breakdowns.json`, 14 games, the app's real audience) has summary counts only, no badges — use as count-level held-out check.

**CACHES (reuse, don't re-run engines blindly):** `output/evals-cache.json` = depth-16 Stockfish cp eval per position, keyed `sha1("16|" + sans.join(" "))`; `output/lichess-explorer-cache.json` = Lichess Explorer position popularity (frequency-based book detection, threshold ≥250k); `output/brilliant-cache.json` = engine bestmove + post-capture evals keyed by FEN.

**CURRENT FORMULAS** (in `calibrate-categories.js` / `match-single-game.js` / `validate-move-level.js`):
- `Win% = 50 + 50*(2/(1+e^(−0.00368208·cp))−1)`; loss = mover-perspective win% drop.
- Buckets: best ≤0.3 < excellent ≤1.5 < good ≤3 < inaccuracy ≤6 < mistake ≤20 < blunder.
- Great override (win% crossing 25/60 boundaries) — **proven wrong: 0/71 move-level matches**.
- Miss override (loss>1.5 right after opponent lost ≥15) — partial (43% recall).
- Brilliant (`calibrate-brilliant.js`): strict engine-bestmove match (firm user rule) + move CREATES a new hanging piece ≥3 (chess.js SEE, `baitExistedBefore` check) + capturing it loses ≥300cp for the taker (engine-verified, mate=max) + win% bounds. Currently TP 1/7, FP 4. All 7 real Brilliant moves are now known (in moveBadges).

**MOVE-LEVEL RESULTS SO FAR** (`validate-move-level.js`, and `match-single-game.js <gameKey>` as the single-game workbench): recall great 0%, mistake 42%, miss 43%, blunder 67%, best 81%; Best on Grischuk: computed W12/B14 vs real W15/B18.

**KEY HYPOTHESES TO PURSUE (in order):**
1. **Our sigmoid is too flat vs Chess.com's expected-points curve.** A steeper k simultaneously explains: tiny losses near equality badged inaccuracy/mistake (0.99 win% loss → inaccuracy), big losses inside decided positions badged only inaccuracy (14 win% loss at 84%→70%), and the Best undercount in winning positions (badged-Best captures we score 1.9–2.3 loss). FIRST TASK: refit k (possibly jointly with bucket boundaries) against the move-level labels via per-move confusion matrix; sanity-check against kik1n counts.
2. **Great = "only good move / critical"** (e.g. 14.O-O-O and 15.d5 in Silent-Killer100: 0 loss, 50→50, badged Great) → needs a MultiPV-2 engine pass (best-vs-second-best gap), cacheable.
3. **Miss also = failing to convert a winning position** without any opponent error (21.Qa3 case), and **blunder must outrank miss** (31…Qd3 hung the queen right after an opponent error — Chess.com says blunder, our ordering said miss).
4. **Best = literally the engine's top move** (Chess.com docs) — the loss≤0.3 proxy errs both ways (26…Rxd3: loss 1.44 yet engine-#1 at depths 16/20/24).

**WORKFLOW AGREEMENTS:** the user works one category at a time on single games and supplies new screenshots when data is ambiguous; when they ask for a 1-line answer, give exactly that; challenge suboptimal ideas per CLAUDE.md; commit+push to main after each unit of work.

---
