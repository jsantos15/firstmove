# FirstMove Opening Popularity Policy

## Purpose

This document defines how FirstMove should order openings and lines by
popularity in the app.

Popularity is separate from:

- naming
- inclusion
- stopping depth

A line may deserve inclusion even if it is not especially popular. Popularity
controls ordering, not basic eligibility.

## Product Rule

FirstMove should display:

1. opening families ordered by popularity
2. lines within each opening with the `main line` first when one exists
3. all remaining lines within that opening ordered by popularity

More popular items should appear first in the app.

## Main Line Rule

When an opening has a recognizable `main line`, that line should be shown first
inside the opening, even if another branch happens to be more popular in the
current data slice.

After the main line, all remaining lines should be ordered by popularity.

If an opening does not have a clear main line, order all of its lines by
popularity only.

## What "Main Line" Means

`Main line` does not simply mean "most played".

In chess usage, it usually means:

- the most established theoretical continuation
- the principal branch most commonly treated as the standard reference line
- or the branch that opening literature typically treats as the default path

Because of that:

- some openings do have a clear main line
- some openings do not
- some openings have multiple major branches without a single universally best
  candidate for `main line`

## Main Line Confidence

Use these values for the generated dataset:

- `authoritative`
  - the source clearly identifies the line as the main line or equivalent root
    branch
- `provisional`
  - FirstMove is treating the line as the main line for ordering purposes, but
    the source is not fully explicit
- `none`
  - no clear main line should be forced for this opening

Do not force a main line when the source evidence is weak.

## What Popularity Means

Popularity should measure how often the opening family or line is actually
played in real games, not how famous the name sounds.

Use popularity as a ranking signal based on game counts whenever possible.

## Current Practical Policy

For the first regeneration pass:

- include popularity fields in the generated dataset
- keep ordering logic ready in the data model
- do not invent popularity scores from weak proxies

If a reliable popularity source is unavailable during the first generation
pass, leave popularity metadata empty or provisional rather than pretending the
ranking is authoritative.

## Preferred Popularity Source

Use a large real-game opening explorer or opening-tree dataset that provides
move and position frequency.

Ideal qualities:

- position-based
- move-frequency counts
- modern practical game volume
- scriptable access

## What Popularity Should Control

Popularity should control:

- opening family order in the app
- line order within an opening
- default emphasis when multiple lines are all valid

Popularity should not control:

- whether a valid line is allowed to exist
- whether a line's name is authoritative
- where a line stops

## Learner-Facing Opening Candidates

Raw opening popularity counts include pass-through anchors that many games
visit before they become a meaningful opening course. These should stay in the
source popularity table for auditability, but they should be excluded from the
learner-facing `opening_index` backlog.

Examples:

- `King's Pawn Game`
- `King's Knight Opening`
- `Queen's Pawn Game`
- `Horwitz Defense`
- `Zukertort Opening`
- `Indian Defense`

These names are too broad or transpositional for a FirstMove course because the
player has not yet reached a stable opening identity. For example, `King's
Knight Opening` is mostly the natural gateway `1. e4 e5 2. Nf3`; it later
becomes Italian Game, Ruy Lopez, Scotch Game, Petrov's Defense, Philidor
Defense, and related courses.

Do not exclude by suffix alone. `English Opening`, `Bird Opening`, and
`Bishop's Opening` are legitimate course candidates even though their names end
in `Opening`.

## Data Fields

Each generated opening family should eventually support:

- `popularitySource`
- `popularityScore`
- `popularityRank`
- `popularityGames`

Each generated line should eventually support:

- `isMainLine`
- `mainLineConfidence`
- `mainLineSource`
- `popularitySource`
- `popularityScore`
- `popularityRankWithinOpening`
- `popularityGames`

Field meanings:

- `popularitySource`: source used for ranking
- `isMainLine`: whether the line should be pinned first in the opening
- `mainLineConfidence`: `authoritative`, `provisional`, or `none`
- `mainLineSource`: why the line is being treated as the main line
- `popularityScore`: normalized sortable score
- `popularityRank`: opening-family rank across the full library
- `popularityRankWithinOpening`: rank among sibling lines
- `popularityGames`: raw or approximate game count if available

## Ordering Rule

When reliable popularity is available:

- sort openings by descending `popularityScore`
- sort lines inside an opening by:
  1. `isMainLine` descending
  2. `popularityScore` descending

When popularity is missing:

- keep the line in the dataset
- mark popularity as provisional or null
- avoid presenting the ranking as authoritative

When main-line evidence is missing:

- do not fake a main line
- use pure popularity order inside the opening

## One-Sentence Project Rule

FirstMove should show openings by popularity, but inside each opening it should
show the main line first when one exists, then rank the remaining lines by real
game-frequency data rather than guessed or weak proxy signals.
