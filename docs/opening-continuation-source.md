# FirstMove Opening Continuation Source Decision

## Purpose

This document defines the practical continuation source strategy for the first
full opening-library regeneration.

The naming question and the continuation-depth question are not the same.

- `lichess-org/chess-openings` is the naming authority
- this document defines how we obtain longer move sequences

## Current Practical Decision

For the first regeneration pass, use this continuation-source stack:

1. `lichess-org/chess-openings` for opening family and variation identity
2. `ChessDB` for operational continuation depth generation
3. `Stockfish 17.1` for validation, evaluation, and short gap-filling
4. manual review for edge cases, move-order weirdness, and family placement

## Why This Is The Current Choice

In an ideal version of the pipeline, FirstMove would use a richer human game
tree source for long continuation depth.

However, for the current rebuild, we need a source that is:

- reachable from this environment
- scriptable now
- already close to the existing repo workflow
- good enough to start producing broad coverage quickly

`ChessDB` satisfies those operational requirements today.

`lichess-org/chess-openings` remains the naming authority because it provides
clean opening-family and variation naming, but it does not provide the deeper
continuation depth needed by itself.

## Constraint Noted On April 20, 2026

During this rebuild setup, live requests to the Lichess Opening Explorer were
not reliably usable from the current environment. The static
`lichess-org/chess-openings` dataset was reachable and worked well for naming,
but the live explorer path was not suitable as the immediate automation source
for the rebuild.

Because of that, the first practical rebuild should not depend on live Lichess
Explorer availability.

## What ChessDB Is Responsible For

Use ChessDB to:

- extend known named lines beyond their shortest identifying sequence
- recover likely continuation moves for broad practical coverage
- generate candidate tails for current and newly discovered lines
- support full-library generation when deeper human-tree automation is not yet
  ready

Do not let ChessDB decide naming or line inclusion by itself.

## What ChessDB Is Not Responsible For

Do not use ChessDB alone to decide:

- whether a branch deserves inclusion
- what the line should be called
- whether a broad family or subvariation is the correct label
- whether the final depth is pedagogically right without framework review

Those decisions must still come from:

- the inclusion policy
- the category system
- the stop rubric
- the naming authority
- Stockfish review

## Practical Generation Flow

For each candidate line:

1. Identify the opening family and best available variation name from
   `lichess-org/chess-openings`.
2. Start from the shortest known branch sequence.
3. Extend the line with ChessDB to generate a practical continuation candidate.
4. Apply FirstMove stop rules to decide whether to stop, shorten, or extend.
5. Use Stockfish to validate the final candidate line and final position.
6. Mark the line as authoritative, practical, app-label, or future `Others`.

## Confidence Model

Use these source-confidence guidelines:

- `high`
  - authoritative name from Lichess opening dataset
  - continuation is stable and Stockfish-checked
- `medium`
  - continuation mainly sourced from ChessDB and confirmed by Stockfish
- `low`
  - family fit, move order, or teaching value still needs human review

## Future Upgrade Path

This is the practical source choice for the first rebuild, not the final ideal
architecture.

Future upgrades may replace or augment the continuation layer with:

- a reachable human opening explorer API
- an imported game-tree dataset
- a curated PGN opening source
- popularity-weighted branch mining from a large PGN corpus

If that happens, naming authority can stay the same while continuation depth
generation improves.

## One-Sentence Project Rule

For the first full FirstMove library regeneration, use `lichess-org/chess-openings`
for naming and `ChessDB` plus Stockfish for practical continuation generation,
while keeping final inclusion and stopping decisions under the FirstMove
framework.
