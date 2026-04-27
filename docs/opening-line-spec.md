# FirstMove Opening Line Spec

## Purpose

This document defines when a FirstMove opening line should stop.

The goal is to include enough moves to teach the opening's real value without
forcing the user to memorize low-value continuation moves that belong more to
general middlegame play than opening knowledge.

## Core Principle

A FirstMove line ends at the earliest point where the variation's identity,
purpose, and practical consequence are clear, and further accurate moves would
mostly test memory rather than teach opening understanding.

## Stop Rule

Stop a line when all of the following are true:

1. The opening or variation identity is established.
2. The core idea of the line has been demonstrated.
3. Any forcing sequence caused by the line has resolved.
4. Any sacrifice, gambit, or trap has shown its practical outcome.
5. The next strong moves begin to branch into normal chess rather than
   opening-specific knowledge.
6. Continuing would add little teaching value compared with the amount of
   memorization required.

## Meaning Of "Resolved"

A line is resolved when the learner can understand:

- what the line was trying to achieve
- what position the side being trained was aiming for
- what happens if the opponent follows or misses the key idea
- why the line matters in practical play

If the learner can answer those questions from the position on the board, the
line is usually deep enough.

## Variation Categories

Use the line's category to judge what "complete" means.

### Setup / Tabiya Line

Use when the opening aims to reach a stable piece setup or pawn structure.

Stop when:

- the intended structure is on the board
- the key development squares are occupied
- and the next strong moves become flexible plan choices rather than forced
  opening knowledge

### Tactical Trap Line

Use when the opening contains a common tactical trick or punishment.

Stop when:

- the trap has either succeeded or failed
- the punishment sequence is visible
- and the learner has seen the practical payoff of the idea

Do not stop at the moment the trap is merely offered.

### Gambit / Sacrifice Line

Use when one side gives material or structure to gain initiative, development,
king safety pressure, or another form of compensation.

Stop when:

- the compensation is clearly visible, or
- the material is recovered, or
- the attack/initiative resulting from the sacrifice is already understood

Do not stop on the sacrifice move alone.

### Forced Refutation / Punishment Line

Use when a variation exists mainly to show the best response to an inaccurate
or inferior move.

Stop when:

- the punishment has been demonstrated
- the resulting advantage is clear
- and the next moves are no longer specific to the opening mistake

### Strategic Development Line

Use when the line teaches development priorities, central control, piece
placement, or a long-term structural plan rather than a forcing tactic.

Stop when:

- the strategic setup is complete enough to understand
- the learner can see the intended plans
- and the next moves become normal strategic chess rather than opening theory

## What Not To Optimize For

Do not use these as the main stopping rule:

- a fixed number of moves
- a minimum move count
- a maximum move count
- engine evaluation alone

These may be used later as sanity checks, but they must not decide line depth
by themselves.

## Review Questions For Every Line

Before accepting a line into the dataset, answer these questions:

1. What is the exact idea this line teaches?
2. Has that idea clearly appeared on the board by the final move?
3. If the line contains a trap, gambit, or sacrifice, has the payoff been
   shown?
4. If the line stopped here, would a learner understand why the line matters?
5. Would adding more moves still teach opening knowledge, or would it mostly
   test memory?

If question 5 is answered with "mostly memory", the line should stop.

## Acceptance Standard

A FirstMove line should be:

- long enough to teach the opening's point
- short enough to avoid rote memorization of low-value continuation moves
- specific enough to show practical punishment or compensation when relevant
- shallow enough to hand the learner off to normal chess at the right moment

## Practical Examples

- A quiet Italian setup may stop once the tabiya and plans are clear.
- A Fried Liver-style line should continue beyond the sacrifice until the
  tactical payoff or compensation is visible.
- A punished sideline should continue until the punishment is understood, not
  merely triggered.

## One-Sentence Project Rule

A FirstMove opening line should stop at the earliest point where the opening's
instructional value is complete and further moves would mostly belong to normal
chess rather than opening knowledge.
