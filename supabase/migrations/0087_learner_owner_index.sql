-- lex.learner_collocations finds a layer's own entries by provenance.learner_owner, which
-- scanned every row of lex.entries three times per load: 953 ms of the 1,033 ms es:de took.
create index if not exists idx_lex_entries_learner_owner on lex.entries ((provenance->>'learner_owner'));

insert into supabase_migrations.schema_migrations (version, name)
values ('20260929000087', 'learner_owner_index')
on conflict (version) do nothing;
