-- Removes the temporary write path 0053 created, once the import has finished.
--
-- 0053 grants `lex.import_gloss_vi` to anon so a local script can fill the Vietnamese
-- glosses. That grant is the only thing in this project that lets the public key write to
-- the dictionary, so it does not outlive the import. Applied in the same session as 0053.
--
-- reviewed-destructive: Harry Nguyen. The table holds one throwaway token and the function
-- is the import's write path; both exist only for the duration of the import, and 0053
-- documents how to recreate them for a later batch. Nothing reads either one.

revoke execute on function lex.import_gloss_vi(text, jsonb) from anon, authenticated;
drop function if exists lex.import_gloss_vi(text, jsonb);
drop table if exists lex.import_token;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260922000002', 'drop_import_gloss_vi_helper')
on conflict (version) do nothing;
