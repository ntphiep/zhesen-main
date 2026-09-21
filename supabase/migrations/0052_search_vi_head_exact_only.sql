-- The classifier-stripped form of a query is matched whole, not as a prefix. That one
-- change takes `lex.search_vi` from hundreds of milliseconds to tens.
--
-- 0049 gave the function four index branches: the query as a prefix, the query with its
-- classifier removed as a prefix, and the same two over the unaccented column. The second
-- and fourth are what cost the time. `lex.vi_head('con cá')` is 'cá', so the function was
-- asking for every gloss term beginning with "cá" and every one beginning with "ca": cách,
-- cáp, cà phê, ca sĩ, cải, cảnh and so on. Measured on production, `explain (analyze,
-- buffers)` on the join alone:
--
--   with the two head-prefix branches      5,921 candidate rows, 1,771 heap blocks, 12.3 ms
--   without them                              24 candidate rows,    24 heap blocks,  0.6 ms
--
-- Every one of those 5,921 rows then had `lex.tone_key` evaluated on it and was sorted,
-- and all of them were thrown away by the 2.5 floor and the whole-term gate. The whole
-- function cost 922 ms for "con cá" and 2,045 ms for "con c", against a 3 s statement
-- timeout on the anon role.
--
-- A stripped query is a complete word by construction: "con cá" only becomes "cá" because
-- "con" was recognised as a classifier. Prefix-matching it buys one case, a half-typed
-- classifier phrase against a gloss stored without the classifier ("con c" reaching a
-- gloss of "cá"), and that case is already covered once the word itself is typed. The
-- 3.0 tier it fed is removed with it.
--
-- What still works, because `lex.gloss_terms` stores both the raw term and its stripped
-- form as separate rows: typing "con cá" in full finds a gloss of "cá" through the exact
-- head match, and typing "con c" still finds "con chó", "con cừu" and "con cóc" through
-- the raw prefix.
--
-- Both SET clauses are restated: `create or replace function` drops the ones it omits, and
-- 0050's `plan_cache_mode` is still what lets a plpgsql body plan per call.
--
-- TO ROLL BACK: replay 0051's `create or replace function lex.search_vi` block.

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
      lex.prefix_upper(raw)   as raw_hi,
      lex.prefix_upper(una)   as una_hi
    from k
  ),
  -- Two prefix ranges and two equalities, all four on lex.gloss_terms, so they combine
  -- into one bitmap over the two text_pattern_ops indexes. `~>=~` and `~<~` rather than
  -- `like`, because the planner derives bounds from `like` only for a constant pattern and
  -- this one comes from a CTE.
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
                 -- Reached only through term_una, so the marks disagree: a different
                 -- Vietnamese word. Below the floor.
                 else 2.0 end
          else
            -- Nothing in a query typed without marks can tell the words apart, so the
            -- ambiguity is accepted and frequency decides the order.
            case when g.term_una = q.una              then 4.0
                 when g.term_una = q.una_head         then 3.7
                 else 3.2 end
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
          or  g.term     = q.raw_head
          or (g.term_una operator(pg_catalog.~>=~) q.una
              and g.term_una operator(pg_catalog.~<~) q.una_hi)
          or  g.term_una = q.una_head)
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
values ('20260921000005', 'search_vi_head_exact_only')
on conflict (version) do nothing;
