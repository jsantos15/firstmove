# FirstMove Opening Line Generation Algorithm

## Purpose

This document defines the practical generation algorithm that should replace
the earlier rebuild workflow.

The algorithm is designed to:

- preserve known opening and variation structure
- teach what users are likely to face in real games
- prefer practical strong moves over raw engine-only play
- stop before the library turns into low-value memorization

This document is the implementation target for the next generator rewrite.

## Current Scope

This document currently defines the Phase 1 generator target.

Phase 1 includes:

- all named variation anchors
- one generated practical continuation per non-main named variation
- source main-line entries stored as reference theory
- direct stopping logic based on raw practical signals

Phase 1 does not yet include:

- recursive teaching branches
- trained-side practical override search
- human-practical outcome bar classification

The human-practical outcome bar remains future work and is intentionally not a
dependency for the Phase 1 generator.

## Core Model

FirstMove should generate opening content in this order:

1. Load known named variation anchors.
2. Store source main-line entries as reference theory.
3. Continue forward from each non-main named anchor.
4. Create post-anchor teaching branches only when branch rules are satisfied.
5. Continue each accepted line until the payoff is visible.
6. Store both structural and teaching metadata so the app can later decide what
   to show.

## Key Concepts

### Opening

The top-level family, such as:

- `Italian Game`
- `Caro-Kann Defense`
- `King's Indian Defense`

### Variation Anchor

A named variation from the accepted naming source.

Examples:

- `Italian Game: Giuoco Pianissimo`
- `Caro-Kann Defense: Main Line`
- `Caro-Kann Defense: Tartakower Variation`

Variation anchors are included by default.

### Main Variation Line

One generated continuation per variation anchor that starts from the official
named variation PGN, then continues using FirstMove's move-selection rules even
if the payoff is quiet.

### Teaching Branch

A practical lesson line inside a variation. It branches after the variation
anchor and exists to teach:

- a tactical payoff
- a strategic setup
- a structural edge
- a compensation pattern
- a defensive equalizing scheme
- another clear instructional payoff

### Custom Variation

A practical branch that does not currently match a named variation anchor but
is still worth storing because it is common enough or distinct enough to matter.

## Inputs

The algorithm should use these inputs.

### Naming Authority

Primary naming source:

- `lichess-org/chess-openings`

Use it for:

- opening names
- variation names
- variation nesting
- anchor PGNs

### Human Popularity Source

Primary branch-frequency source:

- Lichess Opening Explorer

Use it for:

- move popularity within a node
- cumulative branch coverage
- node sample-size confidence
- practical move-order behavior

### Engine Source

Primary engine source:

- Stockfish

Use it for:

- current eval
- eval swing detection
- best-practical move selection
- line validation
- final-position explanation support

## Output Model

Every generated record should be one of:

- `main_variation_line`
- `teaching_line`
- `custom_variation_line`

Each line should stay attached to an opening and a variation path.

## Default Parameters

These are the recommended v1 defaults.

### Structural Defaults

- `include_all_named_variations = true`
- `store_source_main_line_references = true`
- `store_one_practical_line_per_named_node = true`
- `allow_custom_variations = false` in Phase 1

### Branching Defaults

- `coverage_target_early = 0.80`
- `coverage_target_mid = 0.75`
- `coverage_target_late = 0.70`
- `branch_popularity_floor_early = 0.15`
- `branch_popularity_floor_mid = 0.20`
- `branch_popularity_floor_late = 0.25`
- `max_branches_per_node = 4`
- `dominant_move_threshold = 0.65`
- `hard_dominant_move_threshold = 0.75`
- `max_branch_ply_from_anchor = 18`

### Confidence Defaults

- `min_games_at_node = 250`
- `min_games_for_branch_move = 100`

These should be treated as initial defaults, not permanent truths.

### Eval / Move-Choice Defaults

- `minimum_stem_eval_gain = 0.80`
- `max_teachability_eval_loss_quiet = 0.20`
- `max_teachability_eval_loss_tactical = 0.35`

### App Display Defaults

These do not control generation, but they are likely useful later:

- `max_visible_lines_per_opening = 10`
- `always_show_main_line = true`
- no database-generation cap by default; cap only the app-visible subset

## Depth Bands

