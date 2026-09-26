-- 0073_entries_containing_learner_order.sql
-- `lex.entries_containing` leaves out the word's other spellings and puts the phrases a
-- learner meets first; `lex.examples` gets the `entry_id` index every entry page needs.
--
-- After the full English import (0065) the list ordered by `frequency_rank`, which is null
-- for every multiword entry, so it fell back to length. Measured on production: en:cat
-- listed CAT, Cat, J-cat, Cat 5 and he-cat; en:give listed 4give, give-up, give me and
-- give by before give up. Measured on staging with this order: let the cat out of the
-- bag, domestic cat, bell the cat; give up, give in, give back, give away. The zh and es
-- lists of 人, 学, 水, agua, casa and dar are unchanged.
--
-- The order is: has a Vietnamese meaning, then frequency band, then rank, then Tatoeba
-- sentences (real usage, and the only signal a multiword entry has), then length. The
-- Tatoeba count reads `lex.examples` by `entry_id`, which had no index: the entry page's
-- own example embed was a 131 ms sequential scan of 818k rows on production.
--
-- TO ROLL BACK: replay 0025's function with `set search_path = lex, extensions, public`;
-- the index can stay.

create index if not exists idx_lex_examples_entry on lex.examples (entry_id);

create or replace function lex.entries_containing(
  p_lang text, p_text text, p_limit int default 12
)
returns table (
  id text, lang text, headword text, traditional text, level text, frequency_rank int,
  gloss_vi text, gloss_en text
)
language sql
stable
set search_path = lex, extensions, public
as $$
  select
    e.id, e.lang::text, e.headword, e.traditional, e.level, e.frequency_rank,
    (select s.gloss_vi from lex.senses s where s.entry_id = e.id order by s.sense_order limit 1) as gloss_vi,
    (select s.gloss_en from lex.senses s where s.entry_id = e.id order by s.sense_order limit 1) as gloss_en
  from lex.entries e
  where e.lang::text = p_lang
    and trim(p_text) <> ''
    and lower(e.headword) <> lower(trim(p_text))
    and e.headword &@ trim(p_text)
    and (
      p_lang = 'zh'
      or e.headword_normalized not like lower(trim(p_text)) || '%'
      or substring(e.headword_normalized from length(trim(p_text)) + 1 for 1) !~ '[[:alnum:]]'
    )
  order by
    not exists (select 1 from lex.senses s where s.entry_id = e.id and s.gloss_vi is not null),
    case e.frequency_band when 'very_common' then 0 when 'common' then 1 when 'uncommon' then 2 else 3 end,
    e.frequency_rank nulls last,
    (select count(*) from lex.examples x where x.entry_id = e.id and x.source_id = 'tatoeba') desc,
    length(e.headword)
  limit p_limit;
$$;

grant execute on function lex.entries_containing(text, text, int) to anon, authenticated, service_role;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260926000008', 'entries_containing_learner_order')
on conflict (version) do nothing;
