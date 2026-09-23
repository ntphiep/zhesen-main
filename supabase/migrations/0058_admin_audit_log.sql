-- 0058_admin_audit_log.sql
-- A record of every admin write: who, when, what, and the values before and after.
--
-- An admin reads it through RLS; nobody writes it except `admin.audit`, which only the
-- other admin functions call. `actor` and `target` carry no foreign key on purpose: the
-- row must outlive the account it names, and deleting an account is one of the actions
-- it records.
--
-- postgres's default privileges in public hand anon and authenticated every privilege on a
-- new table, TRUNCATE included, which RLS does not govern. They are taken back here.

create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  target text,
  detail jsonb not null default '{}'::jsonb
);

create index if not exists admin_audit_at_idx on public.admin_audit (at desc);

alter table public.admin_audit enable row level security;

revoke all on public.admin_audit from anon, authenticated;
grant select on public.admin_audit to authenticated;

drop policy if exists admin_audit_select on public.admin_audit;
create policy admin_audit_select on public.admin_audit
  for select to authenticated using (public.is_admin());

create or replace function admin.audit(p_action text, p_target text, p_detail jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.admin_audit (actor, action, target, detail)
  values (auth.uid(), p_action, p_target, coalesce(p_detail, '{}'::jsonb));
$$;

-- Not granted to authenticated: a learner, or an admin calling it directly, could
-- otherwise write a record of something that never happened.
revoke all on function admin.audit(text, text, jsonb) from public;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260923000003', 'admin_audit_log')
on conflict (version) do nothing;
