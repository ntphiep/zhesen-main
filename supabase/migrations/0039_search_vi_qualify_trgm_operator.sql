-- Qualify the trigram operator in lex.search_vi so it does not depend on search_path.
--
-- The long branch matches a gloss with a bare `%`:
--
--   or s.gloss_vi_normalized % (select q_norm from q)
--
-- `%` lives in the `extensions` schema. A role without `extensions` in its
-- search_path cannot see it, and the function raises instead of answering. Measured
-- on production through the Management API's read-only role:
--
--   select count(*) from lex.search_vi('con cho', array['en','es','zh'], 10)
--   ERROR: 42883: operator does not exist: text % text
--   CONTEXT: PL/pgSQL function lex.search_vi(text,text[],integer) line 132
--
-- The same query on the short branch ('an', under four characters) succeeds,
-- because that branch never reaches the operator. `anon` and `authenticated` do
-- carry `extensions`, which is why the application never saw this; the failure is
-- one role change or one `set search_path` away from being a production outage,
-- and reverse lookup is the feature that stops working.
--
-- `operator(extensions.%)` is the same operator with the same OID, so the planner
-- still drives idx_lex_senses_gloss_vi_trgm with it. This is the form
-- 0034_suggest_uses_trigram_index.sql already adopted for the same reason.
--
-- Applied as a text transform of the live definition, asserting the operator occurs
-- exactly once, rather than re-emitting 265 lines by hand.
--
-- TO ROLL BACK: replace `operator(extensions.%)` with `%` in the same line.

do $mig$
declare
  def text;
  old_op text := $a$      and ( s.gloss_vi_normalized like '%' || (select q_norm from q) || '%'
            or s.gloss_vi_normalized % (select q_norm from q) )$a$;
  new_op text := $a$      and ( s.gloss_vi_normalized like '%' || (select q_norm from q) || '%'
            or s.gloss_vi_normalized operator(extensions.%) (select q_norm from q) )$a$;
  hits int;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'lex' and p.proname = 'search_vi';
  if def is null then raise exception 'lex.search_vi not found'; end if;

  hits := (length(def) - length(replace(def, old_op, ''))) / length(old_op);
  if hits <> 1 then raise exception 'expected 1 bare trigram operator, found %', hits; end if;

  def := replace(def, old_op, new_op);
  execute def;
end
$mig$;

grant execute on function lex.search_vi(text, text[], int) to anon, authenticated, service_role;
