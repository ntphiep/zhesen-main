-- `lex.search_vi` becomes plpgsql so that 0050's `plan_cache_mode = force_custom_plan`
-- actually reaches the query inside it.
--
-- 0049 made the range bounds indexable and the results correct, but the function still
-- cost far more than the same body run directly. Measured on production:
--
--                through the function      same body, values written in
--   con cá       1,429 to 1,591 ms         206 ms
--   con c        2,009 to 2,448 ms         111 ms
--   cái bàn        772 to 1,351 ms
--   nước           101 to   107 ms
--
-- The buffer counts say what is happening: 3,699 shared buffers for "con cá", 3,203 for
-- "ăn", 3,421 for "cái bàn". `lex.gloss_terms` is 39 MB, which is close to 3,300 pages of
-- 8 kB, so the function is reading the whole table rather than the sixteen rows the
-- prefix range holds. That is a sequential scan.
--
-- It happens because the body is planned once, with `p_q`, `p_langs` and `p_limit` as
-- parameters, and a range bound against an unknown parameter gets Postgres's default
-- selectivity rather than one read off the statistics for that actual prefix. The default
-- estimates tens of thousands of matching rows, and against that estimate a sequential
-- scan is the cheaper plan. The same query with the values written in estimates sixteen
-- rows and takes the index.
--
-- 0050 set `plan_cache_mode = force_custom_plan` on the function, which is the setting
-- that makes Postgres re-plan with the parameters folded in as constants. It changed
-- nothing, measured three runs per query: con cá stayed at 1,429 to 1,578 ms, con c at
-- 2,009 to 2,301 ms. A `language sql` function's body is not planned through the plan
-- cache that setting governs; a plpgsql statement's body is. So the body moves into
-- plpgsql, unchanged apart from `return query`, and 0050 starts doing what it says.
--
-- The previous definition of this function, before 0048, was plpgsql for its own reasons
-- and ran at 410 ms warm despite scanning 183,526 senses. The language was never the
-- reason it was slow, and it is the reason the rewrite looked slow.
--
-- `#variable_conflict use_column` because the RETURNS TABLE column names (id, lang,
-- headword, pos, gloss_vi, rank) also become plpgsql variables and would otherwise shadow
-- the identically named table columns. Same line, same reason, as the definition 0048
-- replaced.
--
-- 0050's SET clause survives this migration: `create or replace function` drops SET
-- clauses it does not restate, so both are restated here and any later rewrite must do
-- the same.
--
-- TO ROLL BACK: replay 0049's `create or replace function lex.search_vi` block, which
-- restores the `language sql` form, then re-apply 0050.

create or replace function lex.search_vi(
  p_q text, p_langs text[] default null, p_limit integer default 20)
