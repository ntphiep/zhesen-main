-- 0059_admin_account_actions.sql
-- Deleting an account and merging one account's saved words into another, from /admin/users.
--
-- Both refuse with a short reason in the message, which lib/admin/users.ts turns into
-- Vietnamese; errcode 22023 (invalid_parameter_value) marks a refusal as opposed to a fault.
--
-- Deletion removes the auth.users row and lets the foreign keys do the rest: user_words,
-- review_log and profiles are all `on delete cascade` (0006, 0011, 0032), as are GoTrue's
-- own identities and sessions. The only way back is the nightly dump, so the caller must
-- type the account's email, or its id for an anonymous account, and an admin account is
-- never deleted from here.
--
-- A merge moves every saved word the target does not already hold. A word both accounts
-- saved stays with the source, because `user_words_user_entry_key` (0031) allows one row
-- per account and entry and the target's own review history is the one to keep. A custom
-- word (no entry_id) always moves: lib/wordlist/store.ts never treats two as duplicates.
-- The moved rows keep their updated_at, which admin.users reads as last activity. Practice
-- days are unioned. The source account is left in place, emptied of what moved, so a
-- mistaken merge loses nothing and the source can be deleted afterwards as its own step.
--
-- reviewed-destructive: Harry Nguyen. `admin.delete_account` deletes one auth.users row
-- per call, behind the admin gate and a typed confirmation, and writes an audit row first.
-- Nothing in this file runs a delete when the migration is applied.

create or replace function admin.delete_account(p_user uuid, p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = admin, public
as $$
declare
  v_email text;
  v_role text;
  v_words bigint;
begin
  perform admin.assert_admin();

  select nullif(u.email, ''), coalesce(p.role, 'learner')
    into v_email, v_role
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = p_user;
  if not found then
    raise exception 'no_such_account' using errcode = '22023';
  end if;
  if v_role = 'admin' then
    raise exception 'admin_account' using errcode = '22023';
  end if;
  if lower(btrim(coalesce(p_confirm, ''))) <> lower(coalesce(v_email, p_user::text)) then
    raise exception 'confirm_mismatch' using errcode = '22023';
  end if;

  select count(*) into v_words from public.user_words where user_id = p_user;
  perform admin.audit('delete_account', p_user::text,
    jsonb_build_object('email', v_email, 'words', v_words));
  delete from auth.users where id = p_user;

  return jsonb_build_object('deleted', p_user, 'words', v_words);
end;
$$;

revoke all on function admin.delete_account(uuid, text) from public;
grant execute on function admin.delete_account(uuid, text) to authenticated;

create or replace function admin.merge_account(p_from uuid, p_into uuid)
returns jsonb
language plpgsql
security definer
set search_path = admin, public
as $$
declare
  v_moved bigint;
  v_kept bigint;
  v_days bigint;
begin
  perform admin.assert_admin();

  if p_from = p_into then
    raise exception 'same_account' using errcode = '22023';
  end if;
  if (select count(*) from auth.users where id in (p_from, p_into)) <> 2 then
    raise exception 'no_such_account' using errcode = '22023';
  end if;

  -- Transaction-scoped: the lock and the disabled trigger end with this call.
  alter table public.user_words disable trigger user_words_set_updated_at;
  update public.user_words w
     set user_id = p_into
   where w.user_id = p_from
     and (w.entry_id is null or not exists (
       select 1 from public.user_words t
       where t.user_id = p_into and t.entry_id = w.entry_id
     ));
  get diagnostics v_moved = row_count;
  alter table public.user_words enable trigger user_words_set_updated_at;

  select count(*) into v_kept from public.user_words where user_id = p_from;

  insert into public.review_log (user_id, day)
  select p_into, l.day from public.review_log l where l.user_id = p_from
  on conflict (user_id, day) do nothing;
  get diagnostics v_days = row_count;

  perform admin.audit('merge_account', p_into::text, jsonb_build_object(
    'from', p_from, 'into', p_into, 'moved', v_moved, 'kept', v_kept, 'days', v_days));

  return jsonb_build_object('moved', v_moved, 'kept', v_kept, 'days', v_days);
end;
$$;

revoke all on function admin.merge_account(uuid, uuid) from public;
grant execute on function admin.merge_account(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20260923000004', 'admin_account_actions')
on conflict (version) do nothing;
