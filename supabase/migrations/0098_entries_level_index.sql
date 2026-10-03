-- 0098_entries_level_index.sql
-- lex.count_entries_by_level and the level pages (getEntriesByLevel, count exact) read every
-- page of lex.entries for about 40,700 rows: 30,797 buffers, 337 ms warm and 774 ms cold for
-- one language, the prerender that fails on the anon role's 3 s cap. The index holds only the
-- levelled lemmas, sorted the way the level page reads them.
-- Apply outside a transaction: CONCURRENTLY keeps the batch jobs writing during the build.

create index concurrently if not exists idx_lex_entries_level_lemma
  on lex.entries (lang, level, headword_normalized, id)
  include (level_is_estimated)
  where level is not null and form_of is null;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261004000098', 'entries_level_index')
on conflict (version) do nothing;