returns table (
  id text, lang text, headword text, traditional text, level text,
  frequency_rank integer, attributes jsonb, pos text, gloss_vi text, gloss_en text,
  ipa text, audio_url text, rank real
)
language plpgsql
stable
parallel safe
set search_path = lex, extensions, public
set plan_cache_mode = 'force_custom_plan'
as $function$
#variable_conflict use_column
begin
  return query
  with k as (
    select
      lower(btrim(coalesce(p_q, '')))                                as raw,
      lower(extensions.immutable_unaccent(btrim(coalesce(p_q, '')))) as una
  ),
  q as (
    select
      raw, una,
      raw <> una              as marked,
      lex.vi_head(raw)        as raw_head,
      lex.vi_head(una)        as una_head,
      lex.tone_key(raw)       as raw_tone,
      lex.prefix_upper(raw)                as raw_hi,
      lex.prefix_upper(lex.vi_head(raw))   as raw_head_hi,
      lex.prefix_upper(una)                as una_hi,
      lex.prefix_upper(lex.vi_head(una))   as una_head_hi
    from k
  ),
  -- Every branch is a range on lex.gloss_terms, so the four combine into one bitmap over
  -- the two text_pattern_ops indexes. `~>=~` and `~<~` rather than `like`, because the
  -- planner derives bounds from `like` only for a constant pattern and this one comes
  -- from a CTE.
  scored as (
    select
      g.entry_id,
      g.lang as hit_lang,
      g.sense_order,
      -- A whole term matched, as opposed to the query being a prefix of one. Carried
      -- rather than inferred from the rank, because the two penalties below can push a
      -- weak whole-term hit under a strong prefix one.
      (g.term = q.raw or g.term = q.raw_head
       or g.term_una = q.una or g.term_una = q.una_head) as whole,
      ((case
          when q.marked then
            case when g.term = q.raw                    then 4.0
                 -- "hoa binh" with the mark on either vowel is one word: Vietnamese puts
                 -- the tone on either half of a diphthong and the data holds both.
                 when lex.tone_key(g.term) = q.raw_tone then 3.9
                 when g.term = q.raw_head               then 3.7
                 when g.term operator(pg_catalog.~>=~) q.raw
                      and g.term operator(pg_catalog.~<~) q.raw_hi then 3.2
                 when g.term operator(pg_catalog.~>=~) q.raw_head
                      and g.term operator(pg_catalog.~<~) q.raw_head_hi then 3.0
                 -- Reached only through term_una, so the marks disagree: a different
                 -- Vietnamese word. Below the floor.
                 else 2.0 end
          else
            -- Nothing in a query typed without marks can tell the words apart, so the
            -- ambiguity is accepted and frequency decides the order.
            case when g.term_una = q.una              then 4.0
                 when g.term_una = q.una_head         then 3.7
                 when g.term_una operator(pg_catalog.~>=~) q.una
                      and g.term_una operator(pg_catalog.~<~) q.una_hi then 3.2
                 else 3.0 end
        end)
        - (case when g.head then 0.15 else 0.0 end)
        -- A gloss deep inside a long entry is a weaker answer than sense 1 of the right
        -- word: "bau troi" is sense 13 of element and sense 28 of blue.
        - 0.5 * (1.0 - 1.0 / sqrt(g.sense_order + 1.0))
      )::real as hit_rank
    from q
    join lex.gloss_terms g
      on (p_langs is null or g.lang = any (p_langs))
     and (   (g.term     operator(pg_catalog.~>=~) q.raw
              and g.term operator(pg_catalog.~<~)  q.raw_hi)
          or (g.term     operator(pg_catalog.~>=~) q.raw_head
              and g.term operator(pg_catalog.~<~)  q.raw_head_hi)
          or (g.term_una operator(pg_catalog.~>=~) q.una
              and g.term_una operator(pg_catalog.~<~) q.una_hi)
          or (g.term_una operator(pg_catalog.~>=~) q.una_head
              and g.term_una operator(pg_catalog.~<~) q.una_head_hi))
    where q.raw <> ''
  ),
  best as (
    select distinct on (entry_id) entry_id, hit_lang, sense_order, hit_rank, whole
    from scored
    order by entry_id, whole desc, hit_rank desc, sense_order asc
  ),
  -- One quota per language, so a strong language cannot take the whole budget. A
  -- prefix-only row survives only where nothing matched a whole term anywhere, which is
  -- what a half-typed word looks like.
  per_lang as (
    select * from (
      select
        b.*,
        row_number() over (partition by b.hit_lang order by b.hit_rank desc) as rn,
        bool_or(b.whole) over () as any_whole
      from best b
      where b.hit_rank >= 2.5
    ) t
    where rn <= p_limit and (whole or not any_whole)
  )
  -- Rank first, enrich second: the subqueries below run only for the surviving rows.
  select
    e.id, e.lang, e.headword, e.traditional, e.level, e.frequency_rank, e.attributes,
    lex.entry_pos(e.id) as pos,
    -- The sense that matched, not sense 1: "lua" matches sense 2 of fire, and sense 1
    -- says nothing about fire.
    coalesce(hs.gloss_vi, ps.gloss_vi) as gloss_vi,
    ps.gloss_en,
    (select p.ipa from lex.pronunciations p
      where p.entry_id = e.id and p.ipa is not null
      order by case when e.lang = 'en' and lower(p.accent) like '%us%' then 0
                    when e.lang = 'en' and lower(p.accent) like '%uk%' then 1
                    else 2 end
      limit 1) as ipa,
    (select p.audio_url from lex.pronunciations p
      where p.entry_id = e.id and p.audio_url is not null limit 1) as audio_url,
    r.hit_rank
  from per_lang r
  join lex.entries e on e.id = r.entry_id
  left join lateral (
    select s.gloss_vi from lex.senses s
    where s.entry_id = e.id and s.sense_order = r.sense_order and s.gloss_vi is not null
    limit 1
  ) hs on true
  left join lateral (
    select s.pos, s.gloss_vi, s.gloss_en from lex.senses s
    where s.entry_id = e.id
    order by s.sense_order asc
    limit 1
  ) ps on true
  order by r.hit_rank desc, e.frequency_rank asc nulls last;
end;
$function$;

grant execute on function lex.search_vi(text, text[], integer) to anon, authenticated, service_role;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260921000004', 'search_vi_plpgsql_custom_plan')
on conflict (version) do nothing;