Branching should get stricter as a line goes deeper from the active variation
anchor.

### Early Band

Use for `0-4` plies from the active anchor.

Rules:

- coverage target `80%`
- branch floor `15%`
- allow richer branching

### Mid Band

Use for `5-8` plies from the active anchor.

Rules:

- coverage target `75%`
- branch floor `20%`
- start suppressing weaker side branches

### Late Band

Use for `9-12` plies from the active anchor.

Rules:

- coverage target `70%`
- branch floor `25%`
- branch only when a move is clearly meaningful

### Post-Cutoff

Use for any point beyond `18` plies from the active anchor.

Rules:

- do not create new branches
- continue the current line only if needed to make the payoff visible

## Variation-First Workflow

### Step 1. Build The Named Variation Tree

For each opening family:

1. load every known named variation anchor
2. preserve nested variation structure
3. preserve anchor PGNs and FENs

Important:

- if a move is unnamed at one node but later resolves into a known named
  variation, continue it until the name appears
- the deeper named variation should become the new active structural anchor

### Step 2. Create Reference And Practical Lines

For every accepted non-main variation anchor:

1. initialize a line at the official variation anchor position
2. continue forward using:
   - side being taught: best practical move
   - opponent: most popular human move
3. stop using the line stop rules

This practical line should be stored even if:

- the payoff is quiet
- the position is mainly structural
- the line is not especially flashy

Named source entries labeled as `Main Line` should be stored as reference
theory without extra generated continuation. Practical payoff generation starts
from parent named variation nodes, so deeper reference lines do not override the
teaching value of gambits, attacks, and other earlier named nodes.

## Best Practical Move Selection

The side being taught should use the `best practical move`.

### Default Rule

Use the engine-best move in Phase 1.

### Practical Override Rule

Allow a non-top engine move only if all of these are true:

1. eval loss is within the allowed threshold
2. the move is more teachable, more thematic, or more practical
3. the move does not turn the line into objectively dubious hope chess
4. the move helps preserve a useful human learning pattern

Use:

- quiet/strategic positions: max eval loss `0.20`
- tactical-payoff positions: max eval loss `0.35`

This override behavior is later work. It should not be used by the Phase 1
generator until it is explicitly implemented and tested.

## Opponent Move Selection

Opponent moves should usually follow human popularity from Lichess Explorer.

Within a node:

- use move percentage to rank branches
- use game count as a confidence threshold

Do not treat game count as an independent ranking signal inside one node.

## Teaching Branch Creation

Teaching branches are only considered after the active variation anchor.

### Branch Eligibility Rule

A candidate opponent move is eligible to branch if all of these are true:

1. the node has enough games to trust
2. the move has enough games to trust
3. the move satisfies the depth-adjusted popularity floor
4. the move is needed for cumulative coverage or is exceptionally important
5. the move creates a distinct learner task, a meaningful eval swing, or a
   clearly different structural/tactical outcome

### Distinct Learner Task

A move creates a distinct learner task if it changes:

- what the learner should recognize
- what the learner should play
- the resulting structure
- the resulting pressure target
- the tactical pattern
- the compensation pattern
- the defensive goal

### Eval-Swing Trigger

A move should be treated as a strong branch stem candidate if:

- it is popular enough
- and it causes a meaningful eval change

Recommended default:

- branch stem becomes strongly justified when eval changes by at least `0.80`
  pawns in the trained side's favor

### Dominant Move Suppression

If the top move is too dominant:

- if top move >= `65%`, suppress weak side branches unless they are still above
  the depth-adjusted floor and clearly distinct
- if top move >= `75%`, suppress all side branches unless they are exceptional

## Recursive Branching

Teaching branches can themselves branch later.

Use the same branch rules recursively, but apply:

- depth band strictness
- branch cutoff
- max branches per node

Example:

```text
Caro-Kann Defense
  Main Line
    main variation line
    branch: Nxf6+
      branch: Nf3
      branch: c3
    branch: Ng3
```

## Custom Variation Promotion

If a branch does not match a known named variation, but is still practical and
stable enough to matter, mark it as a custom variation candidate.

Promote it when:

1. it remains common enough
2. it creates a stable practical identity
3. it does not cleanly duplicate an existing known variation

