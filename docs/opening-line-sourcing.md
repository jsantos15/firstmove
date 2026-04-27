# FirstMove Opening Line Sourcing

## Purpose

This document defines how FirstMove should source, extend, branch, and store
opening lines under the rebuilt practical-teaching model.

The goal is to build a dataset that is:

- grounded in known opening and variation structure
- driven by real human branch frequency where it matters
- validated by engine analysis without becoming engine-only
- organized for both opening reference and practical lesson delivery

## Core Sourcing Principle

FirstMove should anchor on known opening variations first, then build teaching
lines from those anchors using human-popular continuations and engine-approved
practical responses.

That means:

- known named variations define structure
- human popularity defines practical opponent branches
- Stockfish defines or validates the strongest practical response
- stopping still follows teaching value, not move count

## Structural Model

The rebuilt library should distinguish three layers.

### 1. Variation Anchor

A variation anchor is a known named opening variation accepted from the naming
source. These are included by default even if they would not survive the normal
popularity filter on their own.

Examples:

- `Caro-Kann Defense: Advance Variation`
- `Caro-Kann Defense: Exchange Variation`
- `Caro-Kann Defense: Main Line`
- `Caro-Kann Defense: Tartakower Variation`

Variation anchors can be nested. A deeper named variation should become the new
active structural anchor when it appears.

### 2. Main Variation Line

Every accepted variation anchor should store one main line, even if its payoff
is quiet or strategic.

This line is useful for:

- orientation
- theory breadcrumbs
- future UI highlights
- showing the learner when a known variation has been reached

The main line is not automatically the highest-priority teaching line in the
app, but it should exist in the data model.

### 3. Teaching Line

A teaching line is a practical continuation inside a variation. It may:

- continue the main variation path
- start at a later lesson stem inside the variation
- branch from a common practical opponent move
- end in tactical, structural, strategic, compensational, or defensive payoff

## Source Priority

Use this order when building the library.

### 1. Naming Authority

Use `lichess-org/chess-openings` as the primary naming authority for:

- opening names
- variation names
- variation nesting
- official anchor PGNs

These variation anchors should be included even if they are rare relative to
other branches from the same node.

### 2. Human Popularity Source

Use Lichess Opening Explorer as the practical opponent-behavior source after
the active variation anchor.

Use it to answer:

- what humans most commonly play from this exact position
- how concentrated or split the position is
- whether a branch is too rare to justify teaching
- whether the node has enough sample size to trust

### 3. Engine Analysis

Use Stockfish as a validation and practical-response source after the variation
anchor has been established.

Use it to:

- evaluate the current position
- detect meaningful eval swings after common opponent moves
- choose the best practical move for the side being taught
- validate final positions and line soundness

Do not use Stockfish as the sole source of opening structure.

## Known Variation Anchors

Treat every accepted named variation as a valid structural anchor, even when:

- it is not the top-popularity move at the earliest visible node
- its name only appears after a few more moves
- it is quiet, dubious, or not app-feature-worthy yet

Important consequence:

- a move that is unnamed at one node may later resolve into a named variation
- this means unnamed early moves should be allowed to continue until a later
  named anchor appears

## Custom Variations

Create a custom variation candidate when a practical branch:

- does not currently match a named variation anchor
- remains common enough to matter in practice
- creates a distinct teaching task or practical identity

Custom variations should be stored, but they do not need to be surfaced
prominently in the app until later.

If a custom branch later reaches a known named variation, record that
transposition in metadata.

## Post-Anchor Continuation Policy

After reaching an active variation anchor:

- the side being taught should usually follow the best practical move
- the opponent should usually follow the most popular human move

### Best Practical Move

The best practical move is:

- engine-best by default
- but may be overridden when a slightly weaker move is more teachable, more
  thematic, or more practical, and the eval loss stays acceptably small

This override should be used sparingly and never to justify objectively dubious
hope-chess continuations.

### Opponent Move Selection

Opponent moves should follow Lichess popularity inside the current node, subject
to:

- coverage target
- depth-adjusted popularity floor
- minimum sample-size confidence
- distinct-task or eval-swing significance

