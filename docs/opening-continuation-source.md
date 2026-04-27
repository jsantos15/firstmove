# FirstMove Opening Continuation Source

## Purpose

This document defines the active continuation-source stack for the rebuilt
opening generator.

Naming authority and continuation authority are different jobs.

- `lichess-org/chess-openings` defines opening and variation names
- `Lichess Explorer` defines practical human move popularity
- `Stockfish` defines trained-side best play and final validation

## Active Source Stack

For the current generator, use:

1. `lichess-org/chess-openings` for opening family and named variation anchors
2. authenticated `Lichess Explorer` for opponent continuation popularity and
   node sample counts
3. `Stockfish` for trained-side best moves, short-horizon checks, and final
   position analysis

## Why This Is The Active Choice

This matches the current FirstMove generation model:

- preserve official opening and variation structure
- follow real human opponent play after the named anchor
- keep the teaching side on strong, engine-validated moves
- stop based on the FirstMove closing algorithm rather than raw tree depth

`Lichess Explorer` is now the continuation source because it directly answers
the product question:

- what do humans actually play here?

`Stockfish` remains essential, but it is no longer the source of opponent move
selection.

## Authentication Requirement

Lichess Opening Explorer now requires authenticated access.

For local script usage:

- create a personal Lichess API token
- store it locally as `LICHESS_API_TOKEN`
- never commit that token to the repo

The generator reads that token from local environment configuration and uses it
for Explorer requests.

## Responsibility Split

### `lichess-org/chess-openings`

Responsible for:

- opening names
- variation names
- variation nesting
- anchor PGN / SAN identity

Not responsible for:

- practical continuation depth
- popularity counts
- stopping logic

### `Lichess Explorer`

Responsible for:

- opponent move popularity
- node game counts
- practical branch confidence
- continuation-policy filtering for human play

Not responsible for:

- naming
- category assignment by itself
- trained-side best play

### `Stockfish`

Responsible for:

- trained-side continuation move choice in Phase 1
- MultiPV analysis
- top-move gap
- eval stability
- short-horizon upgrade checks
- final line validation

Not responsible for:

- opponent popularity modeling
- naming

## One-Sentence Project Rule

Use `lichess-org/chess-openings` for naming, authenticated `Lichess Explorer`
for human opponent continuations, and `Stockfish` for trained-side best play and
validation.
