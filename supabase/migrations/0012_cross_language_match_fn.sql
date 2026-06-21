-- Cross-language sibling matching, pushed into the DB so it is correct regardless
-- of the PostgREST max-rows cap (the old approach fetched all ~6000 zh/es entries
-- into JS and was silently truncated). Pivot terms are computed in the app
-- (lib/dictionary/crosslang.ts entryPivots); this function only does the indexed
-- match and returns at most 12 siblings. The gloss normalization here mirrors
-- cleanGlossTerm: strip a leading to/a/an/the and lowercase, then compare exactly.
create or replace function lex.match_cross_language(
  p_terms text[], p_exclude_lang text, p_exclude_id text
)
returns table(id text, lang text, headword text, gloss_vi text, gloss_en text)
language sql
stable
as $$
  select e.id, e.lang::text, e.headword,
    (select s.gloss_vi from lex.senses s where s.entry_id = e.id order by s.sense_order limit 1) as gloss_vi,
    (select s.gloss_en from lex.senses s where s.entry_id = e.id order by s.sense_order limit 1) as gloss_en
  from lex.entries e
  where e.id <> p_exclude_id
    and e.lang::text <> p_exclude_lang
    and (
      (e.lang::text = 'en' and e.headword_normalized = any(p_terms))
      or (e.lang::text in ('zh','es') and exists (
        select 1 from lex.senses s
        where s.entry_id = e.id
          and lower(regexp_replace(coalesce(s.gloss_en, ''), '^(to|a|an|the)\s+', '')) = any(p_terms)
      ))
    )
  order by e.lang::text, e.frequency_rank nulls last
  limit 12;
$$;

grant execute on function lex.match_cross_language(text[], text, text) to anon, authenticated, service_role;
