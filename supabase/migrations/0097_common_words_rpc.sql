-- 0097_common_words_rpc.sql
-- The common-words strip on /dictionary asked PostgREST for 60 rows at offset 300, and
-- PostgREST built the sense, pronunciation and learner embeds for all 360 rows before the
-- offset discarded 300: 10,607 buffers per language, mean 983 ms, max 2,996 ms, and 58 of
-- the 69 PostgREST statement timeouts logged from 2026-09-28 to 2026-10-03. Ranking the ids
-- here first reads 2,315 buffers for the same page. The SET clause keeps the function from
-- being inlined, so the embeds run on its rows only.

set lock_timeout = '5s';

create or replace function lex.common_words(p_lang text, p_offset integer default 0, p_limit integer default 24)
returns setof lex.entries
language sql
stable
set search_path = lex, extensions, public
as $$
  select e.*
  from lex.entries e
  where e.lang = p_lang
    and e.level is not null
    and e.form_of is null
    -- Single letters carry a level outside Chinese (en m, b, r; es p, q, x).
    and (p_lang = 'zh' or e.headword not like '_')
  order by e.frequency_rank asc nulls last, e.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 0), 0), 200);
$$;

grant execute on function lex.common_words(text, integer, integer) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20261004000097', 'common_words_rpc')
on conflict (version) do nothing;
