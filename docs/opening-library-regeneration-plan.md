# FirstMove Opening Library Regeneration Plan

## Purpose

This document defines how FirstMove should rebuild the opening library from
scratch using the new framework.

The current dataset remains valuable as:

- a backup
- an inventory of current openings and line slugs
- a comparison baseline

But the regenerated dataset should be built from the new policy stack rather
than patched line by line from the old dataset.

## Regeneration Goal

Generate a new opening library that is:

- broad in coverage
- accurate in naming
- consistent in stopping depth
- validated by engine review
- flexible enough to hold named lines, practical lines, and future `Others`
  branches

## Core Inputs

Use these sources and rules together.

### 1. Current FirstMove Dataset

Use as:

- backup
- opening-family seed inventory
- slug reuse reference
- comparison baseline

Do not use as the final authority for move depth or naming.

### 2. Naming Authority

Use `lichess-org/chess-openings` as the main naming and ECO reference.

Use it to:

- identify opening families
- identify recognized variation names
- distinguish authoritative names from app labels

### 3. Continuation Source

For the first full regeneration pass, use the continuation-source decision in
[opening-continuation-source.md](./opening-continuation-source.md).

Use it to:

- recover longer real lines
- find additional named or practical branches
- provide realistic move order beyond the old dataset

### 4. Stockfish

Use Stockfish as a reviewer, not the main author.

Use it to:

- validate candidate lines
- compare stopping points
- evaluate final positions
- fill only short missing tails when the human source still cuts off too early

### 5. FirstMove Framework

Use all of the following during generation:

- [opening-line-inclusion.md](./opening-line-inclusion.md)
- [opening-line-spec.md](./opening-line-spec.md)
- [opening-line-categories.md](./opening-line-categories.md)
- [opening-difficulty.md](./opening-difficulty.md)
- [opening-popularity.md](./opening-popularity.md)
- [opening-line-sourcing.md](./opening-line-sourcing.md)

## Regeneration Output Model

Every generated line should end with:

- `openingId`
- `lineId`
- `openingName`
- `lineName`
- `ecoCode`
- `sans`
- `primaryCategory`
- `inclusionOutcome`
- `sourceType`
- `sourceName`
- `sourceConfidence`
- `stopReason`
- `teaches`
- `finalPositionSummary`
- `engineChecked`
- `finalEvalCp`
- `finalEvalPerspective`
- `finalEvalSummary`
- `lineDifficulty`
- `lineDifficultyConfidence`
- `lineDifficultySource`
- `isMainLine`
- `mainLineConfidence`
- `mainLineSource`
- `popularitySource`
- `popularityScore`
- `popularityGames`
- `popularityRankWithinOpening`

Optional grouping metadata:

- `isNamedLine`
- `isPracticalLine`
- `isOtherCandidate`
- `secondaryTags`

## Library Grouping Model

The regenerated library should support three logical buckets inside each
opening family:

### 1. Named Lines

Use for:

- authoritative named variations
- strongly recognized subvariations

### 2. Practical Lines

Use for:

- real, useful, distinct branches that deserve practice
- branches whose teaching label is clear even if strict naming is inconsistent

### 3. Others

Use only as a future fallback bucket.

Use for:

- useful branches that belong to the family
- but do not have a stable authoritative or practical teaching label

This bucket should exist in the data model now, even if the app does not yet
show it in the UI.

## Regeneration Pipeline

Use this sequence.

### Phase 1. Backup The Existing Library

Preserve the current line library fully before replacing anything.

Keep:

- current opening families
- current line IDs
- current line names
- current SAN sequences
- current descriptions

Backup locations may include:

- repo-side JSON export
- DB-side backup/versioned tables

Current default repo-side backup path:

- `scripts/output/backups/opening-library/<timestamp>/openings.json`
- `scripts/output/backups/opening-library/<timestamp>/lines.json`

Do not overwrite the current live library directly.

### Phase 2. Build The Candidate Inventory

Start with the current opening families, then add external candidates.

Create a candidate inventory containing:

- all current lines
- additional named lines found from external sources
- practical branches worth inclusion
- future `Others` candidates if useful

At this phase, over-inclusion is acceptable.

### Phase 3. Apply Inclusion Policy

For every candidate line, assign one of:

- `include-authoritative`
- `include-practical`
- `include-app-label`
- `include-other`
- `merge`
- `exclude`
- `manual-review`

Bias toward keeping real learner-relevant branches.

### Phase 4. Assign Category

For each included line, assign one primary category:

- `setup`
- `strategic`
- `trap`
- `gambit`
- `punishment`
- `forcing`

This determines how completeness will be judged.

### Phase 5. Determine Final Line Depth

Use the stopping framework to decide where the line should end.

Possible actions:

- keep source depth
- shorten
- extend from source
- extend with short Stockfish-confirmed tail

Do not preserve extra moves just because the source contains them.

### Phase 6. Validate And Evaluate

Run Stockfish on the final candidate line to:

- verify legality
- verify tactical soundness
- evaluate the final position
- generate optional learner-facing eval summary data

### Phase 7. Naming Pass

After move depth is finalized, confirm:

- opening family name
- line name
- whether the line is authoritative, practical, app-label, or other
- whether the line should live in the main list or future `Others` bucket

### Phase 8. Review Before Promotion

Write the generated library to a staged output first.

Review:

- counts by opening family
- counts by inclusion type
- counts by primary category
- counts by source type
- lines added compared with current dataset
- lines removed compared with current dataset

Only after review should the new dataset replace the current one.

## Replacement Strategy

Do not immediately replace the live data tables with the first generated pass.

Preferred order:

1. generate repo-side output
2. review and diff against current dataset
3. stage into backup/versioned DB tables
4. confirm promotion
5. swap to the new library

This keeps rollback simple.

## ID Strategy

Prefer to preserve current slugs when:

- the opening family is still correct
- the line identity is still correct
- only move depth or naming precision changes

Allow slug changes when:

- a line is being split
- the family was wrong
- the current line name is misleading enough to cause long-term confusion

Correctness should win over slug stability if the conflict is real.

## Success Criteria

The regeneration is successful when:

1. the library has broader and cleaner coverage than the current dataset
2. line names are more authoritative or intentionally labeled
3. line endings follow the FirstMove stop rules consistently
4. near-neighbor branches are kept when they matter to learner recognition
5. the new dataset can be promoted without losing the old backup

## Immediate Next Build Steps

Use this order next:

1. choose or confirm the human continuation source for depth generation
2. define the backup format and location
3. build the candidate-inventory generator
4. add inclusion outcome assignment
5. generate the first staged rebuilt dataset
6. review counts and sample openings before DB promotion

## One-Sentence Project Rule

Rebuild the FirstMove opening library from a backup-preserved seed inventory
using source-backed naming, generous learner-focused inclusion, framework-based
stopping rules, and Stockfish validation before promoting the new dataset.