If it later transposes into a named variation, record that transposition.

Custom variation promotion starts after Phase 1.

## Stop Rules

Use the closing algorithm later in this document as the concrete implementation
target.

This section keeps only the high-level stopping intent.

### Stop A Line When

1. the branch identity is established
2. the teaching idea is visible
3. the tactical or strategic payoff is visible
4. the next moves are mostly normal chess or technical conversion
5. adding more moves would mostly test memory

### Visible Payoff Types

A line does not need to end in material gain.

Acceptable payoff types include:

- `material`
- `initiative`
- `attack`
- `development`
- `structure`
- `space`
- `king_safety`
- `pressure`
- `compensation`
- `equalization`
- `defensive_setup`
- `setup_completion`

### Important Distinction

Do not stop at the first moment the engine already sees the advantage.

Instead:

- use engine eval to detect that a branch matters
- continue until the learner can understand why the branch matters

## Metadata Requirements

Store enough information to support future app ranking and filtering.

At minimum:

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
- `lineType`
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

## Ranking And Filtering Guidance

Generation should be broader than app display.

That means:

- keep more valid lines in the DB
- show a stricter subset in the app
- avoid trimming named-node teaching lines during normalization unless an
  explicit review/export cap is requested

Recommended app ranking order:

1. main line
2. tactical-payoff lines
3. tactical winning branches
4. strategic or structural branches
5. quieter reference lines

## Suggested Implementation Order

Implement this in phases.

### Phase 1

- load named variation anchors
- store source main-line entries as reference theory
- store one generated practical continuation per non-main named variation
- use direct closing logic from raw signals
- no recursive teaching branches yet

### Phase 2

- add post-anchor teaching branches
- add trained-side practical override search
- add depth-aware branch filtering

### Phase 3

- add custom variation promotion
- add a future human-practical outcome bar if still useful
- add app-side ranking and display tuning

## Final Project Rule

FirstMove should generate lines by starting from named variation anchors,
continuing with best-practical moves against real human branches, and stopping
when the branch payoff is visible enough for a learner to understand without
memorizing unnecessary continuation moves.

## Closing Algorithm

### Purpose

The closing algorithm decides where a generated line should stop.

It should stop lines:

- late enough to show the line's practical value
- early enough to avoid low-value memorization
- according to the line's teaching purpose
- while staying inside FirstMove's continuation policy

This closing algorithm should be treated as the primary stopping system.

Important:

- the closing algorithm is the Phase 1 implementation target
- a future human-practical outcome bar may reuse these same signals later
- the closing algorithm does not depend on that future bar

## Closing Pipeline

For each candidate stop position, evaluate in this order:

1. compute raw signals
2. evaluate core safety
3. evaluate category completion
4. evaluate short-horizon upgrade potential
5. stop or continue

## Raw Signals

### Engine-centered

- `currentEvalCp`
- `evalStabilityCp`
- `topMoveGapCp`
- `playableMoveCount`
- `onlyMovePressure`

### Position-centered

- `tacticalVolatility`
- `materialEdgePawns`
- `developmentScore`
- `kingSafetyState`
- `compensationVisibility`

### Confidence-centered

- `nodeSampleGames`

## Raw Signal Definitions

### `currentEvalCp`

Stockfish evaluation from the trained side's perspective.

Use as supporting evidence only. Do not stop a line from eval alone.

### `evalStabilityCp`

How much the evaluation has moved recently.

Suggested computation:

- compare current eval to eval 2 plies ago
- compare current eval to eval 4 plies ago
- use the maximum absolute difference

Suggested default bands:

- `<= 40 cp`: stable
- `41-100 cp`: somewhat unstable
- `> 100 cp`: unstable

### `topMoveGapCp`

Difference between the best move and second-best move for the side to move.

This is a key human-practical signal. A high move gap often means the position
is still too narrow or fragile for a clean stop, especially in quiet or
strategic lines.

This matters even when the engine eval looks fine. Engine equality or a small
engine edge is not enough if missing the top move would make the resulting
human position collapse.

Suggested default bands:

For `setup` and `strategic`:

- `<= 40 cp`: very comfortable
- `41-80 cp`: acceptable if other signals are good
- `> 80 cp`: usually too narrow to stop
- `> 150 cp`: highly critical, do not stop

