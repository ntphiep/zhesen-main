-- The zh/es lang check on gloss matches was hashing all ~11k zh/es entries.
-- Use EXISTS against the PK instead so it nested-loops over only the few matched
-- senses (the gloss index already narrows to ~9 rows). Brings the function from
-- ~2.2s (pre-index) to ~25ms.
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
    where lower(regexp_replace(coalesce(s.gloss_en, ''), '^(to|a|an|the)\s+', '')) = any(p_terms)
      and exists (select 1 from lex.entries e2 where e2.id = s.entry_id and e2.lang::text in ('zh','es'))
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
