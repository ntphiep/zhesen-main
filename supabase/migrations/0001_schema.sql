-- Content tables
create table public.languages (
  code text primary key check (code in ('zh','es','en')),
  name text not null,
  native_name text not null,
  script text not null check (script in ('han','latin'))
);
create table public.vocab_items (
  id text primary key,
  lang text not null references public.languages(code),
  term text not null,
  reading text,
  translation jsonb not null,
  part_of_speech text,
  level text,
  examples jsonb,
  audio text
);
create table public.lessons (
  id text primary key,
  lang text not null references public.languages(code),
  title text not null,
  description text not null default '',
  position int not null check (position > 0)
);
create table public.lesson_vocab (
  lesson_id text not null references public.lessons(id),
  vocab_id text not null references public.vocab_items(id),
  position int not null,
  primary key (lesson_id, vocab_id)
);
-- Progress tables
create table public.srs_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  vocab_id text not null references public.vocab_items(id),
  lang text not null,
  interval_days int not null default 0,
  ease real not null default 2.5,
  reps int not null default 0,
  lapses int not null default 0,
  due_at timestamptz not null,
  last_reviewed_at timestamptz,
  primary key (user_id, vocab_id)
);
create table public.lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null references public.lessons(id),
  status text not null check (status in ('not_started','in_progress','completed')),
  completed_at timestamptz,
  primary key (user_id, lesson_id)
);

-- RLS
alter table public.languages enable row level security;
alter table public.vocab_items enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_vocab enable row level security;
alter table public.srs_state enable row level security;
alter table public.lesson_progress enable row level security;

-- Content: readable by any authenticated user (incl. anonymous)
create policy "content_read_languages"   on public.languages    for select to authenticated using (true);
create policy "content_read_vocab"        on public.vocab_items  for select to authenticated using (true);
create policy "content_read_lessons"      on public.lessons      for select to authenticated using (true);
create policy "content_read_lesson_vocab" on public.lesson_vocab for select to authenticated using (true);

-- Progress: each user sees/writes only their own rows
create policy "srs_select" on public.srs_state for select to authenticated using (auth.uid() = user_id);
create policy "srs_insert" on public.srs_state for insert to authenticated with check (auth.uid() = user_id);
create policy "srs_update" on public.srs_state for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lp_select" on public.lesson_progress for select to authenticated using (auth.uid() = user_id);
create policy "lp_insert" on public.lesson_progress for insert to authenticated with check (auth.uid() = user_id);
create policy "lp_update" on public.lesson_progress for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
