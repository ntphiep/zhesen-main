-- Per-level word counts for the "/learn/[lang]" browse-by-level UI. A GROUP BY
-- aggregate can't be expressed through supabase-js's PostgREST filter builder (no
-- .group()), and fetching every row client-side to count them would run into the
-- project's PostgREST max-rows cap (confirmed at 1000 by querying lex.entries
-- directly: requesting .range(0, 20000) for lang='en' returned count=20000 but
-- only 1000 rows), silently under-reporting rarer levels. This function is
-- additive-only: no existing table, column, or row is touched.

create or replace function lex.count_entries_by_level(p_lang text)
returns table (level text, level_is_estimated boolean, cnt bigint)
language sql
stable
as $$
  select e.level, bool_and(e.level_is_estimated), count(*)
  from lex.entries e
  where e.lang::text = p_lang and e.level is not null
  group by e.level
  order by e.level;
$$;

grant execute on function lex.count_entries_by_level(text) to anon, authenticated, service_role;
