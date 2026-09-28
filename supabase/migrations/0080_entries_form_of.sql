-- 0080_entries_form_of.sql
-- `lex.entries.form_of` names the word an inflected entry is a form of, so the level lists
-- show each word once.
--
-- Wiktionary files every inflected form as its own entry, and the level data levels them:
-- villages sits beside village at A1 and acciones beside acción. Measured before this
-- migration: 3,728 English and 900 Spanish levelled entries whose every sense is a pointer
-- such as "plural of village". The word page keeps showing their level; the level list,
-- its counts and the levelled common-words strip leave them out.
--
-- `lex.pointer_lemma` is `lemmaFromSenses` (lib/dictionary/lemma.ts) in SQL, over the same
-- word list, and the two must change together: a pointer is made only of grammar words up
-- to "of", counts from sense 2 on only when it names an inflection, and is read no further
-- than sense 15.
--
-- TO ROLL BACK: drop the three triggers, lex.form_of_sync, lex.form_of_reload and
-- lex.pointer_lemma, replay 0021's lex.count_entries_by_level, and drop the column.

alter table lex.entries add column if not exists form_of text;

comment on column lex.entries.form_of is
  'The headword this entry is an inflected or alternative form of, derived from its senses by lex.pointer_lemma; null for a word in its own right.';

create or replace function lex.pointer_lemma(p_entry_id text)
returns text
language sql
stable
set search_path = lex, extensions, public
as $$
  with s as (
    select s.gloss_en, row_number() over (order by s.sense_order, s.id) as n
    from lex.senses s
    where s.entry_id = p_entry_id
    order by s.sense_order, s.id
    limit 15
  ), m as (
    select s.n, regexp_match(s.gloss_en,
      '^((?:(?:simple|past|present|future|participle|gerund|comparative|superlative|degree'
      '|first-person|second-person|third-person|singular|plural|indicative|subjunctive|imperative'
      '|preterite|imperfect|conditional|affirmative|negative|formal|informal|feminine|masculine'
      '|neuter|remote|inflection|and|or|form|alternative|spelling|misspelling|obsolete|archaic'
      '|dated|nonstandard|rare|standard|british|uk|us|letter-case|pronunciation|\([^)]*\))\s+)+)'
      'of\s+([[:alpha:]][[:alpha:]''’-]*)', 'i') as g
    from s
  )
  select btrim(m.g[2])
  from m
  where m.g is not null
    and (m.n = 1 or m.g[1] ~* '\m(plural|singular|past|present|future|participle|gerund|comparative|superlative|person|indicative|subjunctive|imperative|preterite|imperfect|conditional|inflection)\M')
    and lower(btrim(m.g[2])) <> (select lower(e.headword) from lex.entries e where e.id = p_entry_id)
  order by m.n
  limit 1;
$$;

create or replace function lex.form_of_reload(p_entries text[] default null)
returns void
language sql
set search_path = lex, extensions, public
as $$
  update lex.entries e
  set form_of = p.lemma
  from (
    select x.id, lex.pointer_lemma(x.id) as lemma
    from lex.entries x
    where p_entries is null or x.id = any (p_entries)
  ) p
  where e.id = p.id and e.form_of is distinct from p.lemma;
$$;

-- Statement level with transition tables, as lex.gloss_terms_sync: a data load writes tens
-- of thousands of senses in one statement.
create or replace function lex.form_of_sync()
returns trigger
language plpgsql
set search_path = lex, extensions, public
as $$
begin
  if tg_op = 'INSERT' then
    perform lex.form_of_reload(array(select distinct entry_id from new_rows));
  elsif tg_op = 'DELETE' then
    perform lex.form_of_reload(array(select distinct entry_id from old_rows));
  else
    perform lex.form_of_reload(array(
      select entry_id from new_rows
      union
      select entry_id from old_rows));
  end if;
  return null;
end
$$;

drop trigger if exists trg_lex_form_of_ins on lex.senses;
drop trigger if exists trg_lex_form_of_upd on lex.senses;
drop trigger if exists trg_lex_form_of_del on lex.senses;

create trigger trg_lex_form_of_ins after insert on lex.senses
  referencing new table as new_rows
  for each statement execute function lex.form_of_sync();
create trigger trg_lex_form_of_upd after update on lex.senses
  referencing old table as old_rows new table as new_rows
  for each statement execute function lex.form_of_sync();
create trigger trg_lex_form_of_del after delete on lex.senses
  referencing old table as old_rows
  for each statement execute function lex.form_of_sync();

create or replace function lex.count_entries_by_level(p_lang text)
returns table (level text, level_is_estimated boolean, cnt bigint)
language sql
stable
set search_path = lex, extensions, public
as $$
  select e.level, bool_and(e.level_is_estimated), count(*)
  from lex.entries e
  where e.lang::text = p_lang and e.level is not null and e.form_of is null
  group by e.level
  order by e.level;
$$;

grant execute on function lex.count_entries_by_level(text) to anon, authenticated, service_role;
grant execute on function lex.pointer_lemma(text) to anon, authenticated, service_role;

set local statement_timeout = '900s';

select lex.form_of_reload();

-- The level list filters on the new column through PostgREST, which must see it first.
notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20260929000080', 'entries_form_of')
on conflict (version) do nothing;
