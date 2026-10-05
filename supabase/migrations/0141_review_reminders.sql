-- 0141_review_reminders.sql
-- A daily review reminder by web push (issue #91): the hour a learner picked, and the push
-- subscription of every browser they turned it on in.
--
-- RLS scopes both tables to their owner, and only a permanent account may create a reminder:
-- an anonymous account lives in one browser's cookie and has no page to turn it off from.
-- sent_on is written only by admin.reminders_sent (0142), so the learner holds no privilege
-- on it. A subscription is written only by public.push_subscribe, which moves an endpoint to
-- the account that registered it last, so a shared browser reminds the last account only.
--
-- The endpoint is limited to the push services browsers use, because the sender on the
-- instance POSTs to it: FCM (Chrome, Android, Opera, Samsung), Mozilla, Apple and WNS (Edge).
--
-- TO ROLL BACK: drop public.push_subscribe, then both tables.

create table if not exists public.reminders (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  hour smallint not null default 20 check (hour between 6 and 22),
  -- An unknown zone raises 22023 from `at time zone` rather than failing the check.
  time_zone text not null check (
    length(time_zone) <= 64 and (timestamptz '2000-01-01 00:00+00' at time zone time_zone) is not null
  ),
  sent_on date,
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (
    length(endpoint) <= 1024
    and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'
  ),
  -- base64url without padding: a 65-byte P-256 point and a 16-byte secret (RFC 8291).
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22}$'),
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

drop trigger if exists reminders_set_updated_at on public.reminders;
create trigger reminders_set_updated_at
  before update on public.reminders
  for each row execute function public.set_updated_at();

alter table public.reminders enable row level security;
alter table public.push_subscriptions enable row level security;

create policy reminders_select_own on public.reminders
  for select to authenticated using (user_id = (select auth.uid()));
create policy reminders_insert_own on public.reminders
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  );
create policy reminders_update_own on public.reminders
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy reminders_delete_own on public.reminders
  for delete to authenticated using (user_id = (select auth.uid()));

create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- postgres's default privileges in public hand every API role every privilege on a new
-- table (0058).
revoke all on public.reminders, public.push_subscriptions from anon, authenticated, service_role;
grant select, delete on public.reminders, public.push_subscriptions to authenticated;
grant insert (hour, time_zone), update (hour, time_zone) on public.reminders to authenticated;

-- One row per browser. An endpoint already held by another account moves to the caller.
-- Ten browsers per account is the ceiling; the sender removes the ones that expire.
create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'permanent_account_required' using errcode = '42501';
  end if;
  if (select count(*) from public.push_subscriptions
      where user_id = v_uid and endpoint is distinct from p_endpoint) >= 10 then
    raise exception 'too_many_devices' using errcode = '54000';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.push_subscribe(text, text, text) from public, anon, service_role;
grant execute on function public.push_subscribe(text, text, text) to authenticated;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20261005000141', 'review_reminders')
on conflict (version) do nothing;
