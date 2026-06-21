-- Spaced-repetition scheduling for the personal wordlist (Sổ tay). Columns mirror
-- the SrsState used by the SM-2 algorithm in lib/progress/srs.ts, which the wordlist
-- review reuses. Existing rows become due immediately (srs_due_at defaults to now()),
-- so the first review session covers every saved word. Existing user_words RLS
-- (own-rows select/update) already governs these columns.
alter table public.user_words
  add column if not exists srs_interval_days int not null default 0,
  add column if not exists srs_ease real not null default 2.5,
  add column if not exists srs_reps int not null default 0,
  add column if not exists srs_lapses int not null default 0,
  add column if not exists srs_due_at timestamptz not null default now(),
  add column if not exists srs_last_reviewed_at timestamptz;

create index if not exists user_words_user_due_idx on public.user_words (user_id, srs_due_at);
