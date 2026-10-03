-- 0105_drop_common_words_rpc.sql
-- lex.common_words (0097) has no caller: getCommonWords (lib/dictionary/search.ts) asks
-- PostgREST for the ranked ids first and then for the embeds of those rows, which reads the
-- same 2,315 buffers and keeps the filters in the application.

set lock_timeout = '5s';

drop function if exists lex.common_words(text, integer, integer);

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20261004000105', 'drop_common_words_rpc')
on conflict (version) do nothing;
