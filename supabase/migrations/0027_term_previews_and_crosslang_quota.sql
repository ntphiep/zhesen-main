-- Two things the lookup page needs to stop showing bare words.
--
-- 1. `lex.term_previews` resolves a list of surface forms to whatever the
--    dictionary knows about them. Synonyms, derived terms and inflected forms are
--    all stored as plain text (`lex.lex_relations.related_text`,
--    `lex.inflections.form_text`), so the page could only ever render a chip with
--    the word on it. A learner reading "even, fluid, slick, downy, flat,
--    frictionless, lanate, level, silken..." under "synonyms" cannot tell which of
--    those they could actually use, because a synonym of one sense is not a
--    synonym of another. Given the part of speech and the first meaning, the list
--    becomes readable. One call resolves every form on the page.
--
--    `lex_entries_lang_headword_idx` (lang, headword_normalized) answers it, so
--    this adds no index. Forms with no entry of their own simply do not come back
--    and the caller keeps showing them as plain text.
--
-- 2. `lex.match_cross_language` gains a per-language quota. It took the twelve
--    best matches ordered by language, so an English word with a dozen Spanish
--    equivalents never showed a Chinese one -- the panel is meant to answer "what
--    is this word in the other languages", and it was answering "in one of them".
--    It now returns up to `p_per_lang` per language, and carries the pinyin and
--    the part of speech so a Chinese equivalent is readable to someone who cannot
--    yet read the characters.
--
--    Matching still requires the target's English gloss to equal the pivot term
--    exactly. Splitting a gloss like "smooth; sleek" on the semicolon was measured
--    at 2.4 s (seq scan over all 183k senses, no index can serve it), so it is
--    deliberately not done.

create or replace function lex.term_previews(p_lang text, p_texts text[])
returns table (
  match_text text, id text, headword text, pos text,
  ipa text, reading text, gloss_vi text, gloss_en text
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
      w.match_text, e.id, e.headword, e.attributes->>'pinyin' as reading,
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
    h.reading,
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

-- The old three-argument version has to go: the return type gains `reading` and
-- `pos`, and leaving it in place would make a three-argument call ambiguous.
drop function if exists lex.match_cross_language(text[], text, text);

create function lex.match_cross_language(
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
    where lower(regexp_replace(coalesce(s.gloss_en, ''), '^(to|a|an|the)\s+', '')) = any(p_terms)
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

grant execute on function lex.match_cross_language(text[], text, text, int) to anon, authenticated, service_role;
