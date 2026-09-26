-- 0065_english_full_import.sql
-- What the full English import from the Wiktionary dump needs that the schema lacked.
--
-- `name` joins entry_type: proper nouns are entries of their own, so `May` is no longer
-- folded into `may`. `source_ref` on examples and pronunciations holds the record in the
-- source (a Tatoeba sentence id, a Commons file name), which CC BY attribution needs and
-- which lets a re-import update a row instead of duplicating it.
--
-- TO ROLL BACK: drop the two columns and restore the four-value check; delete the
-- `oewn` source row once no row references it.

alter table lex.entries drop constraint if exists entries_entry_type_check;
alter table lex.entries add constraint entries_entry_type_check
  check (entry_type in ('word', 'phrase', 'idiom', 'collocation', 'name'));

alter table lex.examples add column if not exists source_ref text;
alter table lex.pronunciations add column if not exists source_ref text;

insert into lex.sources (id, name, url, license, tier, notes) values
  ('oewn', 'Open English WordNet 2025 Plus', 'https://en-word.net', 'CC BY 4.0', 'open',
   'Synset relations and examples, linked to entries by lemma and part of speech')
on conflict (id) do nothing;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260925000005', 'english_full_import')
on conflict (version) do nothing;
