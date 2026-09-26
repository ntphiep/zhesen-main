-- 0071_crosslang_matched_sense_gloss.sql
-- `lex.match_cross_language` shows the meaning that matched, not the entry's first one.
--
-- A Chinese or Spanish candidate is found through one of its senses, but the panel showed
-- sense 1. Measured on production for en:take: 将 matched through sense 4 "to take"
-- ("cầm, lấy") and the panel printed sense 1 "will" ("sẽ"). The two gloss subqueries now
-- put a sense whose cleaned gloss_en is one of the pivots first, then fall back to
-- sense_order. The expression is the one the `cand` CTE already matches on. English
-- candidates are matched by headword, so they keep sense 1.
--
-- Only the two gloss subqueries change; the rest is the live body, restated because
-- `create or replace` takes the whole body.
--
-- TO ROLL BACK: restate the function with both subqueries ordered by s.sense_order alone.

create or replace function lex.match_cross_language(
  p_terms text[], p_exclude_lang text, p_exclude_id text, p_per_lang integer default 3)
returns table (id text, lang text, headword text, reading text, gender text, pos text, gloss_vi text, gloss_en text)
language sql
stable
set search_path to 'lex', 'extensions', 'public'
as $function$
  with cand as (
    select e.id from lex.entries e
    where e.lang::text = 'en' and e.headword_normalized = any(p_terms)
    union
    select s.entry_id from lex.senses s
    where lower(btrim(regexp_replace(regexp_replace(coalesce(s.gloss_en, ''), '[(;,].*$', ''), '^(to|a|an|the)\s+', ''))) = any(p_terms)
      and exists (select 1 from lex.entries e2 where e2.id = s.entry_id and e2.lang::text in ('zh','es'))
  ),
  ranked as (
    select
      e.id, e.lang::text as lang, e.headword,
      e.attributes->>'pinyin' as reading,
      e.attributes->>'gender' as gender,
      row_number() over (partition by e.lang order by e.frequency_rank nulls last, length(e.headword), e.id) as rn
    from lex.entries e
    join cand on cand.id = e.id
    where e.id <> p_exclude_id and e.lang::text <> p_exclude_lang
  )
  select
    r.id, r.lang, r.headword, r.reading, r.gender,
    lex.entry_pos(r.id) as pos,
    (select s.gloss_vi from lex.senses s where s.entry_id = r.id and s.gloss_vi is not null
      order by (lower(btrim(regexp_replace(regexp_replace(coalesce(s.gloss_en, ''), '[(;,].*$', ''), '^(to|a|an|the)\s+', ''))) = any(p_terms)) desc,
               s.sense_order
      limit 1) as gloss_vi,
    (select s.gloss_en from lex.senses s where s.entry_id = r.id and s.gloss_en is not null
      order by (lower(btrim(regexp_replace(regexp_replace(coalesce(s.gloss_en, ''), '[(;,].*$', ''), '^(to|a|an|the)\s+', ''))) = any(p_terms)) desc,
               s.sense_order
      limit 1) as gloss_en
  from ranked r
  where r.rn <= p_per_lang
  order by r.lang, r.rn;
$function$;

grant execute on function lex.match_cross_language(text[], text, text, integer) to anon, authenticated, service_role;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260926000006', 'crosslang_matched_sense_gloss')
on conflict (version) do nothing;
