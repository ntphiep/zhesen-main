-- 0142_reminders_sender.sql
-- The four calls the push sender (infra/supabase/push/sender.mts) makes every hour as
-- service_role, through PostgREST's admin schema like the sampler (0072).
--
-- reviewed-destructive: lead, 2026-10-05; deletes only the feature's own re-registered or expired push subscriptions
--
-- TO ROLL BACK: drop the four functions.

-- Who gets a reminder now: the local hour has reached the learner's hour and is at most 22,
-- nothing was sent on this local date, a browser is registered, and the session has cards.
-- `due` must stay equal to countDueCards (lib/wordlist/review.ts) with SESSION_LIMITS 50 and
-- 20, so the push names the number /practice shows. Every due count for the push lives here.
create or replace function admin.reminders_due(p_now timestamptz default now())
returns table (user_id uuid, due integer, subscriptions jsonb)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select r.user_id, s.due, d.subscriptions
  from public.reminders r
  cross join lateral (select (p_now at time zone r.time_zone) as local) l
  cross join lateral (
    select
      least(count(*) filter (where w.fsrs_reps > 0), 50)::integer as learned,
      count(*) filter (where w.fsrs_reps = 0)::integer as fresh
    from public.user_words w
    where w.user_id = r.user_id and w.fsrs_due_at <= p_now
  ) c
  cross join lateral (select c.learned + least(20, 50 - c.learned, c.fresh) as due) s
  cross join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth
    ) order by p.created_at) as subscriptions
    from public.push_subscriptions p
    where p.user_id = r.user_id
  ) d
  where r.sent_on is distinct from l.local::date
    and extract(hour from l.local) between r.hour and 22
    and d.subscriptions is not null
    and s.due > 0;
$$;

-- Claims a user for today before the first push: true once per local date, so neither a
-- failure after a push nor a second run can remind the same learner twice in one day.
create or replace function admin.reminders_claim(p_user_id uuid, p_now timestamptz default now())
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  with claimed as (
    update public.reminders r
       set sent_on = (p_now at time zone r.time_zone)::date
     where r.user_id = p_user_id
       and r.sent_on is distinct from (p_now at time zone r.time_zone)::date
    returning 1
  )
  select exists (select 1 from claimed);
$$;

-- Gives today's claim back when no browser was reached, so the next hour tries again.
create or replace function admin.reminders_release(p_user_id uuid, p_now timestamptz default now())
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  with released as (
    update public.reminders r
       set sent_on = null
     where r.user_id = p_user_id
       and r.sent_on = (p_now at time zone r.time_zone)::date
    returning 1
  )
  select exists (select 1 from released);
$$;

-- Subscriptions the push service answered 403, 404 or 410 for: the browser dropped them, or
-- they belong to a VAPID key this deployment no longer holds.
create or replace function admin.push_subscriptions_gone(p_ids uuid[])
returns integer
language sql
security definer
set search_path = pg_catalog, public
as $$
  with gone as (
    delete from public.push_subscriptions where id = any (p_ids)
    returning 1
  )
  select count(*)::integer from gone;
$$;

revoke all on function admin.reminders_due(timestamptz) from public, anon, authenticated;
revoke all on function admin.reminders_claim(uuid, timestamptz) from public, anon, authenticated;
revoke all on function admin.reminders_release(uuid, timestamptz) from public, anon, authenticated;
revoke all on function admin.push_subscriptions_gone(uuid[]) from public, anon, authenticated;
grant execute on function admin.reminders_due(timestamptz) to service_role;
grant execute on function admin.reminders_claim(uuid, timestamptz) to service_role;
grant execute on function admin.reminders_release(uuid, timestamptz) to service_role;
grant execute on function admin.push_subscriptions_gone(uuid[]) to service_role;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20261005000142', 'reminders_sender')
on conflict (version) do nothing;
