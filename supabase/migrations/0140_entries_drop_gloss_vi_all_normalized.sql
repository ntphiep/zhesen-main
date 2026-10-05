-- 0140_entries_drop_gloss_vi_all_normalized.sql
-- Drops the generated column lex.entries.gloss_vi_all_normalized and its trigram index, which
-- nothing reads (issue #102). No function body or view in the live database names the column
-- (pg_proc.prosrc, pg_views, pg_matviews), and no file under app/, components/ or lib/ does.
-- The index had 0 scans in 13 days at 23,642,112 bytes, and every write to lex.entries
-- maintained it. attributes.gloss_vi_all stays.
--
-- Backup: s3://zhesen-db-backups-014498663963/migrations/gloss-vi-all-normalized-20261005.csv
-- (id, gloss_vi_all_normalized). The column is generated, so restoring it means re-running the
-- two statements of 0018_reverse_lookup.sql that created it.
-- Apply outside a transaction: CONCURRENTLY keeps the batch jobs writing during the drop.
-- reviewed-destructive: owner approved #102 on 2026-10-05; generated column with no reader, backed up to S3

drop index concurrently if exists lex.idx_lex_entries_gloss_vi_all_trgm;

set lock_timeout = '5s';
alter table lex.entries drop column if exists gloss_vi_all_normalized;
reset lock_timeout;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261005000140', 'entries_drop_gloss_vi_all_normalized')
on conflict (version) do nothing;
