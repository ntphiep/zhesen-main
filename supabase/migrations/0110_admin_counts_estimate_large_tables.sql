-- 0110_admin_counts_estimate_large_tables.sql
-- admin.metrics() and admin.dictionary() counted every row of every table, which 0056 timed
-- at 170 ms over 18 tables. On 2026-10-04 production holds 26 tables and 9.4 million rows
-- in lex alone: metrics took 2.5 to 2.9 s, dictionary 2.4 s, and three admin pages opened
-- at once ran past the 8 s statement_timeout of `authenticated` and failed with 57014.
--
-- A table with 100,000 rows or more by `pg_class.reltuples` now reports that estimate and
-- says so ('estimated': true); a smaller one is still counted exactly, as is lex.entries,
-- whose total is the sum of the per-language count metrics already makes. Measured on
-- production on 2026-10-04 against the exact counts: lex.entries 1,033,112 estimated
-- against 960,618 counted, lex.senses 1,363,163 against 1,362,840. Autovacuum re-analyses
-- the large tables at 2% change since 0102.
--
-- TO ROLL BACK: replay admin.dictionary() and admin.metrics() from 0061, then 0063's
-- `alter function admin.dictionary() set search_path`.

create or replace function admin.dictionary()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, admin, lex, public
as $$
declare
  r record;
  n bigint;
  est boolean;
  tables jsonb := '[]'::jsonb;
begin
  perform admin.assert_admin();

  for r in
    select c.oid, ns.nspname, c.relname, c.relrowsecurity, c.reltuples
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where c.relkind in ('r', 'p') and ns.nspname in ('lex', 'public', 'admin')
    order by ns.nspname, c.relname
  loop
    est := r.reltuples >= 100000;
    if est then
      n := r.reltuples::bigint;
    else
      execute format('select count(*) from %I.%I', r.nspname, r.relname) into n;
    end if;
    tables := tables || jsonb_build_object(
      'schema', r.nspname,
      'name', r.relname,
      'comment', obj_description(r.oid, 'pg_class'),
      'rows', n,
      'estimated', est,
      'bytes', pg_total_relation_size(r.oid),
      'rls', r.relrowsecurity,
      'columns', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', a.attname,
          'type', format_type(a.atttypid, a.atttypmod),
          'nullable', not a.attnotnull,
          'default', case when a.attgenerated = '' then pg_get_expr(d.adbin, d.adrelid) end,
          'generated', a.attgenerated <> '',
          'identity', a.attidentity <> '',
          'primary_key', coalesce(a.attnum = any (pk.conkey), false),
          'comment', col_description(r.oid, a.attnum)
        ) order by a.attnum), '[]'::jsonb)
        from pg_attribute a
        left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        left join pg_constraint pk on pk.conrelid = r.oid and pk.contype = 'p'
        where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
      ),
      'foreign_keys', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'columns', (select jsonb_agg(attname order by k.i) from unnest(fk.conkey) with ordinality k(n, i)
                      join pg_attribute on attrelid = fk.conrelid and attnum = k.n),
          'ref_schema', rn.nspname,
          'ref_table', rc.relname,
          'ref_columns', (select jsonb_agg(attname order by k.i) from unnest(fk.confkey) with ordinality k(n, i)
                          join pg_attribute on attrelid = fk.confrelid and attnum = k.n),
          'on_delete', case fk.confdeltype when 'c' then 'cascade' when 'n' then 'set null'
                                            when 'd' then 'set default' when 'r' then 'restrict' else 'no action' end
        ) order by fk.conname), '[]'::jsonb)
        from pg_constraint fk
        join pg_class rc on rc.oid = fk.confrelid
        join pg_namespace rn on rn.oid = rc.relnamespace
        where fk.conrelid = r.oid and fk.contype = 'f'
      ),
      'indexes', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', ic.relname,
          'definition', pg_get_indexdef(i.indexrelid),
          'bytes', pg_relation_size(i.indexrelid)
        ) order by ic.relname), '[]'::jsonb)
        from pg_index i join pg_class ic on ic.oid = i.indexrelid
        where i.indrelid = r.oid
      )
    );
  end loop;

  return jsonb_build_object(
    'schemas', (
      select jsonb_agg(jsonb_build_object('name', nspname, 'comment', obj_description(oid, 'pg_namespace')) order by nspname)
      from pg_namespace where nspname in ('lex', 'public', 'admin')
    ),
    'tables', tables
  );
end;
$$;

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
  est boolean;
  by_lang jsonb;
  tables jsonb := '[]'::jsonb;
begin
  perform admin.assert_admin();

  select coalesce(jsonb_object_agg(x.lang, x.n), '{}'::jsonb) into by_lang
  from (select e.lang, count(*) as n from lex.entries e group by e.lang) x;

  for r in
    select c.oid, ns.nspname, c.relname, c.reltuples
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where c.relkind in ('r', 'p') and ns.nspname in ('lex', 'public', 'admin')
    order by ns.nspname, c.relname
  loop
    if r.nspname = 'lex' and r.relname = 'entries' then
      -- Exact, and free: the per-language count above already read every entry.
      est := false;
      select coalesce(sum(v::bigint), 0) into n from jsonb_each_text(by_lang) as t(k, v);
    else
      est := r.reltuples >= 100000;
      if est then
        n := r.reltuples::bigint;
      else
        execute format('select count(*) from %I.%I', r.nspname, r.relname) into n;
      end if;
    end if;
    tables := tables || jsonb_build_object(
      'schema', r.nspname,
      'name', r.relname,
      'rows', n,
      'estimated', est,
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
        'permanent', count(*) filter (where nullif(u.email, '') is not null),
        'new_7d', count(*) filter (where u.created_at > now() - interval '7 days')
      )
      from auth.users u
    ),
    'lex_updated_at', (select max(e.updated_at) from lex.entries e),
    'active_7d', (select count(distinct l.user_id) from public.review_log l where l.day > current_date - 7),
    'postgres', jsonb_build_object(
      'version', current_setting('server_version'),
      'started_at', pg_postmaster_start_time(),
      'connections', (select count(*) from pg_stat_activity where backend_type = 'client backend'),
      'max_connections', current_setting('max_connections')::int
    ),
    'entries_by_lang', by_lang
  );
end;
$$;

revoke all on function admin.dictionary() from public;
grant execute on function admin.dictionary() to authenticated;
revoke all on function admin.metrics() from public;
grant execute on function admin.metrics() to authenticated;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20261004000110', 'admin_counts_estimate_large_tables')
on conflict (version) do nothing;