For `tactical_payoff` and `forcing`:

- `<= 80 cp`: comfortable enough after resolution
- `81-120 cp`: acceptable only if payoff is already clearly visible
- `> 120 cp`: usually too forcing to stop
- `> 200 cp`: do not stop

### `playableMoveCount`

How many candidate moves are practically acceptable.

Suggested computation:

- use top `3` MultiPV moves in v1
- count moves within an acceptable loss of best

Suggested tolerances:

- quiet / strategic lines: within `75 cp`
- tactical / forcing lines: within `50 cp`

Interpretation:

- `>= 2`: some practical freedom
- `>= 3`: healthy freedom

### `onlyMovePressure`

Whether one side effectively has only one acceptable move.

Suggested computation:

- `true` if `playableMoveCount <= 1`
- or if `topMoveGapCp` is above the critical threshold for the line type

If `onlyMovePressure` is true, the line usually should not stop yet.

### `tacticalVolatility`

Whether a tactical or forcing sequence is still unresolved.

Suggested v1 scoring:

- `+1` for each tactical SAN in the last 4 plies:
  - capture `x`
  - check `+`
  - mate `#`
- `+1` if Stockfish best move is a check
- `+1` if Stockfish best move is a capture
- `+1` if eval swing over the last 2 plies is greater than `100 cp`

Suggested bands:

- `0-1`: low
- `2-3`: medium
- `4+`: high

Interpretation:

- `high`: do not stop
- `medium`: only stop if the category strongly allows it and payoff is already
  obvious
- `low`: tactically calm enough to consider stopping

### `materialEdgePawns`

Material balance from the trained side's perspective using standard piece
values.

Suggested interpretation:

- `>= 1`: visible material edge
- `>= 2`: clear material gain
- `>= 4`: decisive material outcome

### `developmentScore`

How complete the trained side's opening development is.

Suggested v1 scoring:

- `+1` for each developed knight
- `+1` for each developed bishop
- `+2` if castled

Suggested interpretation:

- `0-1`: undeveloped
- `2-3`: partially developed
- `4+`: setup substantially developed
- `6`: setup cleanly finished

### `kingSafetyState`

Practical king safety for each side.

Possible states:

- `safe`
- `softly_exposed`
- `exposed`
- `critical`

Suggested interpretation:

- if the trained side's king is `critical`, do not stop
- if the opponent king is `exposed` or `critical`, that strongly supports
  tactical-payoff visibility

### `compensationVisibility`

Whether non-material compensation is already understandable to a human.

Possible states:

- `none`
- `partial`
- `clear`

This remains a direct closing-algorithm signal in Phase 1. It may later become
an input to a separate human-practical outcome bar, but it should not wait for
that future layer.

Suggested interpretation:

Set `partial` if:

- eval is clearly favorable (`>= 120 cp`)
- and one of these is true:
  - trained side leads in development
  - opponent king safety is compromised
  - trained side has persistent initiative

Set `clear` if:

- eval is strongly favorable (`>= 180-220 cp`)
- and at least 2 of these are true:
  - trained side is developed and coordinated
  - opponent king is exposed or under real attack
  - initiative is clearly sustained
  - structural damage is obvious and lasting
  - compensation has become easy to explain to a human learner

### `nodeSampleGames`

Total number of Lichess games at the current node.

Suggested default:

- `minNodeSampleGames = 250`

Interpretation:

- below the threshold, continuation confidence is thin
- thin sample may justify stopping unless the payoff has already clearly
  resolved

## Core Safety

These are universal stop guards. A line is not eligible to stop unless all pass.

### Universal Musts

- `tacticalVolatility` is not high
- `onlyMovePressure` is false
- `topMoveGapCp` is within the category threshold
- `evalStabilityCp` is stable enough
- the trained side's `kingSafetyState` is not `critical`
- `nodeSampleGames` is above the confidence floor, or the payoff is already
  clearly resolved

If one of these fails, the line should continue unless continuation confidence
has become so thin that the generator must settle for a reference-style ending.

## Category Completion

After core safety passes, the line must satisfy its category-specific endpoint.

Category completion answers a different question from core safety:

