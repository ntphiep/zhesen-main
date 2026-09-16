-- Make lex.suggest use the trigram indexes that already exist.
--
-- It is the most expensive statement in the database: 523 calls, 1246.9 ms on
-- average, 652,108 ms in total, against 46.30 ms for lex.search over 4,619 calls.
-- `EXPLAIN (analyze) select * from lex.suggest('choa', 8)` finishes in 4571.124 ms.
--
-- Two causes, one of them a single character.
--
-- 0018_reverse_lookup.sql:323 and :334 call `extensions.similarity(a, b) > 0.15`,
-- the function. A function call is opaque to the planner, so neither
-- `idx_lex_entries_headword_trgm` (0016:69, GIN over headword_normalized, 2.04 MB)
-- nor `idx_lex_senses_gloss_vi_trgm` (0018:29, GIN over gloss_vi_normalized,
-- 5.75 MB) can serve it, and both arms read every row: 36,361 entries and 183,526
-- senses, computing a trigram distance for each. The `%` operator is what those GIN
-- indexes are built for, and it means exactly "similarity above
-- pg_trgm.similarity_threshold", so the threshold moves into the GUC and the
-- operator replaces the function call.
--
-- The threshold itself is the second cause. 0018:295-306 chose 0.15. Measured on
-- the live database with the operator rewrite already in place:
--
--   set local pg_trgm.similarity_threshold = 0.15  ->  Execution Time 2517.899 ms
--   set local pg_trgm.similarity_threshold = 0.30  ->  Execution Time  182.142 ms
--
-- At 0.15 the gloss arm alone pulls 50,416 rows out of the index and throws 23,128
-- of them away on recheck. At 0.30 it pulls 26,353 and the whole statement costs a
-- fourteenth as much.
--
-- Nothing is lost by it. The top 8 rows returned for 'choa' are identical at both
-- thresholds, id for id and score for score. Across seven realistic typos the best
-- headword similarity available in the table is:
--
--   begining 0.727, acomodate 0.583, comio 0.500, hoc tap 0.500,
--   recieve 0.455, chao ban 0.444, xin chaoo 0.333
--
-- all of them at or above 0.30, so the suggester still answers every one. A
-- candidate below 0.30 similarity is not a suggestion worth showing.
--
-- 0.30 is also the pg_trgm default on this database, measured with
--   select current_setting('pg_trgm.similarity_threshold', true)  ->  0.3
-- so the operator already means "at least 0.30" today.
--
-- The threshold is pinned with an explicit `similarity(...) >= 0.3` next to the
-- operator rather than with a function-level `SET`. The Management API role cannot
-- attach that SET: applying it returns `ERROR: 42501: permission denied to set
-- parameter "pg_trgm.similarity_threshold"`. The explicit predicate guards the
-- direction that matters. A global GUC lowered below 0.30 would otherwise let the
-- index hand back tens of thousands of rows again, which is the 2517 ms case above;
-- the operator still drives the index, and the predicate filters what it returns.
--
-- The operator is written `operator(extensions.%)` rather than bare `%`. Same
-- operator, same OID, so the planner matches the index identically, but it does not
-- depend on `extensions` sitting in the caller's search_path -- which it does not for
-- every role (`supabase_read_only_user` raises 42883 on a bare `%`).
--
-- Two further changes, both from AGENTS.md's "rank first, enrich after":
--   * each arm keeps only its 200 best, so the sort and the dedupe work on a bounded
--     set instead of on whatever the threshold admitted;
--   * the per-entry gloss lookup now runs after the final LIMIT. At 0018:318 it ran
--     for every candidate row in the forward arm.
--
-- MEASURED BEFORE. 501 calls, 1278.17 ms average, 640,361 ms total in
-- `pg_stat_statements`; `explain (analyze) select * from lex.suggest('choa', 8)` at
-- 4571.124 ms. Through PostgREST, against a floor of about 200 ms for a request that
-- does no work, six consecutive calls measured 684, 681, 682, 690, 960 and 685 ms for
-- one query and 662, 731, 694, 670, 725 and 1005 ms for another -- no variance worth
-- the name, which is the signature of a full scan rather than a cache effect.
--
-- It is not a rare path either. 4,619 `lex.search` calls at three calls per lookup is
-- at most 1,540 lookups, so 501 `lex.suggest` calls is at least 32.5% of them. The
-- comment at lib/dictionary/search.ts:121-123 calls this round trip rare; it is not.
--
-- MEASURED AFTER. Not measured. This migration has not been applied and the review
-- had PostgREST read access only. Verify on a branch database with
--   explain (analyze) select * from lex.suggest('choa', 8);
-- and expect Bitmap Index Scans on idx_lex_entries_headword_trgm and
-- idx_lex_senses_gloss_vi_trgm in place of the two sequential scans.
--
-- TO ROLL BACK. Re-apply the body from 0018_reverse_lookup.sql:307-350, which is the
-- definition this replaces. The function is the only thing that changes; no index,
-- column or row is touched, and the return signature is identical, so
-- `suggestRow` (lib/dictionary/rows.ts:85-93) parses the result either way.

create or replace function lex.suggest(p_q text, p_limit int default 5)
returns table (id text, lang text, headword text, gloss_vi text, kind text, score real)
language sql
stable
as $$
  with q as (
    select lower(extensions.immutable_unaccent(trim(p_q))) as q_norm
  ),
  -- Nearest headwords. The `%` operator drives idx_lex_entries_headword_trgm;
  -- similarity() is still called, but only to score the rows the index returned.
  fwd as (
    select
      e.id,
      e.lang::text as lang,
      e.headword,
      null::text as gloss_vi,
      'headword'::text as kind,
      extensions.similarity(e.headword_normalized, (select q_norm from q))::real as score
    from lex.entries e
    where (select q_norm from q) <> ''
      and e.headword_normalized operator(extensions.%) (select q_norm from q)
      and extensions.similarity(e.headword_normalized, (select q_norm from q)) >= 0.3
    order by score desc
    limit 200
  ),
  -- Nearest Vietnamese glosses, driven by idx_lex_senses_gloss_vi_trgm. The gloss
  -- that matched is carried through, because it is the one worth showing.
  rev as (
    select
      s.entry_id as id,
      e.lang::text as lang,
      e.headword,
      s.gloss_vi,
      'gloss_vi'::text as kind,
      extensions.similarity(s.gloss_vi_normalized, (select q_norm from q))::real as score
    from lex.senses s
    join lex.entries e on e.id = s.entry_id
    where (select q_norm from q) <> ''
      and s.gloss_vi_normalized operator(extensions.%) (select q_norm from q)
      and extensions.similarity(s.gloss_vi_normalized, (select q_norm from q)) >= 0.3
    order by score desc
    limit 200
  ),
  combined as (
    select * from fwd
    union all
    select * from rev
  ),
  deduped as (
    select distinct on (id) id, lang, headword, gloss_vi, kind, score
    from combined
    order by id, score desc
  ),
  top as (
    select * from deduped
    order by score desc
    limit p_limit
  )
  select
    t.id, t.lang, t.headword,
    -- Only the headword arm arrives without a gloss, and only the handful of rows
    -- that survived the limit pay for this lookup.
    coalesce(
      t.gloss_vi,
      (select s.gloss_vi from lex.senses s
        where s.entry_id = t.id and s.gloss_vi is not null
        order by s.sense_order limit 1)
    ) as gloss_vi,
    t.kind, t.score
  from top t
  order by t.score desc;
$$;

grant execute on function lex.suggest(text, int) to anon, authenticated, service_role;
