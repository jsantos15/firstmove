-- Optimize opening_index for list screens.
-- The previous version computed line summaries through a lateral join per row;
-- pre-aggregating those summaries keeps the view fast as courses are imported.

create index if not exists lop_opening_name_rank_idx
  on public.lichess_opening_popularity (lower(full_name), popularity_games desc nulls last, eco_code)
  where type = 'opening';

create index if not exists lop_variation_family_partial_idx
  on public.lichess_opening_popularity (family_name)
  where type = 'variation';

create index if not exists openings_catalog_lower_name_idx
  on public.openings_catalog (lower(name), popularity_rank, name);

create index if not exists opening_lines_detail_order_idx
  on public.opening_lines (
    opening_slug,
    is_main_line desc,
    popularity_rank asc nulls last,
    sort_order asc,
    name asc
  );

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
    and lop.full_name not in (
      'King''s Pawn Game',
      'King''s Knight Opening',
      'Queen''s Pawn Game',
      'Horwitz Defense',
      'Zukertort Opening',
      'Indian Defense'
    )
),
opening_rows as (
  select *
  from learner_openings
  where name_rank = 1
),
variation_counts as (
  select
    variation.family_name,
    count(*)::integer as count
  from public.lichess_opening_popularity variation
  where variation.type = 'variation'
  group by variation.family_name
),
course_line_summaries as (
  select
    ol.opening_slug,
    count(*)::integer as total_count,
    (count(*) filter (where ol.line_kind <> 'practical_branch'))::integer as reference_count,
    (count(*) filter (where ol.line_kind = 'practical_branch'))::integer as practical_branch_count,
    array_agg(
      ol.slug
      order by ol.is_main_line desc, ol.popularity_rank nulls last, ol.sort_order, ol.name
    ) filter (where ol.line_kind <> 'practical_branch') as reference_slugs,
    array_agg(
      ol.name
      order by ol.is_main_line desc, ol.popularity_rank nulls last, ol.sort_order, ol.name
    ) filter (where ol.line_kind <> 'practical_branch') as reference_names
  from public.opening_lines ol
  group by ol.opening_slug
)
select
  lop.id                                           as popularity_id,
  lop.eco_code                                     as eco_code,
  lop.full_name                                    as name,
  lop.family_name                                  as family_name,
  lop.anchor_sans                                  as anchor_sans,
  lop.anchor_fen                                   as anchor_fen,
  lop.popularity_games                             as popularity_games,
  lop.fetched_at                                   as fetched_at,
  coalesce(var_counts.count, 0)                    as variation_count,

  course.slug                                      as course_slug,
  course.color                                     as course_color,
  course.difficulty                                as course_difficulty,
  course.description                               as course_description,
  course.tags                                      as course_tags,
  course.preview_fen                               as course_preview_fen,
  course.has_main_line                             as course_has_main_line,
  course.is_featured                               as course_is_featured,
  course.display_tier                              as course_display_tier,

  coalesce(course_lines.total_count, 0)            as course_line_count,
  coalesce(course_lines.reference_count, 0)        as reference_line_count,
  coalesce(course_lines.practical_branch_count, 0) as practical_branch_count,
  coalesce(course_lines.reference_slugs, '{}'::text[]) as reference_line_slugs,
  coalesce(course_lines.reference_names, '{}'::text[]) as reference_line_names
from opening_rows lop
left join variation_counts var_counts
  on var_counts.family_name = lop.family_name
left join lateral (
  select oc.*
  from public.openings_catalog oc
  where lower(oc.name) = lower(lop.full_name)
  order by
    oc.popularity_rank nulls last,
    oc.name
  limit 1
) course on true
left join course_line_summaries course_lines
  on course_lines.opening_slug = course.slug;
