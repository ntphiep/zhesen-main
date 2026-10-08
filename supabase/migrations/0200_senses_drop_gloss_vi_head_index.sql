-- 0200_senses_drop_gloss_vi_head_index.sql
-- Drops idx_lex_senses_gloss_vi_head, the expression index 0047 built for search_vi's exact
-- gloss match. 0048 moved search_vi onto lex.gloss_terms, and no function body in the live
-- database names the indexed expression (pg_proc.prosrc), nor does any file under app/,
-- components/, lib/ or supabase/scripts/. pg_stat_user_indexes showed 0 scans at 134 MB, and
-- every write to lex.senses maintained it. idx_lex_senses_gloss_vi_trgm stays: lex.suggest uses it.
-- To restore, run the create index statement of 0047_search_vi_per_language_and_containment.sql.
-- Apply outside a transaction: CONCURRENTLY keeps the batch jobs writing during the drop.

drop index concurrently if exists lex.idx_lex_senses_gloss_vi_head;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261008000200', 'senses_drop_gloss_vi_head_index')
on conflict (version) do nothing;
