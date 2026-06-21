-- Rewrite match_cross_language to gather candidate ids via indexes first (English
-- headword match + zh/es normalized-gloss match using idx_lex_senses_gloss_norm),
-- then join/order/limit only those few rows, instead of scanning the whole entries
-- table in (lang, rank) order applying the filter (~590ms).
-- (Superseded by 0015, which replaces the zh/es lang join with an EXISTS check.)
create or replace function lex.match_cross_language(
  p_terms text[], p_exclude_lang text, p_exclude_id text
)
returns table(id text, lang text, headword text, gloss_vi text, gloss_en text)
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
    join lex.entries e2 on e2.id = s.entry_id and e2.lang::text in ('zh','es')
    where lower(regexp_replace(coalesce(s.gloss_en, ''), '^(to|a|an|the)\s+', '')) = any(p_terms)
  )
  select e.id, e.lang::text, e.headword,
    (select s.gloss_vi from lex.senses s where s.entry_id = e.id order by s.sense_order limit 1) as gloss_vi,
    (select s.gloss_en from lex.senses s where s.entry_id = e.id order by s.sense_order limit 1) as gloss_en
  from lex.entries e
  join cand on cand.id = e.id
  where e.id <> p_exclude_id and e.lang::text <> p_exclude_lang
  order by e.lang::text, e.frequency_rank nulls last
  limit 12;
$$;
