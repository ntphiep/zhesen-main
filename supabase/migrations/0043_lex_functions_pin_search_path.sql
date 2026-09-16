-- Pin search_path on every function in lex, which is what the five functions in
-- public have done since 0032_profiles_and_roles.
--
-- 0034, 0039 and 0042 each qualified one operator that had been left bare, and
-- each time the next call failed on the next bare operator. After 0042 qualified
-- `%` in lex.search, the same call failed again:
--
--   select headword from lex.search('習', array['zh'], 8)
--   ERROR: 42883: operator does not exist: text &@ text
--
-- Chasing operators one at a time does not converge. `%`, `&@`, `&@~` and every
-- other operator these functions use lives in `extensions`, so whether a function
-- answers or raises depends on the search_path of whoever called it. `anon` and
-- `authenticated` happen to carry `extensions`, which is why the application has
-- never seen this; a role that does not, such as the Management API's
-- supabase_read_only_user, cannot run lex.search at all.
--
-- Pinning search_path on the function fixes every operator in every arm at once,
-- including arms nobody has added yet, and makes the function resolve names the
-- same way no matter who calls it. Supabase's own database linter asks for this
-- under "Function Search Path Mutable":
-- https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
--
-- `lex` comes first so an unqualified relation means this schema; `extensions`
-- carries pg_trgm, unaccent and pgroonga; `public` keeps anything that resolved
-- there before resolving there still. pg_catalog is searched first regardless.
--
-- The loop reads the signatures from pg_proc rather than spelling out eight of
-- them, and asserts it touched all eight.
--
-- TO ROLL BACK: `alter function ... reset search_path` for each.

do $mig$
declare
  fn record;
  n int := 0;
begin
  for fn in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    where p.pronamespace = 'lex'::regnamespace
      and p.prokind = 'f'
  loop
    execute format('alter function %s set search_path = lex, extensions, public', fn.sig);
    n := n + 1;
  end loop;
  if n <> 8 then raise exception 'expected 8 functions in lex, altered %', n; end if;
end
$mig$;
