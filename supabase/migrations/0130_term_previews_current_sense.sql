-- 0130_term_previews_current_sense.sql
-- The preview gloss on family, phrase and lemma chips leads with a current sense. 0027 took the
-- first gloss by `sense_order`, so going previewed as "đến thường xuyên". A published learner
-- layer now gives the preview its first sense, as on the word page; otherwise the order matches
-- `rankSenses` (lib/dictionary/textQuality.ts): old register last, then `sense_frequency`, then
-- `sense_order`. Ranked by frequency alone, take would preview as "chiếm đoạt, lấy" (frequency 1)
-- where its layer says "cầm, lấy, mang, di chuyển". Run read-only on production on 2026-10-04,
-- this changes 7,467 of 869,401 previews, 4,722 of them in the top 20k and 4,040 through a layer.
--
-- `create or replace` keeps the owner and grants but resets every attribute the text omits. On
-- 2026-10-04 production held: security invoker, stable, parallel unsafe, cost 100, rows 1000,
-- proconfig {search_path=lex, extensions, public}. All are restated below. `sense_frequency` is
-- text holding "1" to "5" (16,686 rows); only those cast, as `parseSenseFrequency` reads them, so
-- no other value can fail the cast. Bump the `dict-term-previews` cache key once applied.

set lock_timeout = '5s';

create or replace function lex.term_previews(p_lang text, p_texts text[])
returns table(match_text text, id text, headword text, pos text, ipa text, reading text,
              gender text, gloss_vi text, gloss_en text)
language sql
stable
security invoker
parallel unsafe
cost 100
rows 1000
set search_path = lex, extensions, public
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
      row_number() over (partition by w.match_text order by e.frequency_rank nulls last, length(e.headword), e.id) as rn
    from want w
    join lex.entries e on e.lang::text = p_lang and e.headword_normalized = w.norm
  ),
  ranked as (
    select s.entry_id, s.gloss_vi, s.gloss_en,
           row_number() over (
             partition by s.entry_id
             order by coalesce(s.register, '') ~ '\m(obsolete|archaic|dated|rare|vulgar|offensive)\M',
                      case when s.sense_frequency ~ '^[1-5]$' then s.sense_frequency::int end nulls last,
                      s.sense_order) as k
    from lex.senses s
    where s.entry_id in (select h.id from hit h where h.rn = 1)
  )
  select
    h.match_text, h.id, h.headword,
    lex.entry_pos(h.id) as pos,
    (select p.ipa from lex.pronunciations p where p.entry_id = h.id and p.ipa is not null order by p.id limit 1) as ipa,
    h.reading, h.gender,
    coalesce(
      (select array_to_string(ls.vi_terms, ', ')
       from lex.learner_entries le
       join lex.learner_senses ls on ls.entry_id = le.entry_id
       where le.entry_id = h.id and le.status = 'published' and cardinality(ls.vi_terms) > 0
       order by ls.sense_order limit 1),
      (select r.gloss_vi from ranked r where r.entry_id = h.id and r.gloss_vi is not null order by r.k limit 1)) as gloss_vi,
    (select r.gloss_en from ranked r where r.entry_id = h.id and r.gloss_en is not null order by r.k limit 1) as gloss_en
  from hit h
  where h.rn = 1;
$$;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20261004000130', 'term_previews_current_sense')
on conflict (version) do nothing;
