-- Qualify the trigram operator in lex.search, which 0039 fixed in lex.search_vi
-- and left here.
--
-- The fuzzy arm of the `cand` CTE matches a headword with a bare `%`:
--
--   and e.lang::text in ('en', 'es') and e.headword_normalized % q.q_norm
--
-- `%` lives in the `extensions` schema, so the function answers or raises
-- depending on the caller's search_path. Measured on production through the
-- Management API's read-only role:
--
--   select id, headword from lex.search('習', array['zh'], 8)
--   ERROR: 42883: operator does not exist: text % text
--   CONTEXT: SQL function "search" during inlining
--
-- The same call as `anon` returns 学习 and 习惯, because anon carries
-- `extensions` on its search_path. So this is not a live outage; it is the same
-- latent failure 0039 describes, in the function that serves every search.
--
-- Checked across the whole schema before writing this: of the eight functions in
-- `lex`, `search_vi` and `suggest` already qualify the operator and `search` was
-- the only one left with a bare occurrence.
--
-- `operator(extensions.%)` is the same operator with the same OID, so the planner
-- still drives idx_lex_entries_headword_trgm with it.
--
-- Applied as a text transform of the live definition, asserting the operator
-- occurs exactly once, rather than re-emitting the function by hand.
--
-- TO ROLL BACK: replace `operator(extensions.%)` with `%` in the same line.

do $mig$
declare
  def text;
  old_op text := $a$e.headword_normalized % q.q_norm$a$;
  new_op text := $a$e.headword_normalized operator(extensions.%) q.q_norm$a$;
  hits int;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'lex' and p.proname = 'search';
  if def is null then raise exception 'lex.search not found'; end if;

  hits := (length(def) - length(replace(def, old_op, ''))) / length(old_op);
  if hits <> 1 then raise exception 'expected 1 bare trigram operator, found %', hits; end if;

  def := replace(def, old_op, new_op);
  execute def;
end
$mig$;

grant execute on function lex.search(text, text[], int) to anon, authenticated, service_role;
