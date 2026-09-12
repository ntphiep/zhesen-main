-- Drop the lesson POC and two abandoned probe tables.
--
-- `public.vocab_items`, `lessons`, `lesson_vocab`, `srs_state` and
-- `lesson_progress` came from the first prototype: fifteen hard-coded words in
-- three lessons, with their own spaced-repetition table. The dictionary replaced
-- all of it. `lib/progress/ProgressStore.ts` and `SupabaseProgressStore.ts` were
-- the last readers and were removed on 2026-09-12; nothing in `app/`,
-- `components/`, `lib/` or `test/` names these tables any more.
--
-- `lex.enrichment`, `lex.grammar_concepts` and `lex.grammar_points_probe` are
-- empty tables left over from pipeline experiments. The grammar feature reads
-- `lex.grammar_points`, which stays.
--
-- `public.languages` STAYS, even though it looked equally dead. `lex.entries`
-- (36k rows) and `lex.grammar_points` both carry a foreign key to it, so it is
-- what keeps `lang` to exactly zh/es/en. Dropping it would mean dropping a live
-- integrity constraint to save 32 kB.
--
-- The seed rows are reproducible from 0001 and 0002. The only rows that are not
-- are six belonging to anonymous test user 89d92177-55cd-405c-9c64-2d2ee5b6ad2d,
-- recorded here so the drop loses nothing that was not written down:
--   lesson_progress: (zh-l1, completed, 2026-06-17T16:33:59.832Z)
--   srs_state: zh-1 reps=1 interval=1d due 2026-06-18T16:35:18.587Z;
--              zh-2..zh-5 reps=0 interval=0 due 2026-06-17T16:33:59.832Z

drop table if exists public.lesson_progress;
drop table if exists public.lesson_vocab;
drop table if exists public.lessons;
drop table if exists public.srs_state;
drop table if exists public.vocab_items;

drop table if exists lex.enrichment;
drop table if exists lex.grammar_concepts;
drop table if exists lex.grammar_points_probe;
