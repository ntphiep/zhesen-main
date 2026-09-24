-- 0062_admin_live_monitor.sql
-- What /admin/monitor polls every 10 seconds, and the statements that cost the most time.
--
-- Both run as postgres, which holds pg_monitor (pg_read_all_stats), so pg_stat_activity
-- shows every backend's query text and pg_stat_statements is readable. Counters are
-- cumulative; the page turns two polls into a rate.
--
-- TO ROLL BACK: `drop function admin.live(); drop function admin.slow_queries();`.

create or replace function admin.live()
returns jsonb
language plpgsql
stable
security definer
set search_path = admin, public, extensions, pg_catalog
as $$
begin
  perform admin.assert_admin();

  return jsonb_build_object(
    'at', clock_timestamp(),
    'max_connections', current_setting('max_connections')::int,
    'connections', (
      select coalesce(jsonb_object_agg(s.state, s.n), '{}'::jsonb)
      from (
        select coalesce(a.state, 'unknown') as state, count(*) as n
        from pg_stat_activity a
        where a.backend_type = 'client backend'
        group by 1
      ) s
    ),
    'running', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'pid', a.pid,
        'user', a.usename,
        'application', nullif(a.application_name, ''),
        'state', a.state,
        'wait', nullif(concat_ws(':', a.wait_event_type, a.wait_event), ''),
        'seconds', round(extract(epoch from clock_timestamp() - a.query_start)::numeric, 1),
        'query', left(a.query, 300)
      ) order by a.query_start), '[]'::jsonb)
      from pg_stat_activity a
      where a.backend_type = 'client backend'
        and a.state <> 'idle'
        and a.pid <> pg_backend_pid()
    ),
    'lock_waits', (select count(*) from pg_stat_activity a where a.wait_event_type = 'Lock'),
    'database', (
      select jsonb_build_object(
        'bytes', pg_database_size(d.datname),
        'commits', d.xact_commit,
        'rollbacks', d.xact_rollback,
        'blocks_hit', d.blks_hit,
        'blocks_read', d.blks_read,
        'rows_returned', d.tup_returned,
        'rows_written', d.tup_inserted + d.tup_updated + d.tup_deleted,
        'deadlocks', d.deadlocks,
        'stats_reset', d.stats_reset
      )
      from pg_stat_database d where d.datname = current_database()
    )
  );
end;
$$;

revoke all on function admin.live() from public;
grant execute on function admin.live() to authenticated;

create or replace function admin.slow_queries(p_limit int default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = admin, public, extensions, pg_catalog
as $$
begin
  perform admin.assert_admin();

  return (
    select coalesce(jsonb_agg(x order by x.total_ms desc), '[]'::jsonb)
    from (
      select
        left(s.query, 400) as query,
        r.rolname as role,
        s.calls,
        round(s.total_exec_time::numeric, 1) as total_ms,
        round(s.mean_exec_time::numeric, 2) as mean_ms,
        round(s.max_exec_time::numeric, 1) as max_ms,
        s.rows,
        case when s.shared_blks_hit + s.shared_blks_read > 0
          then round(s.shared_blks_hit::numeric / (s.shared_blks_hit + s.shared_blks_read), 4)
        end as hit_ratio
      from extensions.pg_stat_statements s
      join pg_roles r on r.oid = s.userid
      where s.dbid = (select oid from pg_database where datname = current_database())
      order by s.total_exec_time desc
      limit least(greatest(p_limit, 1), 50)
    ) x
  );
end;
$$;

revoke all on function admin.slow_queries(int) from public;
grant execute on function admin.slow_queries(int) to authenticated;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20260925000002', 'admin_live_monitor')
on conflict (version) do nothing;
