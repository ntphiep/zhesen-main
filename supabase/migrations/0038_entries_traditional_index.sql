-- The traditional-form arm of lex.search reads the whole table on every search.
--
-- `cand` arm 2 (0024_search_candidate_arms.sql) matches `e.traditional = q.q_raw`.
-- `lex.entries.traditional` carries a PGroonga index for the `&@` operator
-- (0022_search_traditional_and_inflections.sql:33) and nothing for equality, so the
-- planner has no choice. Measured with
-- `explain (analyze) select * from lex.search('習', array['zh'], 8)`:
--
--   Hash Join  Hash Cond: (e_3.traditional = q_2.q_raw)
--     ->  Seq Scan on entries e_3 (actual time=1.786..354.204 rows=36361 loops=1)
--
--   Execution Time: 706.605 ms
--
-- 354 ms of that 706 ms is this one arm. It runs on every call in every language,
-- including the English and Spanish searches that can never match a traditional
-- form, because the arm is guarded only by a non-empty query.
--
-- Partial, because only Chinese entries have the column filled: 4,045 rows of
-- 36,361. The predicate is what makes the index usable for the arm, since the
-- equality can only be satisfied by a non-null value anyway.
--
-- Not a unique index. Several simplified entries can share one traditional form.

create index if not exists idx_lex_entries_traditional
  on lex.entries (traditional)
  where traditional is not null;
