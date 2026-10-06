-- 0196_review_events_new_modes.sql
-- Five practice modes join the six of 0161, each logging its answers like the others:
-- cloze (type the word missing from a sentence), ipa (type the word an IPA spells), listen
-- (hear the word, pick its meaning), forms (type another form of the word) and phrase (pick
-- the word missing from a saved phrase). lib/practice/grading.ts MODE_SKILL says which skill
-- each grades.
--
-- TO ROLL BACK: put back the check of 0161, once no row holds a new mode.

set lock_timeout = '5s';

alter table public.review_events drop constraint if exists review_events_mode_check;
alter table public.review_events add constraint review_events_mode_check
  check (mode in ('review', 'quiz', 'write', 'dictation', 'match', 'speak', 'cloze', 'ipa', 'listen', 'forms', 'phrase'));

insert into supabase_migrations.schema_migrations (version, name)
values ('20261006000196', 'review_events_new_modes')
on conflict (version) do nothing;
