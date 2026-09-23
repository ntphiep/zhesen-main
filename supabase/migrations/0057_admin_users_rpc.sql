-- 0057_admin_users_rpc.sql
-- Every account with its kind, role, saved words and last activity, for /admin/users.
--
-- `auth.users` is not exposed through PostgREST and RLS on user_words shows each learner
-- only their own rows, so this is the one way the app reads across accounts. One jsonb
-- value rather than a set of rows, so PostgREST's 1,000-row cap never truncates it.
--
-- An account is permanent when it carries an email, the same rule as `accountKind` in
-- lib/auth/account.ts. Last activity is the latest of the last sign-in, the last change to
-- a saved word and the last practice day; `greatest` ignores the nulls.

create or replace function admin.users()
returns jsonb
language plpgsql
stable
security definer
set search_path = admin, public
as $$
begin
  perform admin.assert_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', u.id,
      'email', nullif(u.email, ''),
      'role', coalesce(p.role, 'learner'),
      'display_name', p.display_name,
      'created_at', u.created_at,
      'words', coalesce(w.n, 0),
      'last_active_at', greatest(u.last_sign_in_at, w.last_at, rl.last_day::timestamptz)
    ) order by u.created_at)
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join lateral (
      select count(*) as n, max(x.updated_at) as last_at
      from public.user_words x where x.user_id = u.id
    ) w on true
    left join lateral (
      select max(l.day) as last_day from public.review_log l where l.user_id = u.id
    ) rl on true
  ), '[]'::jsonb);
end;
$$;

revoke all on function admin.users() from public;
grant execute on function admin.users() to authenticated;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20260923000002', 'admin_users_rpc')
on conflict (version) do nothing;
