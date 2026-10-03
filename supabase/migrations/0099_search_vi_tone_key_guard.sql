-- 0099_search_vi_tone_key_guard.sql
-- lex.tone_key costs about 32 us a call, and lex.search_vi evaluated it for every candidate
-- term of a query with tone marks: 3,890 calls and 121 ms of the 145 ms "nhà" took. Equal
-- tone keys mean equal letters, so equal unaccented forms; testing term_una first leaves
-- tone_key to the few whole-word rows. Measured on production on 2026-10-03: "nhà" 145 to
-- 32 ms, "người" 349 to 88 ms, and 25 of 25 sample queries returned byte-identical rows.
-- The body is the live definition with that one condition added; both SET clauses are
-- restated, as create or replace drops the ones it omits.

set lock_timeout = '5s';

CREATE OR REPLACE FUNCTION lex.search_vi(p_q text, p_langs text[] DEFAULT NULL::text[], p_limit integer DEFAULT 20)
 RETURNS TABLE(id text, lang text, headword text, traditional text, level text, frequency_rank integer, attributes jsonb, pos text, gloss_vi text, gloss_en text, ipa text, audio_url text, rank real)
 LANGUAGE plpgsql
 STABLE PARALLEL SAFE
 SET search_path TO 'lex', 'extensions', 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
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
                 -- tone_key costs ~32 us per call; equal tone keys imply equal unaccented forms,
                 -- so the term_una test skips it for every prefix-only row.
                 when g.term_una = q.una and lex.tone_key(g.term) = q.raw_tone then 3.9
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
        row_number() over (partition by b.hit_lang
                           order by b.hit_rank desc, fe.frequency_rank asc nulls last, b.entry_id)
          as rn,
        bool_or(b.whole) over () as any_whole
      from best b
      join lex.entries fe on fe.id = b.entry_id
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

insert into supabase_migrations.schema_migrations (version, name)
values ('20261004000099', 'search_vi_tone_key_guard')
on conflict (version) do nothing;
