-- 0032_profiles_and_roles.sql
-- A profile row per account, and the role the app authorises against.
--
-- Until now an account was only `auth.users`, which the app cannot read from the
-- browser and cannot extend. Anything the product needs to know about a person --
-- what to call them, and what they are allowed to do -- had nowhere to live, so
-- "who is this" and "may they do this" were the same question: signed in or not.
--
-- The role is deliberately NOT a column the account owner can write. RLS lets a
-- learner change their display name and nothing else; the update policy compares
-- the incoming role against the stored one, so a hand-written PATCH that sets
-- role='admin' is refused by the database rather than by a client-side check.
-- A role is granted with the service key or from the SQL editor, on purpose.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'learner' check (role in ('learner', 'admin')),
  display_name text check (display_name is null or length(btrim(display_name)) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Every account gets a row, including the anonymous ones `ensureSession` mints on
-- the first saved word: an anonymous learner who later attaches an email keeps the
-- same user id, so the profile created here follows them across that upgrade
-- instead of appearing from nowhere afterwards.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts that existed before this migration.
insert into public.profiles (id)
select u.id from auth.users u
on conflict (id) do nothing;

-- Reading `profiles` from inside a policy ON `profiles` re-enters the policy and
-- Postgres refuses it as infinite recursion (42P17). Both lookups below therefore
-- run as the definer, which skips RLS. `stable` lets the planner call them once
-- per statement rather than once per row.
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() = 'admin', false);
$$;

revoke all on function public.current_profile_role() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

-- No insert policy: the trigger above owns creation, and it runs as definer.
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_profile_role());

grant select, update on public.profiles to authenticated;
