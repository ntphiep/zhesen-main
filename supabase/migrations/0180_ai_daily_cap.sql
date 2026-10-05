-- 0180_ai_daily_cap.sql
-- A daily cap on assistant calls per account. POST /api/ai calls public.ai_take_call with the
-- caller's own session before every model call; a cached answer takes no call. The route's
-- other budgets live in one process's memory (app/api/ai/route.ts), so before this one address
-- could spend about 28,800 calls a day per instance of a free quota the batch shares.
--
-- RLS is on, no policy exists and no API role holds a privilege on the table: the function is
-- the only way in, and it only ever counts up for auth.uid(). An anonymous session gets no call.
-- The day is Vietnam's, the learners' own.
--
-- TO ROLL BACK: drop the function and the table.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  calls int not null check (calls >= 0),
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;
-- postgres's default privileges in public hand every API role every privilege on a new
-- table (0058).
revoke all on public.ai_usage from anon, authenticated, service_role;

comment on table public.ai_usage is 'Assistant calls per account per Vietnam day, counted by public.ai_take_call.';

-- True and counted when the caller has a call left today, false otherwise. 100 a day: the
-- whole site made 70 assistant calls from 2026-09-26 to 2026-09-29, and tagging 200 words
-- takes 10. The conditional upsert takes the row lock, so two calls at once cannot both
-- pass on the same count.
create or replace function public.ai_take_call()
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_calls int;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    return false;
  end if;
  insert into public.ai_usage as u (user_id, day, calls)
  values (v_uid, (now() at time zone 'Asia/Ho_Chi_Minh')::date, 1)
  on conflict (user_id, day) do update set calls = u.calls + 1 where u.calls < 100
  returning calls into v_calls;
  return v_calls is not null;
end;
$$;

revoke all on function public.ai_take_call() from public, anon, service_role;
grant execute on function public.ai_take_call() to authenticated;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20261005000180', 'ai_daily_cap')
on conflict (version) do nothing;
