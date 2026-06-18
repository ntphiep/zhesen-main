-- Phase 3b: expose the lex schema to the Data API (PostgREST) and grant role
-- privileges, so the pipeline (service_role via supabase-py) can write and the
-- app (authenticated) can later read. RLS still governs row access for anon/auth.
grant usage on schema lex to anon, authenticated, service_role;
grant select on all tables in schema lex to anon, authenticated;
grant all on all tables in schema lex to service_role;
grant all on all sequences in schema lex to service_role;
grant usage, select on all sequences in schema lex to anon, authenticated;
alter default privileges in schema lex grant select on tables to anon, authenticated;
alter default privileges in schema lex grant all on tables to service_role;

-- expose lex to PostgREST
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, lex';
notify pgrst, 'reload config';
