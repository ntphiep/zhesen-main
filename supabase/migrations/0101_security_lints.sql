-- 0101_security_lints.sql
-- Supabase splinter lints found on production on 2026-10-03:
-- * lex.gloss_terms_reload and lex.form_of_reload write lex tables and were executable by
--   anon and authenticated over /rest/v1/rpc. The lex grants stop the write, but nothing
--   outside the triggers and the batch jobs (superuser or owner) calls them.
-- * public.set_updated_at had no pinned search_path (0011_function_search_path_mutable).
-- * Ten policies evaluated auth.uid() or is_admin() once per row (0003_auth_rls_initplan).
-- * admin.entry_flags sat in an exposed schema with RLS off (0013). Its writer,
--   admin.flag_entry, is security definer and owned by postgres, which owns the table.

set lock_timeout = '5s';

revoke execute on function lex.gloss_terms_reload(text[]) from public, anon, authenticated;
revoke execute on function lex.form_of_reload(text[]) from public, anon, authenticated;
revoke execute on function lex.gloss_terms_sync() from public, anon, authenticated;
revoke execute on function lex.form_of_sync() from public, anon, authenticated;
grant execute on function lex.gloss_terms_reload(text[]) to service_role;
grant execute on function lex.form_of_reload(text[]) to service_role;

alter function public.set_updated_at() set search_path = pg_catalog, public;

alter policy user_words_select_own on public.user_words using (user_id = (select auth.uid()));
alter policy user_words_insert_own on public.user_words with check (user_id = (select auth.uid()));
alter policy user_words_update_own on public.user_words
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy user_words_delete_own on public.user_words using (user_id = (select auth.uid()));
alter policy review_log_select_own on public.review_log using (user_id = (select auth.uid()));
alter policy review_log_insert_own on public.review_log with check (user_id = (select auth.uid()));
alter policy profiles_select_own on public.profiles
  using (id = (select auth.uid()) or (select public.is_admin()));
alter policy profiles_update_own on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and role = (select public.current_profile_role()));
alter policy admin_audit_select on public.admin_audit using ((select public.is_admin()));
alter policy learner_entries_select_auth on lex.learner_entries
  using (status = 'published' or (select public.is_admin()));

alter table admin.entry_flags enable row level security;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261004000101', 'security_lints')
on conflict (version) do nothing;
