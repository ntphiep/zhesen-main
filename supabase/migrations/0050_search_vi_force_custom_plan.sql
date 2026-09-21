-- `lex.search_vi` plans once for all queries and then reuses that plan. Pinning it to a
-- custom plan per call is the setting that stops that, and 0051 is what makes the setting
-- reach the query. On its own this migration changed no timing at all, measured three runs
-- per query after it applied: con cá 1,429 to 1,578 ms, con c 2,009 to 2,301 ms, both
-- overlapping the figures below. `plan_cache_mode` governs the plan cache that plpgsql and
-- PREPARE use, and a `language sql` function's body does not go through it. 0051 rewrites
-- the function in plpgsql for that reason and restates this line.
--
-- Measured on production after 0049, `explain (analyze, buffers)`:
--
--   through the function          literal SQL, same body
--   con cá   1,591 / 1,364 ms     206 ms
--   cái bàn  1,351 /   772 ms
--   con c    2,448 / 2,167 ms     111 ms
--   ăn         427 /   308 ms
--   nước       102 /   107 ms
--
-- The body is identical and the indexes are the same, so the difference is the plan. A
-- SQL function carrying a `SET` clause is never inlined, so its query is planned with
-- `p_q`, `p_langs` and `p_limit` as parameters. Two things follow. The range bounds
-- `term ~>=~ $1` get a default selectivity estimate rather than one read off the
-- statistics for that actual prefix, and `(p_langs is null or lang = any ($2))` cannot
-- fold, so the language filter stays out of the index condition. Both disappear once the
-- parameters are constants, which is what a custom plan makes them.
--
-- `plan_cache_mode` is a core GUC and needs no extension loaded, unlike 0044's
-- `pg_trgm.similarity_threshold`, so this carries no ordering requirement.
--
-- The cost is planning each call instead of once. Planning time measured through the
-- function was 0.1 to 0.3 ms against execution times in the hundreds.
--
-- `create or replace function` drops every SET clause it does not restate, so any later
-- migration that rewrites lex.search_vi must restate this line or silently undo it.
--
-- TO ROLL BACK: alter function lex.search_vi(text, text[], integer) reset plan_cache_mode;

alter function lex.search_vi(text, text[], integer) set plan_cache_mode = 'force_custom_plan';

insert into supabase_migrations.schema_migrations (version, name)
values ('20260921000003', 'search_vi_force_custom_plan')
on conflict (version) do nothing;
