-- 0075_admin_record_secret_actions.sql
-- /admin/secrets writes secret.reveal and secret.update before it reads or changes a key.
-- admin.record accepted only infra.* and console.*, so it raised 22023 unknown_action and
-- every reveal and edit stopped at "Could not write the audit log". secret.* joins them.
--
-- TO ROLL BACK: re-run the function from 0064_admin_record_action.sql.

create or replace function admin.record(p_action text, p_target text, p_detail jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, admin, public
as $$
begin
  perform admin.assert_admin();
  if p_action !~ '^(infra|console|secret)\.[a-z_.]+$' then
    raise exception 'unknown_action' using errcode = '22023';
  end if;
  perform admin.audit(p_action, p_target, p_detail);
end;
$$;

revoke all on function admin.record(text, text, jsonb) from public;
grant execute on function admin.record(text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20260927000001', 'admin_record_secret_actions')
on conflict (version) do nothing;