## Branching Model

### Branching Starts After The Variation Anchor

Do not use popularity branching to decide whether a known variation exists.

Instead:

- known variations are included first
- branching rules apply after the active variation anchor

### Teaching Branch Trigger

A new teaching branch should be created after the active variation anchor when a
common opponent move:

1. is popular enough at that node
2. is supported by enough games to trust the sample
3. creates a distinct learner task, or
4. causes a meaningful eval swing, or
5. materially changes the resulting structure, plan, attack, compensation, or
   pressure target

### Recursive Branching

Teaching branches may branch again later, but only while they remain inside the
branch-depth budget. This creates an indented tree:

```text
Opening
  Variation
    Main line
    Branch A
      Branch A1
      Branch A2
    Branch B
```

### Depth Policy

Branching should get stricter as the line goes deeper.

Use a hard cutoff after a defined number of plies from the active anchor. After
that point:

- do not create new branches
- but do allow the current line to continue until the payoff is visible

## Use Of Lichess Percentages And Game Counts

Inside one node, move percentage and move count rank moves the same way.

So:

- use move percentage to choose and rank branches within a node
- use game count as a sample-size confidence check, not as a second ranking
  signal

This means a branch should not be created from a node with too few games, even
if the local percentages look clean.

## Recommended Workflow

Use this workflow for each opening family.

### Step 1. Load Known Named Variations

Build the structural opening tree from the naming source:

- opening
- variation
- nested variation when present

### Step 2. Create One Main Line Per Variation

From each variation anchor, generate one main line using best-practical /
most-popular continuation rules, even if the resulting payoff is quiet.

### Step 3. Discover Teaching Branches

From the active variation anchor, inspect practical opponent branches and keep
the ones that satisfy the branch rules.

### Step 4. Extend To Visible Payoff

Continue each accepted line until the payoff is visible enough for a human
learner to understand why the branch matters.

### Step 5. Validate With Stockfish

Use Stockfish to:

- confirm that the line is sound
- measure eval changes around branch stems
- classify the resulting advantage/payoff

### Step 6. Store Metadata

Keep enough metadata to reconstruct:

- the opening/variation hierarchy
- where the lesson stem begins
- why the branch exists
- what payoff the branch demonstrates

## Required Metadata

Store at least the following fields during generation and review:

- `openingId`
- `openingName`
- `variationId`
- `variationName`
- `variationDepth`
- `variationPath`
- `variationAnchorPgn`
- `variationAnchorFen`
- `isCustomVariation`
- `transposesToVariationId`
- `lineId`
- `lineDisplayName`
- `isMainVariationLine`
- `isTeachingLine`
- `parentLineId`
- `branchDepth`
- `lessonStemPly`
- `lessonStemFen`
- `triggerMoveSan`
- `triggerMovePopularity`
- `gamesAtNode`
- `gamesForMove`
- `evalBeforeTrigger`
- `evalAfterTrigger`
- `evalGain`
- `primaryCategory`
- `advantageTypePrimary`
- `advantageTypeSecondary`
- `stopReason`
- `finalFen`
- `finalEvalCp`
- `finalEvalPerspective`
- `sourceType`
- `sourceName`
- `sourceConfidence`
- `engineChecked`

## Suggested Default Tuning Knobs

The most important parameters to tune are:

- `coverageTargetByDepth`
- `branchPopularityFloorByDepth`
- `minGamesAtNode`
- `minGamesForBranchMove`
- `maxBranchesPerNode`
- `maxBranchPlyFromAnchor`
- `minimumStemEvalGain`
- `maxTeachabilityEvalLoss`

These should be treated as generation parameters, separate from stricter
app-side display filters.

## What Not To Do

Do not:

- decide opening structure only from Lichess popularity
- treat named variations as expendable because they are rare
- branch forever just because a move has a legal continuation
- require every good line to end in a tactical material win
- assume engine-best and best-practical are always identical

## One-Sentence Project Rule

FirstMove should anchor on known variations first, then create practical
teaching lines inside those anchors using human-popular branches, engine-checked
responses, and payoff-based stopping.
