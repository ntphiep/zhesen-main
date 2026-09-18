-- Inventory of database size and reclaimable space for zhesen.
-- Run in the Supabase SQL Editor. Read-only, changes nothing.
-- Read .claude/rules/database.md before acting on the results.

-- 1. Total size against the Free plan's 500 MB cap.
select pg_size_pretty(pg_database_size(current_database())) as db_size,
       round(pg_database_size(current_database()) / 1048576.0, 1) as db_mb,
       round(100 * pg_database_size(current_database()) / (500 * 1048576.0), 1) as pct_of_500mb_cap;

-- 2. Size per table, and the gap that belongs to PGroonga.
--    PGroonga keeps index data in files pg_relation_size cannot see, so the
--    sum of the tables below will be SMALLER than pg_database_size above.
select n.nspname as schema, c.relname as table_name,
       pg_size_pretty(pg_total_relation_size(c.oid)) as total,
       pg_size_pretty(pg_relation_size(c.oid)) as table_only,
       pg_size_pretty(pg_indexes_size(c.oid)) as index,
       c.reltuples::bigint as estimated_rows
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and n.nspname in ('public', 'lex', 'auth', 'storage')
order by pg_total_relation_size(c.oid) desc;

-- 3. Every schema and its table count, to spot orphaned schemas.
select n.nspname as schema, count(c.oid) as table_count,
       pg_size_pretty(coalesce(sum(pg_total_relation_size(c.oid)), 0)) as total
from pg_namespace n
left join pg_class c on c.relnamespace = n.oid and c.relkind = 'r'
where n.nspname not like 'pg_%' and n.nspname <> 'information_schema'
group by n.nspname order by 3 desc;

-- 4. Indexes never used: candidates to drop to reclaim space.
--    idx_scan = 0 means Postgres has not picked this index once since the
--    last stats reset.
select s.schemaname, s.relname as table_name, s.indexrelname as index, s.idx_scan,
       pg_size_pretty(pg_relation_size(s.indexrelid)) as size
from pg_stat_user_indexes s
join pg_index i on i.indexrelid = s.indexrelid
where not i.indisunique and s.schemaname in ('public', 'lex')
order by s.idx_scan, pg_relation_size(s.indexrelid) desc;

-- 5. Dead space in tables: a high dead-tuple count signals a plain `vacuum` is due.
--    Do NOT run `vacuum full` on lex.entries; see .claude/rules/database.md.
select schemaname, relname, n_live_tup, n_dead_tup,
       round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 1) as pct_dead,
       last_vacuum, last_autovacuum
from pg_stat_user_tables
where schemaname in ('public', 'lex') and n_dead_tup > 0
order by n_dead_tup desc;

-- 6. Surplus PGroonga objects: each Sources<n> key must match the relfilenode
--    of a live PGroonga index. An unmatched key is leftover from an old VACUUM FULL.
select c.relname, c.relfilenode
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relam = (select oid from pg_am where amname = 'pgroonga');

-- 7. Orphaned rows: pointers to entries that no longer exist.
select 'senses' as table_name, count(*) from lex.senses s left join lex.entries e on e.id = s.entry_id where e.id is null
union all select 'examples', count(*) from lex.examples x left join lex.entries e on e.id = x.entry_id where e.id is null
union all select 'inflections', count(*) from lex.inflections i left join lex.entries e on e.id = i.entry_id where e.id is null
union all select 'pronunciations', count(*) from lex.pronunciations p left join lex.entries e on e.id = p.entry_id where e.id is null
union all select 'lex_relations', count(*) from lex.lex_relations r left join lex.entries e on e.id = r.entry_id where e.id is null;

-- 8. Cost of an index being considered for lex.inflections(form_text),
--    estimated before creating it: total key length plus per-row overhead.
select pg_size_pretty((sum(pg_column_size(form_text)) + count(*) * 16)::bigint) as estimated_index_size
from lex.inflections;
