# FirstMove Opening Difficulty Policy

## Purpose

This document defines how FirstMove should classify openings and lines by
difficulty.

Difficulty exists to support:

- filtering in the app
- learner guidance
- sensible starting recommendations

Difficulty is separate from:

- naming
- inclusion
- popularity
- line stopping depth

## Difficulty Levels

Use these levels:

- `beginner`
- `intermediate`
- `advanced`

## Core Principle

Difficulty should reflect how demanding a line is for the target learner to
study and use correctly in practical play.

It should not simply reflect whether the opening is famous, fashionable, or
engine-approved.

## What Difficulty Measures

Difficulty should reflect a mix of:

- move-order sensitivity
- tactical sharpness
- theory burden
- strategic subtlety
- punishment for inaccuracy
- how easy the plans are to understand

## Line-Level Difficulty

Every line should receive a line-level difficulty.

This is the primary source of truth because different lines inside the same
opening family may have very different demands.

Examples:

- a quiet setup line may be `beginner`
- a sharp gambit line in the same family may be `advanced`

## Opening-Level Difficulty

Every opening family should also receive one opening-level difficulty for app
filtering.

Use this rule:

The opening-level difficulty should represent the most reasonable entry level
for a learner who wants to start studying that opening family.

That means:

- do not set the whole opening to `advanced` just because one sideline is
  advanced
- do not set the whole opening to `beginner` if even its main practical entry
  requires advanced precision

In practice, opening-level difficulty should usually be based on:

1. the main line, when that main line is a real study entry
2. otherwise the most representative practical line
3. manual review for mixed families

## Difficulty Definitions

### `beginner`

Use when the line is practical for newer learners to understand and play
without heavy memorization or narrow precision.

Typical traits:

- plans are easy to explain
- piece development is natural
- move-order mistakes are not instantly fatal
- tactical ideas are visible rather than deeply hidden
- the line teaches clear opening fundamentals

Typical examples:

- simple setup systems
- quiet development lines
- classical lines with straightforward plans

### `intermediate`

Use when the line requires some opening-specific understanding, sharper move
order awareness, or more precise follow-up than a beginner line.

Typical traits:

- the learner must know specific responses
- plans are still understandable, but less automatic
- tactical or strategic themes matter more
- inaccuracies may give up the opening edge quickly
- memorization burden is meaningful but manageable

Typical examples:

- many mainstream open games
- common gambits with understandable compensation
- lines with one or two important theoretical turning points

### `advanced`

Use when the line is highly demanding in precision, theory, tactical
calculation, or positional subtlety.

Typical traits:

- narrow move-order precision matters a lot
- one mistake can sharply change the evaluation or character
- theory burden is high
- compensation is subtle or difficult to handle
- plans are not obvious without prior study

Typical examples:

- very sharp forcing gambits
- deeply theoretical defenses
- strategically subtle closed systems with many move-order nuances

## Difficulty Signals

Use these as signals during classification.

Signals that push difficulty upward:

- forcing tactical sequences
- high move-order sensitivity
- compensation-based gambits or sacrifices
- subtle positional plans
- narrow defensive resources
- long theoretical branches that still matter

Signals that push difficulty downward:

- natural development
- forgiving structures
- clear plans and piece placement
- low punishment for small inaccuracies
- broad practical usability

## Classification Questions

Before assigning difficulty, answer:

1. How hard is it to understand the point of this line?
2. How hard is it to remember the important responses?
3. How badly does the line punish inaccuracy?
4. How obvious are the plans after the opening ends?
5. Would a new learner be able to use this line after modest study?

If the line is hard on several of those dimensions, raise the difficulty.

## Data Fields

Each generated line should support:

- `lineDifficulty`
- `lineDifficultyConfidence`
- `lineDifficultySource`

Each generated opening family should support:

- `openingDifficulty`
- `openingDifficultyConfidence`
- `openingDifficultySource`

## Confidence Model

Use:

- `high`
  - difficulty was manually reviewed or strongly source-backed
- `medium`
  - difficulty comes from framework-guided heuristics and the line clearly fits
    the level
- `low`
  - difficulty is only a first-pass guess and should be reviewed later

## Practical Generation Rule

For the first regeneration pass:

- assign line difficulty during generation
- mark it as heuristic unless manually reviewed
- derive opening difficulty later from grouped line results

This lets the app become filterable without pretending the first automated pass
is perfect.

## One-Sentence Project Rule

FirstMove difficulty should measure how demanding a line is to learn and use in
practice, with line-level difficulty classified first and opening-level
difficulty derived from the opening's most representative study entry.
