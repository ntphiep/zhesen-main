-- Match cross-language equivalents on the head of an English gloss.
--
-- `lex.entries` holds `es:perro`, and its first sense glosses to
--   "dog (the species Canis familiaris (sometimes designated Canis lupus
--    familiaris), domesticated for thousands of years and ...)"
-- The match required the gloss to equal the pivot term exactly, so looking up
-- "dog" found the Chinese 狗 and no Spanish word at all. Most Spanish and Chinese
-- senses are written this way: the equivalent, then a parenthesis or a comma and
-- a definition. "cat (unspecified gender)", "pop, soda (soft drink)".
--
-- So both sides now normalise to the head of the gloss: everything before the
-- first "(", ";" or ",", with a leading article or "to" removed. The later parts
-- of a list gloss stay unreachable ("clothes peg, clothespin" is findable as
-- "clothes peg" only), which is the cheap half of the problem; the first term is
-- the one a dictionary leads with.
--
-- This replaces `idx_lex_senses_gloss_norm` rather than adding to it -- same one
-- index, wider reach. Splitting on the separator inside the query instead was
-- measured at 2.4 s: no index can serve it, and it reads all 183k senses.

create index if not exists idx_lex_senses_gloss_head on lex.senses (
  lower(btrim(regexp_replace(regexp_replace(coalesce(gloss_en, ''), '[(;,].*$', ''), '^(to|a|an|the)\s+', '')))
);

create or replace function lex.match_cross_language(
  p_terms text[], p_exclude_lang text, p_exclude_id text, p_per_lang int default 3
)
returns table (
  id text, lang text, headword text, reading text, pos text, gloss_vi text, gloss_en text
)
language sql
stable
as $$
  with cand as (
    select e.id
    from lex.entries e
    where e.lang::text = 'en' and e.headword_normalized = any(p_terms)
    union
    select s.entry_id
    from lex.senses s
    where lower(btrim(regexp_replace(regexp_replace(coalesce(s.gloss_en, ''), '[(;,].*$', ''), '^(to|a|an|the)\s+', ''))) = any(p_terms)
      and exists (select 1 from lex.entries e2 where e2.id = s.entry_id and e2.lang::text in ('zh','es'))
  ),
  ranked as (
    select
      e.id, e.lang::text as lang, e.headword, e.attributes->>'pinyin' as reading,
      row_number() over (
        partition by e.lang order by e.frequency_rank nulls last, length(e.headword), e.id
      ) as rn
    from lex.entries e
    join cand on cand.id = e.id
    where e.id <> p_exclude_id and e.lang::text <> p_exclude_lang
  )
  select
    r.id, r.lang, r.headword, r.reading,
    (select s.pos from lex.senses s
      where s.entry_id = r.id and s.pos is not null
      order by s.sense_order limit 1) as pos,
    (select s.gloss_vi from lex.senses s
      where s.entry_id = r.id and s.gloss_vi is not null
      order by s.sense_order limit 1) as gloss_vi,
    (select s.gloss_en from lex.senses s
      where s.entry_id = r.id and s.gloss_en is not null
      order by s.sense_order limit 1) as gloss_en
  from ranked r
  where r.rn <= p_per_lang
  order by r.lang, r.rn;
$$;

-- Without this the planner has no statistics for the new expression: it
-- estimated 1835 matching senses instead of 5, chose to hash all 15,357 Spanish
-- and Chinese entries, and the function took 378 ms. With it, 5.8 ms.
analyze lex.senses;

drop index if exists lex.idx_lex_senses_gloss_norm;
