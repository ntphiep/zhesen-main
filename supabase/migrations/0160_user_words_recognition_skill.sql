-- 0160_user_words_recognition_skill.sql
-- A second FSRS state per saved word. The fsrs_* columns of 0017 stay the recall skill
-- (review, write, dictation, speak); the fsrs_recog_* twins below are the recognition skill
-- (quiz, match). Row RLS and the table-level grants of 0006 already cover new columns, and
-- admin.merge_account moves whole rows, so neither needs a change.
--
-- Recognition starts as a copy of recall for every graded row (77 on 2026-10-05) and New
-- for the rest (411): recognition is the easier skill, so recall's stability is a lower
-- bound for it. The copy only touches rows whose recognition is still untouched, so a
-- replay never overwrites recognition progress.
--
-- Backup before applying: s3://zhesen-db-backups-014498663963/migrations/user-words-20261005.csv

alter table public.user_words
  add column if not exists fsrs_recog_stability real not null default 0,
  add column if not exists fsrs_recog_difficulty real not null default 0,
  add column if not exists fsrs_recog_elapsed_days int not null default 0,
  add column if not exists fsrs_recog_scheduled_days int not null default 0,
  add column if not exists fsrs_recog_learning_steps int not null default 0,
  add column if not exists fsrs_recog_reps int not null default 0,
  add column if not exists fsrs_recog_lapses int not null default 0,
  add column if not exists fsrs_recog_state smallint not null default 0 check (fsrs_recog_state between 0 and 3),
  add column if not exists fsrs_recog_due_at timestamptz not null default now(),
  add column if not exists fsrs_recog_last_review_at timestamptz;

create index if not exists user_words_user_fsrs_recog_due_idx on public.user_words (user_id, fsrs_recog_due_at);

-- The copy keeps updated_at, which admin.users reads as last activity. Apply the file as one
-- transaction (psql -1), so a failure cannot leave the trigger disabled.
alter table public.user_words disable trigger user_words_set_updated_at;
update public.user_words
set
  fsrs_recog_stability = fsrs_stability,
  fsrs_recog_difficulty = fsrs_difficulty,
  fsrs_recog_elapsed_days = fsrs_elapsed_days,
  fsrs_recog_scheduled_days = fsrs_scheduled_days,
  fsrs_recog_learning_steps = fsrs_learning_steps,
  fsrs_recog_reps = fsrs_reps,
  fsrs_recog_lapses = fsrs_lapses,
  fsrs_recog_state = fsrs_state,
  fsrs_recog_due_at = fsrs_due_at,
  fsrs_recog_last_review_at = fsrs_last_review_at
where fsrs_reps > 0 and fsrs_recog_reps = 0 and fsrs_recog_last_review_at is null;
alter table public.user_words enable trigger user_words_set_updated_at;

comment on column public.user_words.fsrs_stability is 'FSRS recall skill (review, write, dictation, speak): days until recall probability falls to 90%.';
comment on column public.user_words.fsrs_difficulty is 'FSRS recall skill: how hard the word is for this learner, 1 to 10.';
comment on column public.user_words.fsrs_elapsed_days is 'FSRS recall skill: days between the last two reviews.';
comment on column public.user_words.fsrs_scheduled_days is 'FSRS recall skill: interval, in days, the last review scheduled.';
comment on column public.user_words.fsrs_learning_steps is 'FSRS recall skill: index into the short learning steps while state is 1 or 3.';
comment on column public.user_words.fsrs_reps is 'FSRS recall skill: number of reviews.';
comment on column public.user_words.fsrs_lapses is 'FSRS recall skill: number of times the word was forgotten after being learnt.';
comment on column public.user_words.fsrs_state is 'FSRS recall skill card state: 0 new, 1 learning, 2 review, 3 relearning.';
comment on column public.user_words.fsrs_due_at is 'FSRS recall skill: when the word is next due. The review queue reads this.';
comment on column public.user_words.fsrs_last_review_at is 'FSRS recall skill: when the word was last reviewed; null if never.';
comment on column public.user_words.fsrs_recog_stability is 'FSRS recognition skill (quiz, match): days until recall probability falls to 90%.';
comment on column public.user_words.fsrs_recog_difficulty is 'FSRS recognition skill: how hard the word is for this learner, 1 to 10.';
comment on column public.user_words.fsrs_recog_elapsed_days is 'FSRS recognition skill: days between the last two reviews.';
comment on column public.user_words.fsrs_recog_scheduled_days is 'FSRS recognition skill: interval, in days, the last review scheduled.';
comment on column public.user_words.fsrs_recog_learning_steps is 'FSRS recognition skill: index into the short learning steps while state is 1 or 3.';
comment on column public.user_words.fsrs_recog_reps is 'FSRS recognition skill: number of reviews.';
comment on column public.user_words.fsrs_recog_lapses is 'FSRS recognition skill: number of times the word was forgotten after being learnt.';
comment on column public.user_words.fsrs_recog_state is 'FSRS recognition skill card state: 0 new, 1 learning, 2 review, 3 relearning.';
comment on column public.user_words.fsrs_recog_due_at is 'FSRS recognition skill: when the word is next due. Quiz and match order their pool by it.';
comment on column public.user_words.fsrs_recog_last_review_at is 'FSRS recognition skill: when the word was last reviewed; null if never.';

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20261005000160', 'user_words_recognition_skill')
on conflict (version) do nothing;
