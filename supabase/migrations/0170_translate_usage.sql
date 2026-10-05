-- 0170_translate_usage.sql
-- Azure Translator characters per UTC day, so POST /dictionary/translate can refuse a
-- passage once the month has spent lib/translate/usage.ts MONTHLY_BUDGET.
--
-- The app holds no service_role key, so the counter is written by the anon or the signed-in
-- caller through a security definer function. Anyone holding the public anon key can raise
-- it; the worst that does is stop passage translations until the month ends, which the
-- route's own rate limit already allows (30 requests of 5,000 characters a minute). Each
-- call adds at most 50,000, Azure's per-request ceiling. RLS is on and no policy exists, so
-- the table itself is readable by no API role.
--
-- TO ROLL BACK: `drop function public.translate_usage(integer);` then
-- `drop table admin.translate_usage;` and `notify pgrst, 'reload schema';`.

set lock_timeout = '5s';

create table if not exists admin.translate_usage (
  day date primary key,
  chars bigint not null check (chars >= 0)
);

alter table admin.translate_usage enable row level security;
revoke all on admin.translate_usage from public, anon, authenticated;

-- Adds p_chars to today (0 adds nothing) and answers the month so far.
create or replace function public.translate_usage(p_chars integer default 0)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, admin
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  if p_chars is null or p_chars < 0 or p_chars > 50000 then
    raise exception 'p_chars out of range' using errcode = '22023';
  end if;
  if p_chars > 0 then
    insert into admin.translate_usage as u (day, chars) values (v_today, p_chars)
    on conflict (day) do update set chars = u.chars + excluded.chars;
  end if;
  return (
    select coalesce(sum(chars), 0)::bigint from admin.translate_usage
    where day >= date_trunc('month', v_today)::date
  );
end;
$$;

revoke all on function public.translate_usage(integer) from public;
grant execute on function public.translate_usage(integer) to anon, authenticated;

notify pgrst, 'reload schema';

reset lock_timeout;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261005000170', 'translate_usage')
on conflict (version) do nothing;
