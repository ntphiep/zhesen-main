-- 0041_label_zhesen_objects.sql
-- Say, in the database itself, which objects belong to this project.
--
-- The schema picker in the Supabase dashboard lists twelve schemas and gives no
-- hint which ones the project owns. Eleven of them ship with the platform or an
-- extension: auth, storage, realtime, vault, graphql, graphql_public,
-- extensions, pgbouncer, supabase_migrations, pgroonga, and public itself.
-- zhesen owns exactly one schema, lex, plus four tables inside public.
--
-- Renaming was the other option and is rejected: lex is named in every
-- migration, in .schema('lex') on the client, and in eight SECURITY DEFINER
-- functions the app calls by name. A rename buys a longer name and costs a
-- coordinated change across two repositories.
--
-- A comment is what the dashboard already renders next to a schema or table, so
-- this is the cheapest way to make ownership visible where the question gets
-- asked.
comment on schema lex is
  'zhesen: dictionary content. Loaded by zhesen-pipeline, read by the app through the SECURITY DEFINER functions in this schema. Read-only for anon and authenticated.';

comment on table public.user_words is
  'zhesen: one saved word per row, owned by a user. Carries the FSRS schedule in the fsrs_* columns. RLS scopes every statement to auth.uid().';
comment on table public.review_log is
  'zhesen: one row per user per day on which that user reviewed anything. Feeds the activity strip in the wordlist.';
comment on table public.profiles is
  'zhesen: per-account role and display name, created by the handle_new_user trigger on auth.users.';
comment on table public.languages is
  'zhesen: the three languages the project supports. Exists to be the target of the lang foreign keys on lex.entries and lex.grammar_points; the app reads its own copy from lib/languages.ts.';
