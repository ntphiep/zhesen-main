-- 0040_drop_legacy_srs_columns.sql
-- Remove the SM-2 columns that 0010_user_words_srs.sql created and
-- 0017_fsrs.sql superseded.
--
-- 0017 deliberately left them in place so the app could roll back to SM-2. That
-- rollback never happened and cannot happen now: every practice mode grades
-- through lib/practice/grading.ts into lib/wordlist/review.ts, which reads and
-- writes only the fsrs_* columns (CARD_SELECT, lib/wordlist/review.ts:47). No
-- application code mentions srs_ at all, and neither does the loader in
-- zhesen-pipeline.
--
-- Leaving them is not free. 0017's own header calls the values stale, and its
-- backfill reads them; a future migration that filters on srs_* would see frozen
-- data and could overwrite real review progress. That has already happened once
-- in this repo's history, which is why .claude/rules/database.md carries a rule
-- about idempotence against the target state.
--
-- Verified before writing this file, against production:
--   - No function, view or trigger references srs_ (pg_get_functiondef and
--     pg_views scanned; zero rows).
--   - The only dependent object is the index user_words_user_due_idx on
--     (user_id, srs_due_at), which reports idx_scan = 0 in pg_stat_user_indexes
--     and is dropped with the column it covers.
--   - No constraint on public.user_words mentions srs_ (pg_constraint listed).
--   - All 416 rows already carry fsrs_due_at, so nothing depends on srs_due_at
--     to know when a card is next due.
--
-- reviewed-destructive: the columns hold a frozen copy of review state that
-- 0017 already migrated into the fsrs_* columns, and nothing reads them. The
-- drop is irreversible; the live schedule in fsrs_* is untouched.
alter table public.user_words
  drop column if exists srs_interval_days,
  drop column if exists srs_ease,
  drop column if exists srs_reps,
  drop column if exists srs_lapses,
  drop column if exists srs_due_at,
  drop column if exists srs_last_reviewed_at;
