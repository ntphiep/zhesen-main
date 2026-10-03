-- 0100_fk_set_null_indexes.sql
-- Each of these foreign keys sets the child column to null when its parent row goes, and no
-- index leads with the column, so every deleted parent scans the child table.
-- lex.sense_labels recorded 20,319 seq scans and 90.4 M rows read from 2026-09-22 to
-- 2026-10-03, lex.learner_examples 4,958. public.user_words is indexed on (user_id, entry_id),
-- which does not serve a lookup by entry_id. Partial, because the check looks up a non-null
-- value.
-- Apply outside a transaction: CONCURRENTLY.

create index concurrently if not exists sense_labels_lemma_entry_idx
  on lex.sense_labels (lemma_entry_id) where lemma_entry_id is not null;

create index concurrently if not exists learner_examples_source_example_idx
  on lex.learner_examples (source_example_id) where source_example_id is not null;

create index concurrently if not exists user_words_entry_idx
  on public.user_words (entry_id) where entry_id is not null;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261004000100', 'fk_set_null_indexes')
on conflict (version) do nothing;
