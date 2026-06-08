-- Migration 011: Opening Index View
-- Lightweight opening-list source for web and mobile. One row per Lichess
-- opening anchor, sorted by real game popularity, with generated-course metadata
-- attached when a matching FirstMove course exists.

create or replace view public.opening_index as
with learner_openings as (
  select
    lop.*,
    row_number() over (
      partition by lower(lop.full_name)
      order by lop.popularity_games desc nulls last, lop.eco_code
    ) as name_rank
  from public.lichess_opening_popularity lop
  where lop.type = 'opening'
    -- Exclude broad ECO/naming buckets that are too generic for learner-facing
    -- opening courses. Keep legitimate one-move openings such as English Opening,
    -- Bird Opening, Nimzo-Larsen Attack, etc.
    and lop.full_name not in (
      'King''s Pawn Game',
      'Queen''s Pawn Game',
      'Zukertort Opening',
      'Indian Defense'
    )
)
select
  lop.id                         as popularity_id,
  lop.eco_code                   as eco_code,
  lop.full_name                  as name,
  lop.family_name                as family_name,
  lop.anchor_sans                as anchor_sans,
  lop.anchor_fen                 as anchor_fen,
  lop.popularity_games           as popularity_games,
  lop.fetched_at                 as fetched_at,
  coalesce(var_counts.count, 0)  as variation_count,

  course.slug                    as course_slug,
  course.color                   as course_color,
  course.difficulty              as course_difficulty,
  course.description             as course_description,
  course.tags                    as course_tags,
  course.preview_fen             as course_preview_fen,
  course.has_main_line           as course_has_main_line,
  course.is_featured             as course_is_featured,
  course.display_tier            as course_display_tier
from learner_openings lop
left join lateral (
  select count(*)::integer as count
  from public.lichess_opening_popularity variation
  where variation.type = 'variation'
    and variation.family_name = lop.family_name
) var_counts on true
left join lateral (
  select oc.*
  from public.openings_catalog oc
  where lower(oc.name) = lower(lop.full_name)
    or oc.eco_code = lop.eco_code
  order by
    case when lower(oc.name) = lower(lop.full_name) then 0 else 1 end,
    oc.popularity_rank nulls last,
    oc.name
  limit 1
) course on true
where lop.name_rank = 1;
