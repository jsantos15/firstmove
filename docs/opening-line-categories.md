# FirstMove Opening Line Categories

## Purpose

This document defines the active primary-category model for generated opening
lines.

Each line gets exactly one primary category.

The category answers:

1. what the line is teaching
2. what counts as a complete stopping point

## Active Primary Categories

Use exactly one of these:

### `setup`

Use when the line mainly teaches a recognizable tabiya, piece setup, or pawn
structure.

Teaching goal:

- show the intended formation
- show the correct development pattern
- hand the learner off to normal chess from a stable setup

Complete when:

- the intended setup is visible
- development is sufficiently complete
- deeper moves would mostly become flexible plans instead of opening memory

### `strategic`

Use when the line mainly teaches a positional goal, structural idea, or opening
specific plan beyond simple setup.

Teaching goal:

- show the plan
- show the pressure target, structure, or pawn-break idea
- show why the position is desirable for the trained side

Complete when:

- the strategic goal is visible
- the learner can identify the plan or pressure
- deeper moves would mostly become normal middlegame play

### `tactical_payoff`

Use when the line mainly teaches a concrete payoff:

- a trap pattern
- a gambit payoff
- a punishment sequence
- a tactical attacking result
- visible compensation after sacrifice

Teaching goal:

- show the practical reward of the line
- make the tactical or compensational point visible
- stop once the payoff is understandable without extra low-value moves

Complete when:

- the payoff is visible
- the tactical or compensational point is understandable
- deeper moves would mostly be conversion rather than opening instruction

### `forcing`

Use when the line mainly teaches a narrow best-play sequence where branching is
constrained for several moves.

Teaching goal:

- show the correct move order
- show the forced sequence cleanly
- reach the resulting position the learner should recognize

Complete when:

- the forcing phase has ended
- only-move pressure has eased enough
- the resulting position is understandable without more exact memorization

## Category Choice Rule

Pick the category by asking:

What is the single most important thing this line is asking the learner to
remember?

Use this order:

1. If the line exists mainly to reach a stable formation, use `setup`.
2. If it mainly teaches a positional goal or plan, use `strategic`.
3. If it mainly teaches a concrete tactical or compensational result, use
   `tactical_payoff`.
4. If it mainly teaches a narrow best-play sequence, use `forcing`.

## Secondary Tags

Primary category controls stopping and review. Secondary tags add context.

Useful examples:

- `main-line`
- `sideline`
- `named-variation`
- `common`
- `rare`
- `attack`
- `defensive-resource`
- `sacrifice`
- `transposition-prone`

Secondary tags do not replace the primary category.

## Acceptance Test By Category

Before accepting a generated line:

- `setup`: is the target setup or tabiya recognizable?
- `strategic`: is the plan or structural goal understandable?
- `tactical_payoff`: is the reward, punishment, or compensation visible?
- `forcing`: has the forced phase actually ended?

If the answer is no, the line is not complete yet.
