-- 0162_reminders_due_study_day.sql
-- admin.reminders_due follows countDueCards (lib/wordlist/review.ts) again: words marked
-- known are suspended, a card counts when due before the study day ends at 04:00
-- Asia/Ho_Chi_Minh, and the 20 new cards a day shrink by the new cards graded since 04:00
-- (review_events, 0161). Requires 0160 and 0161.
--
-- TO ROLL BACK: re-run the reminders_due definition in 0142_reminders_sender.sql.

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
  -- studyDayStart: 04:00 in Hà Nội, which has no daylight saving.
  cross join lateral (
    select ((((p_now at time zone 'Asia/Ho_Chi_Minh') - interval '4 hours')::date + interval '4 hours')
      at time zone 'Asia/Ho_Chi_Minh') as day_start
  ) t
  cross join lateral (
    select
      least(count(*) filter (where w.fsrs_reps > 0), 50)::integer as learned,
      count(*) filter (where w.fsrs_reps = 0)::integer as fresh
    from public.user_words w
    where w.user_id = r.user_id
      and w.status <> 'known'
      and w.fsrs_due_at < t.day_start + interval '1 day'
  ) c
  cross join lateral (
    select count(*)::integer as new_today
    from public.review_events e
    where e.user_id = r.user_id
      and e.skill = 'recall' and e.state_before = 0 and e.applied
      and e.reviewed_at >= t.day_start
  ) n
  cross join lateral (
    select c.learned + greatest(0, least(20 - n.new_today, 50 - c.learned, c.fresh)) as due
  ) s
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

revoke all on function admin.reminders_due(timestamptz) from public, anon, authenticated;
grant execute on function admin.reminders_due(timestamptz) to service_role;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20261005000162', 'reminders_due_study_day')
on conflict (version) do nothing;
