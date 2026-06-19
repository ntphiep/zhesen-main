-- 0006_user_words.sql
-- Personal wordlist (user-owned) + anon read policies for public dictionary/content.

-- 1) Personal wordlist
create table if not exists public.user_words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lang text not null check (lang in ('en','es','zh')),
  entry_id text references lex.entries(id) on delete set null,
  headword text not null,
  reading text,
  ipa text,
  pos text,
  meaning_vi text,
  meaning_en text,
  level text,
  example text,
  example_translation text,
  audio_url text,
  notes text,
  status text not null default 'new' check (status in ('new','learning','known')),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_words_user_created_idx on public.user_words (user_id, created_at desc);
create index if not exists user_words_user_lang_idx on public.user_words (user_id, lang);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_words_set_updated_at on public.user_words;
create trigger user_words_set_updated_at
  before update on public.user_words
  for each row execute function public.set_updated_at();

-- RLS: own rows only
alter table public.user_words enable row level security;

create policy user_words_select_own on public.user_words
  for select to authenticated using (user_id = auth.uid());
create policy user_words_insert_own on public.user_words
  for insert to authenticated with check (user_id = auth.uid());
create policy user_words_update_own on public.user_words
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_words_delete_own on public.user_words
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.user_words to authenticated;

-- 2) anon SELECT policies for public dictionary/content (cookieless cached reads)
create policy lex_entries_select_anon        on lex.entries        for select to anon using (true);
create policy lex_senses_select_anon         on lex.senses         for select to anon using (true);
create policy lex_pronunciations_select_anon on lex.pronunciations for select to anon using (true);
create policy lex_examples_select_anon       on lex.examples       for select to anon using (true);
create policy lex_relations_select_anon      on lex.lex_relations  for select to anon using (true);

create policy content_read_languages_anon    on public.languages    for select to anon using (true);
create policy content_read_lessons_anon      on public.lessons      for select to anon using (true);
create policy content_read_lesson_vocab_anon on public.lesson_vocab for select to anon using (true);
create policy content_read_vocab_anon        on public.vocab_items  for select to anon using (true);

-- 3) search index for dictionary "add word"
create index if not exists lex_entries_lang_headword_idx on lex.entries (lang, headword_normalized);