- core safety asks whether the position is stable enough to stop
- category completion asks whether the line has actually taught what it was
  supposed to teach

### `setup`

Stop only when:

- the intended setup or tabiya is recognizable
- development is complete enough to understand the opening goal
- the learner can now play normal chess from the position

Strong completion bonus:

- castling if it is 1-2 natural moves away and clearly completes the setup

Castling is not a universal hard requirement. It is only a nearby completion
bonus when it naturally improves the endpoint.

Not required:

- material gain
- large eval edge

### `strategic`

Stop only when:

- the strategic goal is visible
- the learner can identify the plan, pressure target, or structural
  achievement
- the line no longer depends on narrow move-order memory

Strong completion bonus:

- castling or one more natural improving move if it clearly completes the
  strategic picture

Not required:

- tactical win
- material edge

### `tactical_payoff`

Stop only when:

- the payoff is visible
- the learner can clearly see what was won or achieved
- the tactical sequence is resolved enough that the point is obvious

Visible payoff can be:

- material gain
- compensation
- decisive initiative
- structural damage
- king safety collapse
- attack clearly becoming real

Do not stop:

- on the trap offer alone
- on the gambit move alone
- before the punishment or compensation is understandable

### `forcing`

Stop only when:

- the forcing phase is over
- only-move pressure has dropped enough
- the resulting position is understandable without more exact memorization

## Short-Horizon Upgrade Check

Even if a line is eligible to stop, continue if a clearly better endpoint is
very close.

### Horizon

Suggested default:

- `4` plies
- absolute max `6` plies

### Allowed Paths Only

The short-horizon check must only follow moves that are still valid under the
continuation algorithm.

That means:

- trained side uses the allowed trained-side move rule
- opponent side uses only moves allowed by the popularity policy
- no off-policy engine fantasy lines
- no excluded side branches
- no low-sample continuations that the main algorithm would reject

This means the short-horizon check is not a separate search policy. It is only
a bounded look-ahead through moves the main generation algorithm would already
have been willing to follow.

### Meaningful Upgrade

A short-horizon improvement counts only if it produces a substantially cleaner
or stronger endpoint, for example:

- setup completion clearly improves
- tactical sequence fully resolves
- compensation becomes clearly visible
- top-move gap falls into a healthier band
- king danger resolves
- material gain lands
- strategic plan becomes much easier to explain

Do not extend for:

- tiny eval bumps only
- deep conversion sequences
- low-popularity tails
- prettier but not more instructive move orders

## Reference vs Teaching Lines

### Reference Main Line

Purpose:

- preserve named variation structure

Rule:

- may stop in a merely stable or reference-worthy position if that is the best
  natural outcome within the continuation rules

### Teaching Line

Purpose:

- show a useful practical outcome to the learner

Rule:

- should stop only once it shows a useful practical result, not just an
  unresolved equal position

In Phase 1, most stored lines are still main or reference continuations. This
distinction matters now mainly for stopping intent and future display policy.

## Final Stop Decision

A line stops only if all are true:

1. core safety passes
2. category completion is satisfied
3. no clearly better endpoint is reachable inside the short-horizon window
   through allowed continuation moves

## Recommended v1 Defaults

- `multipvCount = 3`
- `evalStabilityStableCp = 40`
- `evalStabilityUnstableCp = 100`
- `topMoveGapQuietComfortCp = 40`
- `topMoveGapQuietMaxCp = 80`
- `topMoveGapTacticalComfortCp = 80`
- `topMoveGapTacticalMaxCp = 120`
- `playableMoveWindowQuietCp = 75`
- `playableMoveWindowTacticalCp = 50`
- `minNodeSampleGames = 250`
- `shortHorizonPlies = 4`
- `shortHorizonMaxPlies = 6`

## Practical Outcome Bar Status

FirstMove may later add a separate human-practical outcome bar or
`practicalOutcomeLevel` layer.

That work is intentionally postponed.

For now:

- the generator reads raw practical signals directly
- the closing algorithm decides where lines stop
- no separate human-practical score is required for Phase 1

## Final Closing Rule

Stop at the earliest position where the line's instructional payoff is visible,
the position is no longer too tactically or practically fragile for a learner,
and continuing a few more allowed moves would not produce a meaningfully better
endpoint.
