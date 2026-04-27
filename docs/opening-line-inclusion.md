# FirstMove Opening Line Inclusion Policy

## Purpose

This document defines what makes an opening line eligible to exist in
FirstMove.

This policy is separate from the stopping rules.

- `opening-line-spec.md` answers: where should a line end?
- this document answers: should this line exist as a distinct line at all?

The goal is broad useful coverage, not minimal coverage.

## Core Principle

A FirstMove line should exist if it represents a recognizable branch that a
learner would benefit from being able to identify, practice, and remember as
its own unit.

The threshold for inclusion should be generous.

If one move changes what the learner should recognize, expect, or do, that can
be enough for the branch to deserve its own line.

## Default Inclusion Rule

Include a line if at least one of these is true:

1. It is a recognized named variation.
2. It is a common practical branch, even if the label is broad or informal.
3. It teaches a distinct response, punishment, trap, setup, or strategic plan.
4. A move-order difference changes what the learner must recognize or play.
5. It is important for repertoire coverage, even if closely related to another
   line.

If none of those are true, the line likely does not need to exist as its own
entry.

## High-Level Inclusion Bias

FirstMove should prefer inclusion over exclusion when the branch is real and
teachable.

Do not exclude a line merely because:

- it is close to another line
- only one move differs
- it transposes later
- it belongs to a broader opening family
- the label is app-specific rather than encyclopedic

If the branch creates a distinct recognition task for the learner, it is still
valuable.

## What Counts As A Distinct Line

A line is distinct enough to exist when at least one of the following is true:

- it has a recognized name in a reliable opening source
- it reaches a different early tabiya or pawn structure
- it requires a different move-order response from the learner
- it creates a different tactical danger or punishment pattern
- it changes the side's development priorities
- it leads to a different compensation pattern in a gambit or sacrifice line
- it is a common practical branch the learner should be ready to meet

This means two lines may both deserve inclusion even if they later converge.

## Named Lines

Named lines should generally be included.

Why:

- a name is strong evidence that the branch is recognized
- named lines are easier for users to search, remember, and discuss
- named lines provide useful anchors for coverage and testing

But a line does not need a formal name to qualify.

A branch may still belong in FirstMove if it is clearly real, useful, and
teaches a distinct recognition or response pattern.

## Unnamed Or Broadly Named Lines

Include an unnamed or informally named line if it still serves the learner.

This is especially appropriate when:

- the branch is common in practical play
- it is a setup/system branch rather than a narrow named variation
- it exists mainly to teach a specific punishment or defensive resource
- a move-order distinction matters even if encyclopedia naming is inconsistent

In those cases, the app may use a practical teaching label instead of forcing a
strict encyclopedia name.

Examples:

- `vs French Setup`
- `Main Setup`
- `Punish 3...??`
- `Accepted`

These are acceptable if they describe a real branch clearly.

## Duplication Policy

Do not remove a line only because it is very similar to another line.

Similarity alone is not a reason to merge or drop it.

Keep both lines if the learner benefits from treating them separately.

That is true when:

- the branching move appears early enough to require different recognition
- the learner's best response changes
- the teaching point changes
- the resulting category changes
- the branch would deserve its own test prompt

Only merge or drop a line when the separate entry adds essentially no distinct
recognition or teaching value.

## When A Line Should Not Be Separate

A line usually should not exist as a separate entry if all of the following are
true:

1. It has no recognized independent identity.
2. It does not change the learner's response or understanding.
3. It does not create a different tactical, strategic, or setup lesson.
4. It only repeats another line under a different label.

This should be a high bar.

If there is real doubt, bias toward keeping the line.

## Inclusion Questions For Every Candidate Line

Before accepting a line, answer these questions:

1. What exactly does the learner need to recognize here?
2. Would the learner need to respond differently from a nearby branch?
3. Does this branch teach something distinct enough to be practiced on its own?
4. Is this a recognized named line, or a practical branch worth teaching even
   without a strict name?
5. Would omitting this line leave a coverage gap in the opening family?

If question 2, 3, or 5 is meaningfully yes, the line likely belongs.

## Inclusion Outcome Labels

Use one of these outcomes during curation:

- `include-authoritative`
- `include-practical`
- `include-app-label`
- `include-other`
- `merge`
- `exclude`
- `manual-review`

Meaning:

- `include-authoritative`: include as a recognized named variation
- `include-practical`: include because it is a real practical branch
- `include-app-label`: include with a clear teaching label rather than a strict
  variation name
- `include-other`: include as a useful branch within the opening family, but
  place it in a future `Others` bucket rather than among the main named lines
- `merge`: do not keep as a separate line; fold into another line's branch
- `exclude`: do not include in the library
- `manual-review`: needs human review before deciding

## Default Recommendation

Use this inclusion bias:

- include named lines by default
- include practical non-named branches when the learner's recognition or
  response changes
- reserve `include-other` for useful real branches that belong to the opening
  but do not have a stable authoritative or practical teaching label
- allow near-neighbor branches to coexist if they would lead to different
  teaching or testing
- only merge or exclude branches that are effectively duplicates in teaching
  value

## Future `Others` Bucket

FirstMove may later expose an `Others` section inside an opening's line list.

This should not be a junk drawer. Use it only for branches that:

- clearly belong to the opening family
- are still useful to practice
- do not have a stable authoritative variation name
- and are weaker fits for the main named or practical sections

For now, treat `include-other` as a data classification first. The app does not
need to expose a visible `Others` section until the regenerated library is
large enough that grouping improves usability.

## One-Sentence Project Rule

A FirstMove line should exist whenever it represents a real branch that changes
what the learner should recognize, expect, or do, even if it differs from a
nearby line by only a small number of moves.
