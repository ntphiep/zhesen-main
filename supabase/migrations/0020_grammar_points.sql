-- Structured grammar points, replacing the unused lex.grammar_concepts table.
--
-- grammar_concepts (migration 0003) only modelled a verb's mood and tense, which is
-- enough for the Spanish conjugation tables and nothing else: it cannot hold a point
-- like "expressing a completed action with 了". That table is left in place (it holds
-- no rows) and this one becomes the real home for grammar content.
--
-- Sourcing note: the obvious third-party source, AllSet Learning's Chinese Grammar
-- Wiki, is CC BY-NC-SA 3.0 and its copyright page forbids use by any site carrying
-- advertising. Nothing from it is ingested. Vietnamese explanations are written for
-- this project and source_id records where each row came from.

create table if not exists lex.grammar_points (
  id text primary key,
  lang text not null references public.languages(code),
  level_scheme text check (level_scheme in ('HSK', 'CEFR')),
  level text,
  category_vi text,
  title_vi text not null,
  -- Formula shown above the examples, e.g. "Subject + 把 + Object + Verb + complement".
  pattern text not null,
  explanation_vi text not null,
  -- A mistake Vietnamese learners typically make with this point.
  common_mistake_vi text,
  sort_order int not null default 0,
  source_id text references lex.sources(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lex.grammar_examples (
  id bigint generated always as identity primary key,
  grammar_point_id text not null references lex.grammar_points(id) on delete cascade,
  text text not null,
  -- Pinyin for Chinese, null elsewhere.
  reading text,
  translation_vi text not null,
  sort_order int not null default 0
);

-- Lets an entry page link to the grammar points that use that word, so looking up 了
-- surfaces the 了 patterns.
create table if not exists lex.grammar_point_entries (
  grammar_point_id text not null references lex.grammar_points(id) on delete cascade,
  entry_id text not null references lex.entries(id) on delete cascade,
  primary key (grammar_point_id, entry_id)
);

create index if not exists idx_grammar_points_lang_level
  on lex.grammar_points (lang, level_scheme, level, sort_order);
create index if not exists idx_grammar_examples_point
  on lex.grammar_examples (grammar_point_id, sort_order);
create index if not exists idx_grammar_point_entries_entry
  on lex.grammar_point_entries (entry_id);

-- Readable by anon and authenticated, like every other content table in lex; writes
-- go through the service role, which bypasses RLS.
do $$
declare t text;
begin
  foreach t in array array['grammar_points', 'grammar_examples', 'grammar_point_entries']
  loop
    execute format('alter table lex.%I enable row level security;', t);
    execute format('drop policy if exists %I on lex.%I;', 'lex_' || t || '_select_auth', t);
    execute format(
      'create policy %I on lex.%I for select to authenticated using (true);',
      'lex_' || t || '_select_auth', t);
    execute format('drop policy if exists %I on lex.%I;', 'lex_' || t || '_select_anon', t);
    execute format(
      'create policy %I on lex.%I for select to anon using (true);',
      'lex_' || t || '_select_anon', t);
    execute format('grant select on lex.%I to anon, authenticated;', t);
    execute format('grant all on lex.%I to service_role;', t);
  end loop;
end $$;

grant usage, select on all sequences in schema lex to service_role;
