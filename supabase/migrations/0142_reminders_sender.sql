-- 0142_reminders_sender.sql
-- The three calls the push sender (infra/supabase/push/sender.mts) makes every hour as
-- service_role, through PostgREST's admin schema like the sampler (0072).
--
-- reviewed-destructive: lead, 2026-10-05; deletes only the feature's own re-registered or expired push subscriptions
--
-- TO ROLL BACK: drop the three functions.

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

-- Stamps the local date each user was reminded on, so the next hourly run skips them.
create or replace function admin.reminders_sent(p_user_ids uuid[], p_now timestamptz default now())
returns integer
language sql
security definer
set search_path = pg_catalog, public
as $$
  with stamped as (
    update public.reminders r
       set sent_on = (p_now at time zone r.time_zone)::date
     where r.user_id = any (p_user_ids)
    returning 1
  )
  select count(*)::integer from stamped;
$$;

-- Subscriptions the push service answered 404 or 410 for: the browser dropped them.
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
revoke all on function admin.reminders_sent(uuid[], timestamptz) from public, anon, authenticated;
revoke all on function admin.push_subscriptions_gone(uuid[]) from public, anon, authenticated;
grant execute on function admin.reminders_due(timestamptz) to service_role;
grant execute on function admin.reminders_sent(uuid[], timestamptz) to service_role;
grant execute on function admin.push_subscriptions_gone(uuid[]) to service_role;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20261005000142', 'reminders_sender')
on conflict (version) do nothing;
