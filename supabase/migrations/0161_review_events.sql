-- 0161_review_events.sql
-- One row per graded answer, in every practice mode, for both FSRS skills of 0160. The
-- schedule columns on public.user_words keep only a card's latest state and review_log keeps
-- one row per day, so neither can say how often a word was answered, in which mode, or with
-- what result. `applied` is false when the answer was logged but did not move the schedule (a
-- success on a Review card not yet due). The before and after values come from ts-fsrs's
-- review log and next card, enough to fit personal FSRS parameters later.
--
-- A learner reads and inserts only their own rows, and only against a word they own. Rows
-- go with the word or the account (cascade). admin.merge_account moves the events of every
-- word it moves.

create table if not exists public.review_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  word_id uuid not null references public.user_words(id) on delete cascade,
  skill text not null check (skill in ('recall', 'recognition')),
  mode text not null check (mode in ('review', 'quiz', 'write', 'dictation', 'match', 'speak')),
  rating smallint not null check (rating between 1 and 4),
  applied boolean not null,
  state_before smallint not null check (state_before between 0 and 3),
  state_after smallint not null check (state_after between 0 and 3),
  stability_before real not null,
  stability_after real not null,
  difficulty_before real not null,
  difficulty_after real not null,
  elapsed_days int not null,
  scheduled_days int not null,
  reviewed_at timestamptz not null default now()
);

create index if not exists review_events_user_reviewed_idx on public.review_events (user_id, reviewed_at);
create index if not exists review_events_word_idx on public.review_events (word_id);

alter table public.review_events enable row level security;

drop policy if exists review_events_select_own on public.review_events;
create policy review_events_select_own on public.review_events
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists review_events_insert_own on public.review_events;
create policy review_events_insert_own on public.review_events
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.user_words w where w.id = word_id and w.user_id = (select auth.uid()))
  );

-- Supabase's default privileges grant every table privilege to anon and authenticated.
revoke all on public.review_events from anon, authenticated;
grant select, insert on public.review_events to authenticated;

comment on table public.review_events is
  'zhesen: one row per graded practice answer, per skill and mode. Written by gradeWordById in lib/wordlist/review.ts. RLS scopes every statement to auth.uid().';
comment on column public.review_events.user_id is 'The account. References auth.users; deleted with it.';
comment on column public.review_events.word_id is 'The saved word answered. References public.user_words; deleted with it.';
comment on column public.review_events.skill is 'recall (fsrs_* columns) or recognition (fsrs_recog_* columns).';
comment on column public.review_events.mode is 'The practice mode that graded the answer.';
comment on column public.review_events.rating is 'FSRS rating: 1 again, 2 hard, 3 good, 4 easy.';
comment on column public.review_events.applied is 'Whether the answer moved the schedule. False for a success on a Review card not yet due.';
comment on column public.review_events.state_before is 'Card state before the answer: 0 new, 1 learning, 2 review, 3 relearning.';
comment on column public.review_events.state_after is 'Card state the answer scheduled, whether or not it was applied.';
comment on column public.review_events.stability_before is 'FSRS stability before the answer, in days.';
comment on column public.review_events.stability_after is 'FSRS stability the answer scheduled, in days.';
comment on column public.review_events.difficulty_before is 'FSRS difficulty before the answer, 1 to 10.';
comment on column public.review_events.difficulty_after is 'FSRS difficulty the answer scheduled, 1 to 10.';
comment on column public.review_events.elapsed_days is 'Days since the previous review of this skill, as ts-fsrs counted them.';
comment on column public.review_events.scheduled_days is 'Interval, in days, the answer scheduled.';
comment on column public.review_events.reviewed_at is 'When the answer was given.';

-- 0059's merge, plus the events of the moved words.
create or replace function admin.merge_account(p_from uuid, p_into uuid)
returns jsonb
language plpgsql
security definer
set search_path = admin, public
as $$
declare
  v_moved bigint;
  v_kept bigint;
  v_days bigint;
begin
  perform admin.assert_admin();

  if p_from = p_into then
    raise exception 'same_account' using errcode = '22023';
  end if;
  if (select count(*) from auth.users where id in (p_from, p_into)) <> 2 then
    raise exception 'no_such_account' using errcode = '22023';
  end if;

  -- Transaction-scoped: the lock and the disabled trigger end with this call.
  alter table public.user_words disable trigger user_words_set_updated_at;
  update public.user_words w
     set user_id = p_into
   where w.user_id = p_from
     and (w.entry_id is null or not exists (
       select 1 from public.user_words t
       where t.user_id = p_into and t.entry_id = w.entry_id
     ));
  get diagnostics v_moved = row_count;
  alter table public.user_words enable trigger user_words_set_updated_at;

  update public.review_events e
     set user_id = p_into
    from public.user_words w
   where e.word_id = w.id and w.user_id = p_into and e.user_id = p_from;

  select count(*) into v_kept from public.user_words where user_id = p_from;

  insert into public.review_log (user_id, day)
  select p_into, l.day from public.review_log l where l.user_id = p_from
  on conflict (user_id, day) do nothing;
  get diagnostics v_days = row_count;

  perform admin.audit('merge_account', p_into::text, jsonb_build_object(
    'from', p_from, 'into', p_into, 'moved', v_moved, 'kept', v_kept, 'days', v_days));

  return jsonb_build_object('moved', v_moved, 'kept', v_kept, 'days', v_days);
end;
$$;

revoke all on function admin.merge_account(uuid, uuid) from public;
grant execute on function admin.merge_account(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20261005000161', 'review_events')
on conflict (version) do nothing;
