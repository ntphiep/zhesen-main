-- 0056_admin_metrics_rpc.sql
-- The `admin` schema, its gate, and the first read in it: the numbers that used to need
-- psql over an SSM session.
--
-- Every function in this schema is `security definer`, so it runs as postgres and skips
-- RLS. That is the point, and it is why each one calls `admin.assert_admin()` as its first
-- statement: exposing the schema through PostgREST then adds nothing a learner can read or
-- write. No RLS policy on lex.* or public.* changes.
--
-- Postgres grants EXECUTE to PUBLIC on every new function, and this schema has no default
-- privileges of its own, so each function below revokes it explicitly.
--
-- TO ROLL BACK: `drop schema admin cascade;`, then restore the authenticator setting to
-- 'public, graphql_public, lex' and `notify pgrst, 'reload config';`.

create schema if not exists admin;
revoke all on schema admin from public;
grant usage on schema admin to authenticated;

create or replace function admin.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'admin only' using errcode = '42501';
  end if;
end;
$$;

revoke all on function admin.assert_admin() from public;

-- Exact counts, not reltuples: the dashboard is where an estimate would be mistaken for a
-- fact. All 18 tables in lex and public counted in 170 ms on production, well inside the
-- 8 s `statement_timeout` of `authenticated`.
--
-- PGroonga keeps its index data in `pgrn*` files that no pg_class row owns, so the gap
-- between `pg_database_size` and the sum of `pg_total_relation_size` is PGroonga. Measured
-- on production: a gap of 170,761,363 bytes against 171,208,704 bytes of `pgrn*` files.
-- `pgroonga_surplus` counts `Sources<relfilenode>` objects whose index no longer exists,
-- the leftovers a `VACUUM FULL` leaves behind.
create or replace function admin.metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = admin, lex, public, extensions
as $$
declare
  r record;
  n bigint;
  tables jsonb := '[]'::jsonb;
begin
  perform admin.assert_admin();

  for r in
    select c.oid, ns.nspname, c.relname
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where c.relkind in ('r', 'p') and ns.nspname in ('lex', 'public', 'admin')
    order by ns.nspname, c.relname
  loop
    execute format('select count(*) from %I.%I', r.nspname, r.relname) into n;
    tables := tables || jsonb_build_object(
      'schema', r.nspname,
      'name', r.relname,
      'rows', n,
      'bytes', pg_total_relation_size(r.oid)
    );
  end loop;

  return jsonb_build_object(
    'tables', tables,
    'database_bytes', pg_database_size(current_database()),
    'relation_bytes', (
      select coalesce(sum(pg_total_relation_size(c.oid)), 0)
      from pg_class c where c.relkind in ('r', 'm', 'p')
    ),
    'pgroonga_indexes', (
      select count(*) from pg_class c
      where c.relam = (select oid from pg_am where amname = 'pgroonga')
    ),
    'pgroonga_surplus', (
      select count(*)
      from jsonb_object_keys(extensions.pgroonga_command('object_list')::jsonb -> 1) k
      where k ~ '^Sources[0-9]+$'
        and substring(k from 8)::oid not in (
          select c.relfilenode from pg_class c
          where c.relam = (select oid from pg_am where amname = 'pgroonga')
        )
    ),
    'accounts', (
      select jsonb_build_object(
        'total', count(*),
        'permanent', count(*) filter (where nullif(u.email, '') is not null)
      )
      from auth.users u
    ),
    'lex_updated_at', (select max(e.updated_at) from lex.entries e)
  );
end;
$$;

revoke all on function admin.metrics() from public;
grant execute on function admin.metrics() to authenticated;

-- Exposed through PostgREST only once the schema exists, or the schema cache reload
-- fails. The environment variable in infra/supabase/env.template says the same list;
-- the role setting wins over it (docs.postgrest.org, "In-Database Configuration").
alter role authenticator set "pgrst.db_schemas" = 'public, graphql_public, lex, admin';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20260923000001', 'admin_metrics_rpc')
on conflict (version) do nothing;
