-- Carry Spanish grammatical gender through the two lookup helpers.
--
-- `lex.entries.attributes` holds `gender` on 7,079 of the 11,312 Spanish entries
-- and nothing read it. A Spanish noun is unusable without it: the article, the
-- adjective and the pronoun all agree with it, so "perro" on its own is half a
-- word. Every bilingual dictionary marks it, and the panel that says "this word
-- in the other languages" is exactly where a learner meets a Spanish noun for
-- the first time.
--
-- It rides along the same `attributes` read that already produces the pinyin, so
-- this costs nothing extra: both functions were already fetching the column.

-- Both functions gain a column, and Postgres will not let `create or replace`
-- change a function's return type, so each is dropped and recreated.
drop function if exists lex.term_previews(text, text[]);

create function lex.term_previews(p_lang text, p_texts text[])
returns table (
  match_text text, id text, headword text, pos text,
  ipa text, reading text, gender text, gloss_vi text, gloss_en text
)
language sql
stable
as $$
  with want as (
    select distinct t as match_text, lower(extensions.immutable_unaccent(t)) as norm
    from unnest(p_texts) as t
    where coalesce(trim(t), '') <> ''
  ),
  hit as (
    select
      w.match_text, e.id, e.headword,
      e.attributes->>'pinyin' as reading,
      e.attributes->>'gender' as gender,
      row_number() over (
        partition by w.match_text
        order by e.frequency_rank nulls last, length(e.headword), e.id
      ) as rn
    from want w
    join lex.entries e
      on e.lang::text = p_lang and e.headword_normalized = w.norm
  )
  select
    h.match_text, h.id, h.headword,
    (select s.pos from lex.senses s
      where s.entry_id = h.id and s.pos is not null
      order by s.sense_order limit 1) as pos,
    (select p.ipa from lex.pronunciations p
      where p.entry_id = h.id and p.ipa is not null
      order by p.id limit 1) as ipa,
    h.reading, h.gender,
    (select s.gloss_vi from lex.senses s
      where s.entry_id = h.id and s.gloss_vi is not null
      order by s.sense_order limit 1) as gloss_vi,
    (select s.gloss_en from lex.senses s
      where s.entry_id = h.id and s.gloss_en is not null
      order by s.sense_order limit 1) as gloss_en
  from hit h
  where h.rn = 1;
$$;

grant execute on function lex.term_previews(text, text[]) to anon, authenticated, service_role;

drop function if exists lex.match_cross_language(text[], text, text, int);

create function lex.match_cross_language(
  p_terms text[], p_exclude_lang text, p_exclude_id text, p_per_lang int default 3
)
returns table (
  id text, lang text, headword text, reading text, gender text,
  pos text, gloss_vi text, gloss_en text
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
      e.id, e.lang::text as lang, e.headword,
      e.attributes->>'pinyin' as reading,
      e.attributes->>'gender' as gender,
      row_number() over (
        partition by e.lang order by e.frequency_rank nulls last, length(e.headword), e.id
      ) as rn
    from lex.entries e
    join cand on cand.id = e.id
    where e.id <> p_exclude_id and e.lang::text <> p_exclude_lang
  )
  select
    r.id, r.lang, r.headword, r.reading, r.gender,
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

grant execute on function lex.match_cross_language(text[], text, text, int) to anon, authenticated, service_role;
