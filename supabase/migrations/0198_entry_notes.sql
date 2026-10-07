-- 0198_entry_notes.sql
-- Learner notes on an English entry, read from the kaikki English extract of Wiktionary by
-- scripts/wiktNotes/build.mjs: where the word comes from (one object per etymology, with the
-- parts of speech it covers, its chain of ancestors, its parts and how it was formed), its
-- written syllables, the common words that sound the same, and the grammar labels of each
-- sense (countable, transitive, used with to). getEntryDetail reads it with the word page.
--
-- A table of its own: lex.entries.attributes travels with every search preview, and an
-- update to lex.senses fires the gloss_terms and form_of statement triggers.
--
-- TO ROLL BACK: drop table lex.entry_notes;

set lock_timeout = '5s';

create table if not exists lex.entry_notes (
  entry_id      text primary key references lex.entries(id) on delete cascade,
  origin        jsonb,
  syllables     text[],
  homophones    text[],
  sense_grammar jsonb,
  source_id     text not null references lex.sources(id)
);

comment on table lex.entry_notes is
  'zhesen: learner notes per entry. origin is [{pos, chain: [{rel, lang, name, word, gloss, tr}], parts: [{word, gloss}], kind, doublets}]; sense_grammar maps a lex.senses id to its labels. Filled by scripts/wiktNotes/build.mjs.';

alter table lex.entry_notes enable row level security;

drop policy if exists entry_notes_select on lex.entry_notes;
create policy entry_notes_select on lex.entry_notes for select to anon, authenticated using (true);

grant select on lex.entry_notes to anon, authenticated;
grant all on lex.entry_notes to service_role;

-- The word page embeds the table, and PostgREST answers an unknown embed with an error.
notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20261008000198', 'entry_notes')
on conflict (version) do nothing;
