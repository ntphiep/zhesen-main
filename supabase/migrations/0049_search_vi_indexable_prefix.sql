-- The prefix tiers 0048 added could not use their own index, and they outranked nothing
-- while burying the answer.
--
-- Two defects, both measured on production after 0048.
--
-- 1. `lex.search_vi` took 10.7 to 15.1 s per call, against the 3 s the anon role allows.
--    Every call from the application would have returned SQLSTATE 57014.
--
--      explain (analyze, buffers) select * from lex.search_vi('con ca', array['en','es','zh'], 8)
--        con ca   13,820.7 ms / 13,766.9 ms / 14,120.2 ms   shared hit=4,078
--        an       10,726.9 ms                               shared hit=4,124
--        cai ban  15,063.0 ms                               shared hit=4,083
--
--    The same body with the query written in as a literal runs in 394.7 ms and its plan
--    reads `Bitmap Index Scan on idx_lex_gloss_terms_term` with
--    `Index Cond: ((term ~>=~ 'con ca') and (term ~<~ 'con cb'))`. That is the whole
--    difference: Postgres turns `col like 'x%'` into those two bounds only when the
--    pattern is a constant at plan time. Inside the function the pattern comes from a
--    CTE, so no bound is derived, the index is never opened, and all 193,731 rows are
--    scanned with lex.tone_key evaluated over them.
--
--    Writing the two bounds directly removes the constant requirement: `~>=~` and `~<~`
--    are the text_pattern_ops strategy operators themselves, and the index answers them
--    whatever the operand is.
--
-- 2. A prefix hit outranked nothing and filled the answer. `con ca` with marks returned
--    24 rows: fish, pez, pescador and fishes at 3.554, then 孩子, 子女, offspring, wife,
--    child, kid, cow, and then cac, cach, cap and every other gloss term starting with
--    "ca". "con cai" is a prefix of "con ca" once the marks are read, and so is "cach".
--
--    A prefix is what a half-typed word needs and never what a finished one wants, and
--    the function cannot tell the two apart. So a prefix-only row is shown only when no
--    row anywhere matched a whole term. `con ca` now returns the four fish rows; `con c`,
--    which matches no term whole, still returns dog, con cho, con cuu, con coc.
--
-- Cost after, production, same three queries:
--   see the measurement block committed with this migration's follow-up QA.
--
-- TO ROLL BACK: replay 0048's `create or replace function lex.search_vi` block, then drop
-- lex.prefix_upper.

-- The smallest string that sorts after every string beginning with `t`, in the byte order
-- the text_pattern_ops index is built in. The last code point moves up by one; the
-- surrogate block is skipped because chr() refuses it, and the top of the plane clamps,
-- which yields an empty range rather than an error.
create or replace function lex.prefix_upper(t text)
returns text
language sql
immutable
parallel safe
set search_path = lex, extensions, public
as $$
  select case when coalesce(t, '') = '' then '' else
    left(t, -1) || chr(
      case
        when ascii(right(t, 1)) + 1 between 55296 and 57343 then 57344
        else least(ascii(right(t, 1)) + 1, 1114111)
      end)
  end
$$;

grant execute on function lex.prefix_upper(text) to anon, authenticated, service_role;

create or replace function lex.search_vi(
  p_q text, p_langs text[] default null, p_limit integer default 20)
returns table (
  id text, lang text, headword text, traditional text, level text,
  frequency_rank integer, attributes jsonb, pos text, gloss_vi text, gloss_en text,
  ipa text, audio_url text, rank real
)
language sql
stable
parallel safe
set search_path = lex, extensions, public
as $$
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
      g.lang,
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
      )::real as rank
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
    select distinct on (entry_id) entry_id, lang, sense_order, rank, whole
    from scored
    order by entry_id, whole desc, rank desc, sense_order asc
  ),
  -- One quota per language, so a strong language cannot take the whole budget. A
  -- prefix-only row survives only where nothing matched a whole term anywhere, which is
  -- what a half-typed word looks like.
  per_lang as (
    select * from (
      select
        b.*,
        row_number() over (partition by b.lang order by b.rank desc) as rn,
        bool_or(b.whole) over () as any_whole
      from best b
      where b.rank >= 2.5
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
    r.rank
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
  order by r.rank desc, e.frequency_rank asc nulls last;
$$;

grant execute on function lex.search_vi(text, text[], integer) to anon, authenticated, service_role;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260921000002', 'search_vi_indexable_prefix')
on conflict (version) do nothing;
