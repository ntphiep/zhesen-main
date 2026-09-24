-- 0064_admin_record_action.sql
-- The audit row for an action that runs outside the database: an EC2 start or stop, a
-- container restart, a backup, a SQL or shell command sent through SSM. The route writes
-- it before it acts, so a failed or cut-off action is still on record.
--
-- admin.audit stays ungranted (0058). This wrapper checks the caller first and accepts
-- only the infra.* and console.* actions, so it cannot forge a row that looks like one
-- of the database's own account or content actions.
--
-- TO ROLL BACK: `drop function admin.record(text, text, jsonb);`.

create or replace function admin.record(p_action text, p_target text, p_detail jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, admin, public
as $$
begin
  perform admin.assert_admin();
  if p_action !~ '^(infra|console)\.[a-z_.]+$' then
    raise exception 'unknown_action' using errcode = '22023';
  end if;
  perform admin.audit(p_action, p_target, p_detail);
end;
$$;

revoke all on function admin.record(text, text, jsonb) from public;
grant execute on function admin.record(text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20260925000004', 'admin_record_action')
on conflict (version) do nothing;
