-- 0017_fsrs.sql
-- Migrate the wordlist's spaced-repetition scheduler from the hand-rolled SM-2 in
-- lib/progress/srs.ts (see 0010_user_words_srs.sql) to FSRS via the `ts-fsrs`
-- library, pinned exactly to the latest stable release "5.4.2" (not the 6.0.0-beta
-- prerelease line -- see git history of this file for an earlier, reverted attempt
-- that used the beta). Despite the "5.x" version number, 5.4.2's default weights
-- already implement the FSRS-6 algorithm: confirmed at runtime via its own
-- `FSRSVersion` string, "v5.4.2 using FSRS-6.0", and by its 21-weight default
-- parameter vector (FSRS-6 has 21 weights; FSRS-5 has 19) with decay 0.1542
-- (`FSRS6_DEFAULT_DECAY`, vs. `FSRS5_DEFAULT_DECAY` = 0.5). The 6.0.0-beta line is
-- an internal architecture rewrite, not a newer algorithm.
--
-- Columns mirror ts-fsrs's `Card` model (confirmed from its shipped type
-- declarations for this exact version): stability, difficulty, elapsed_days,
-- scheduled_days, learning_steps, reps, lapses, state, due, last_review.
--
-- Additive only: the old srs_* columns from 0010 are left untouched (not dropped,
-- not kept in sync going forward) so the app can roll back to SM-2 if needed --
-- their values will simply be stale as of this migration.
--
-- RLS and grants need no changes: public.user_words' RLS policies scope by
-- user_id at the row level (see 0006_user_words.sql), and its
-- `grant ... to authenticated` is table-level -- both already cover new columns.
alter table public.user_words
  add column if not exists fsrs_stability real not null default 0,
  add column if not exists fsrs_difficulty real not null default 0,
  add column if not exists fsrs_elapsed_days int not null default 0,
  add column if not exists fsrs_scheduled_days int not null default 0,
  add column if not exists fsrs_learning_steps int not null default 0,
  add column if not exists fsrs_reps int not null default 0,
  add column if not exists fsrs_lapses int not null default 0,
  add column if not exists fsrs_state smallint not null default 0 check (fsrs_state between 0 and 3),
  add column if not exists fsrs_due_at timestamptz not null default now(),
  add column if not exists fsrs_last_review_at timestamptz;

create index if not exists user_words_user_fsrs_due_idx on public.user_words (user_id, fsrs_due_at);

-- Backfill from the old SM-2 columns. Both updates are pure functions of the
-- untouched srs_* columns, so re-running this file is idempotent.

-- Cards never reviewed (srs_reps = 0 and srs_last_reviewed_at is null) become a
-- fresh FSRS card, matching ts-fsrs's createEmptyCard(): stability/difficulty/
-- elapsed_days 0, state = New (0). srs_due_at for such a row is already "now"
-- (0010's default), the same value createEmptyCard() would set, so it is
-- preserved as-is.
update public.user_words
set
  fsrs_stability = 0,
  fsrs_difficulty = 0,
  fsrs_elapsed_days = 0,
  fsrs_scheduled_days = 0,
  fsrs_learning_steps = 0,
  fsrs_reps = 0,
  fsrs_lapses = 0,
  fsrs_state = 0,
  fsrs_due_at = srs_due_at,
  fsrs_last_review_at = null
-- Guard: chi seed khi cot FSRS chua tung duoc ghi. Cac cot srs_* cu bi dong bang
-- ke tu khi app chuyen sang FSRS, nen neu thieu dieu kien nay, viec chay lai
-- migration se ghi de tien do FSRS that bang gia tri suy tu du lieu cu.
where srs_reps = 0 and srs_last_reviewed_at is null
  and fsrs_reps = 0 and fsrs_last_review_at is null;

-- Cards with SM-2 review history: SM-2 and FSRS are different memory models, so
-- there is no exact conversion formula (in particular, nothing turns an SM-2 ease
-- factor into an FSRS difficulty). This is a best-effort seed that keeps what SM-2
-- already scheduled (due_at, last_reviewed_at, reps, lapses) and approximates the
-- FSRS-only numbers:
--   - stability ("days until ~90% recall") from the SM-2 interval, which SM-2 had
--     already tuned toward roughly that same target;
--   - difficulty (FSRS's 1..10 scale, harder = higher) from the SM-2 ease factor
--     (1.3..2.5+, harder = lower) via a simple inverse-linear map anchored at
--     ease 2.5 -> difficulty 5, matching FSRS-6's own default init difficulty for
--     a "good" first review;
--   - elapsed_days (days since the *previous* review, as observed at the last
--     review event) has no SM-2 equivalent for a row with a single review (there
--     was no previous review -- ts-fsrs itself sets elapsed_days to 0 on a card's
--     first review, see the never-reviewed branch above), so rows with exactly one
--     SM-2 rep get 0; for rows with more than one rep this uses the SM-2 interval
--     as the same kind of approximation as stability above.
-- A card that lapsed and has not yet been re-reviewed (lapses > 0, interval reset
-- to 0) is seeded into FSRS's Relearning state (3); everything else lands in
-- Review (2), since by definition these rows have at least one completed review.
update public.user_words
set
  fsrs_stability = greatest(srs_interval_days, 1)::real,
  fsrs_difficulty = greatest(1, least(10, (2.5 - srs_ease) * 10 + 5))::real,
  fsrs_elapsed_days = case when srs_reps <= 1 then 0 else srs_interval_days end,
  fsrs_scheduled_days = srs_interval_days,
  fsrs_learning_steps = 0,
  fsrs_reps = srs_reps,
  fsrs_lapses = srs_lapses,
  fsrs_state = case when srs_lapses > 0 and srs_interval_days = 0 then 3 else 2 end,
  fsrs_due_at = srs_due_at,
  fsrs_last_review_at = srs_last_reviewed_at
-- Cung mot guard nhu tren: khong seed de len tien do FSRS da co that.
where not (srs_reps = 0 and srs_last_reviewed_at is null)
  and fsrs_reps = 0 and fsrs_last_review_at is null;
