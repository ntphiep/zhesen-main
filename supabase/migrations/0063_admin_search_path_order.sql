-- 0063_admin_search_path_order.sql
-- 0061 and 0062 listed pg_catalog last in search_path, so an object named like a catalog
-- function in admin, lex or public would win over it inside a SECURITY DEFINER body.
-- Measured 2026-09-25: anon, authenticated, authenticator and service_role hold CREATE on
-- none of admin, lex, public or extensions, so no role can plant one today. Put
-- pg_catalog first anyway, where Postgres puts it when it is not listed.
--
-- Also corrects the schema comment: admin.audit does not call assert_admin(); it is not
-- granted to anyone and runs only inside functions that already did (0058).
--
-- TO ROLL BACK: replay the `set search_path` lines of 0061 and 0062.

alter function admin.dictionary() set search_path = pg_catalog, admin, lex, public;
alter function admin.live() set search_path = pg_catalog, admin, public, extensions;
alter function admin.slow_queries(int) set search_path = pg_catalog, admin, public, extensions;

comment on schema admin is
  'zhesen: the admin console. Every function granted to authenticated is SECURITY DEFINER and calls admin.assert_admin() first; admin.audit is granted to no one and runs only inside those.';

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20260925000003', 'admin_search_path_order')
on conflict (version) do nothing;
