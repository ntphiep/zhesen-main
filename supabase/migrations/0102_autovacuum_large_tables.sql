-- 0102_autovacuum_large_tables.sql
-- The default autovacuum_vacuum_scale_factor of 0.2 lets lex.senses (1.24 M rows) collect
-- about 247,600 dead rows before a vacuum; the last automatic one ran 2026-09-26 while the
-- enrichment jobs updated 272,514 senses, 12,318 of them HOT. 2% keeps the large tables
-- vacuumed and analysed after every batch load.

set lock_timeout = '5s';

alter table lex.senses set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
alter table lex.entries set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
alter table lex.examples set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
alter table lex.lex_relations set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
alter table lex.inflections set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);

insert into supabase_migrations.schema_migrations (version, name)
values ('20261004000102', 'autovacuum_large_tables')
on conflict (version) do nothing;
