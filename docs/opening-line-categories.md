# FirstMove Opening Line Categories

## Purpose

This document defines the category system for FirstMove opening lines.

Categories help answer two questions:

1. What is this line trying to teach?
2. What does "complete" mean for this line?

Every line in the dataset should be assigned one primary category.

## Primary Categories

Use exactly one of these as the primary category for each line.

### `setup`

Use for lines whose main purpose is to reach a recognizable tabiya, piece
setup, or pawn structure.

Teaching goal:

- show the intended formation
- show the correct development pattern
- show the stable position the learner is trying to reach

Complete when:

- the intended setup is on the board
- the key squares, pawn structure, or piece placement are visible
- and the next moves are mostly flexible plans rather than opening-specific
  memorization

Typical examples:

- London-style development setups
- quiet Italian tabiyas
- Queen's Gambit Declined development structures

### `strategic`

Use for lines whose main purpose is to teach an opening-specific strategic
idea, not just development.

Teaching goal:

- show the strategic plan behind the line
- show the piece coordination or pawn break being prepared
- show why the opening position is desirable

Complete when:

- the strategic idea is visible on the board
- the learner can identify the intended plan
- and deeper moves would mostly become normal middlegame play

Typical examples:

- Ruy Lopez structures built around pressure and maneuvering
- Caro-Kann structures where placement and breaks matter more than tactics

### `trap`

Use for lines whose main purpose is to teach a tactical trap or common tactical
punishment.

Teaching goal:

- show the trap pattern
- show the opponent mistake that triggers it
- show the tactical punishment clearly

Complete when:

- the punishment sequence is visible
- the learner has seen the tactical payoff
- and the point of the trap no longer depends on additional memorized moves

Typical examples:

- Legal Trap-style patterns
- early tactical punishments in the Italian or Scotch family

### `gambit`

Use for lines whose main purpose is to teach a gambit or sacrifice-based
opening idea.

Teaching goal:

- show what is given up
- show what is gained in return
- show why the resulting compensation is playable or dangerous

Complete when:

- the compensation is visible, or
- the material is recovered, or
- the resulting initiative, attack, or structural gain is clearly understood

Typical examples:

- Fried Liver-style attacking continuations
- Evans Gambit development/initiative lines
- Smith-Morra-style compensation lines

### `punishment`

Use for lines whose main purpose is to refute or punish an inaccurate response
from the opponent.

Teaching goal:

- show the specific mistake
- show the best practical response
- show the resulting advantage or why the mistake matters

Complete when:

- the punishment is demonstrated
- the resulting advantage is clear
- and the learner can understand the consequence of the opponent's error

Typical examples:

- anti-beginner sideline punishments
- incorrect defensive responses to gambits

### `forcing`

Use for lines whose main purpose is to teach a narrow sequence of best moves
where branching is limited for several moves.

Teaching goal:

- show the correct move order
- show the forced sequence cleanly
- show the resulting position the learner should aim for

Complete when:

- the forcing sequence has ended
- the resulting position is understandable
- and the next moves branch into wider play

Typical examples:

- heavily forced tactical continuations
- best-play continuations after an opening tactic is triggered

## Choosing The Primary Category

Pick the category by asking:

What is the single most important thing this line is supposed to teach?

Use this decision order:

1. If the line exists mainly to punish a mistake, use `punishment`.
2. If the line exists mainly to show a trap, use `trap`.
3. If the line exists mainly to show compensation after a sacrifice or gambit,
   use `gambit`.
4. If the line is mostly a narrow best-play sequence, use `forcing`.
5. If the line mainly teaches a strategic concept beyond simple setup, use
   `strategic`.
6. Otherwise, use `setup`.

## Secondary Tags

Primary category decides the review standard. Secondary tags add context.

Use zero or more of these as secondary tags:

- `main-line`
- `sideline`
- `named-variation`
- `common`
- `rare`
- `beginner-trap`
- `sacrifice`
- `attack`
- `defensive-resource`
- `transposition-prone`

Secondary tags must not replace the primary category.

## Per-Line Review Fields

For each line, record the following during review:

- `primaryCategory`
- `secondaryTags`
- `teaches`
- `stopReason`
- `finalPositionSummary`
- `continueIfDeeper`

Field meanings:

- `primaryCategory`: one of the categories in this document
- `secondaryTags`: optional descriptors
- `teaches`: one sentence describing the line's core lesson
- `stopReason`: one sentence explaining why the line ends where it ends
- `finalPositionSummary`: one sentence describing what the learner should see
  in the final position
- `continueIfDeeper`: why extra moves would be helpful or unnecessary

## Review Template

Use this template when reviewing a line:

```md
- Opening:
- Line:
- Primary category:
- Secondary tags:
- Teaches:
- Final position summary:
- Stop reason:
- Continue if deeper:
```

## Acceptance Test By Category

Before accepting a line, verify the category-specific question.

- `setup`: Can the learner recognize the target setup or tabiya?
- `strategic`: Can the learner explain the plan or positional goal?
- `trap`: Has the tactical punishment been shown clearly?
- `gambit`: Has the compensation or payoff of the sacrifice been shown?
- `punishment`: Has the consequence of the opponent's mistake been shown?
- `forcing`: Has the narrow best-play sequence actually ended?

If the answer is "not yet", the line is not complete.

## Dataset Rule

If a line seems to fit multiple categories, choose the category that best
explains why the user should spend memory on it.
