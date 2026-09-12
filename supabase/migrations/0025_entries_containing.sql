-- Words that contain the word being looked at.
--
-- Looking up 学习 gave its meanings, its characters and its examples, but no way
-- to see 学习桌, 认真学习 or 终身学习 -- the compounds that are most of how Chinese
-- vocabulary actually grows, and the first thing a learner reaches for on a
-- Chinese dictionary page. `lex.lex_relations` cannot answer it: about 96% of its
-- rows are the `derived` catch-all and the classification is a guess at the shape
-- of a string (see lib/dictionary/relations.ts).
--
-- The index this needs already exists. `idx_lex_entries_headword_pgroonga` was
-- added in 0016 so that a Chinese query matches a character anywhere in a
-- headword rather than only as a prefix, which is exactly this question asked
-- from the other side.
--
-- The entry itself is excluded, and so is its own inflected form: "learning" is
-- not a word that contains "learn" in the sense meant here, and `lex.inflections`
-- already answers that question. The test is whether a letter follows the word
-- rather than whether the word starts the headword, so "water down" and "learn
-- about" survive while "watered" and "learning" do not. Chinese writes no
-- inflections and no spaces, so the rule applies only to the Latin-script
-- languages -- it would throw away 学习桌 otherwise.

create or replace function lex.entries_containing(
  p_lang text, p_text text, p_limit int default 12
)
returns table (
  id text, lang text, headword text, traditional text, level text, frequency_rank int,
  gloss_vi text, gloss_en text
)
language sql
stable
as $$
  select
    e.id, e.lang::text, e.headword, e.traditional, e.level, e.frequency_rank,
    (select s.gloss_vi from lex.senses s where s.entry_id = e.id order by s.sense_order limit 1) as gloss_vi,
    (select s.gloss_en from lex.senses s where s.entry_id = e.id order by s.sense_order limit 1) as gloss_en
  from lex.entries e
  where e.lang::text = p_lang
    and trim(p_text) <> ''
    and e.headword <> trim(p_text)
    and e.headword &@ trim(p_text)
    and (
      p_lang = 'zh'
      or e.headword_normalized not like lower(trim(p_text)) || '%'
      or substring(e.headword_normalized from length(trim(p_text)) + 1 for 1) !~ '[[:alnum:]]'
    )
  order by e.frequency_rank nulls last, length(e.headword)
  limit p_limit;
$$;

grant execute on function lex.entries_containing(text, text, int) to anon, authenticated, service_role;
