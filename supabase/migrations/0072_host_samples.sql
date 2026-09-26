-- 0072_host_samples.sql
-- Host and container counters, one row every 5 seconds from infra/supabase/sampler, so
-- /admin/infra reads the instance through PostgREST instead of an SSM command that took
-- 3.4 to 3.9 s per call.
--
-- The sampler posts as service_role through admin.put_host_sample, which also keeps the
-- table to the last hour. The console reads through admin.host_samples_since, which checks
-- the caller first like every other function granted to authenticated. RLS is on and no
-- policy exists, so the table itself is readable by no API role.
--
-- A row carries every container's mounts, ports and last health output. `p_slim` returns
-- only the counters the one-hour charts use, so an hour of points does not carry 720
-- copies of them.
--
-- reviewed-destructive: owner asked for live container metrics on 2026-09-26; the function only drops host samples older than one hour.
--
-- TO ROLL BACK: drop both functions and the table, then
-- `revoke usage on schema admin from service_role;`.

create table if not exists admin.host_samples (
  at timestamptz primary key default now(),
  host jsonb not null check (jsonb_typeof(host) = 'object'),
  containers jsonb not null check (jsonb_typeof(containers) = 'array')
);

alter table admin.host_samples enable row level security;

create or replace function admin.put_host_sample(p_host jsonb, p_containers jsonb)
returns void
language sql
security definer
set search_path = pg_catalog, admin
as $$
  insert into admin.host_samples (host, containers) values (p_host, p_containers);
  delete from admin.host_samples where at < now() - interval '1 hour';
$$;

revoke all on function admin.put_host_sample(jsonb, jsonb) from public;
grant usage on schema admin to service_role;
grant execute on function admin.put_host_sample(jsonb, jsonb) to service_role;

-- The newest 720 rows after p_since, oldest first: one hour at one row per 5 seconds.
create or replace function admin.host_samples_since(p_since timestamptz, p_slim boolean default false)
returns setof admin.host_samples
language plpgsql
stable
security definer
set search_path = pg_catalog, admin
as $$
begin
  perform admin.assert_admin();

  return query
    select
      s.at,
      case when p_slim then jsonb_build_object(
        'cpu_busy', s.host->'cpu_busy', 'cpu_total', s.host->'cpu_total',
        'mem_total', s.host->'mem_total', 'mem_available', s.host->'mem_available')
      else s.host end,
      case when p_slim then (
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', c->'name', 'cpu_usage', c->'cpu_usage', 'cpu_system', c->'cpu_system',
          'online_cpus', c->'online_cpus', 'mem_usage', c->'mem_usage', 'mem_inactive', c->'mem_inactive'
        )), '[]'::jsonb)
        from jsonb_array_elements(s.containers) c)
      else s.containers end
    from (
      select h.at, h.host, h.containers
      from admin.host_samples h
      where h.at > p_since
      order by h.at desc
      limit 720
    ) s
    order by s.at;
end;
$$;

revoke all on function admin.host_samples_since(timestamptz, boolean) from public;
grant execute on function admin.host_samples_since(timestamptz, boolean) to authenticated;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20260926000007', 'host_samples')
on conflict (version) do nothing;
