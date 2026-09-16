-- Resolve inflected forms through the index that already exists, instead of
-- scanning the table.
--
-- WHAT IS WRONG. `lib/dictionary/resolveTokens.ts:29-30` asks PostgREST for
--   select form_text, entry_id from lex.inflections where form_text = any (...)
-- and `lex.inflections` has no index on the raw `form_text` column. Its three
-- indexes are `inflections_pkey`, `idx_lex_infl_entry` on `entry_id` (0003:182) and
-- `idx_lex_infl_form_norm` on the expression
-- `lower(extensions.immutable_unaccent(form_text))` (0022:39-40). None of them can
-- answer a comparison against the bare column, so every call reads all 352,332 rows.
--
-- MEASURED BEFORE. Postgres cancelled this statement with SQLSTATE 57014,
-- statement timeout, on a production build while warming the tappable-text cache for
-- the entry `zh:狗`. `pg_stat_statements` records the same statement 77 times at
-- 1690.76 ms on average and a variant 147 times at 660.42 ms -- the second most
-- expensive statement in the database. `EXPLAIN (analyze)` on
--   select * from lex.inflections where form_text = any (array['running','ran','goes','went','better'])
-- gives a Parallel Seq Scan, `Rows Removed by Filter: 176162`, Execution Time
-- 1673.339 ms.
--
-- Measured through PostgREST from one client, against a floor of 212 ms for a
-- single-row primary-key read: the `zh:狗` page produces 14 distinct Han tokens, and
-- `.in('form_text', <14 tokens>)` took 546, 256 and 506 ms while returning an empty
-- array, with a cold first call at 1979 ms. The same table filtered on the indexed
-- `entry_id` took 215, 167 and 168 ms while returning 12,517 bytes. A build resolves
-- many pages at once, which is how a 1.7 s statement reaches the timeout.
--
-- MEASURED AFTER. Not measured. This migration has not been applied, and without
-- SQL access the new function cannot be run. Verify it on a branch database before
-- production, with `explain (analyze)` on
--   select * from lex.resolve_inflections('zh', array['狗','的','是','我','他']);
-- and expect an Index Scan or Bitmap Index Scan on `idx_lex_infl_form_norm` in place
-- of the Parallel Seq Scan.
--
-- NOT THE OTHER CALL SITE. `getInflections` (lib/dictionary/entryDetail.ts:155-160)
-- filters on `entry_id`, which `idx_lex_infl_entry` covers. Measured at 165, 173 and
-- 171 ms for `zh:狗`, which returns no rows at all because Chinese has no
-- inflections, and 193, 165 and 172 ms for `es:correr`, which returns 412. It is at
-- the floor and needs no change.
--
-- TO ROLL BACK. `drop function if exists lex.resolve_inflections(text, text[]);` and
-- revert the call site. The function is additive: nothing else calls it, and
-- lex.inflections is not touched.
--
-- No new index. The database is at 383.2 MB of a 500 MB ceiling, and there is
-- already an index covering this question -- the query just has to be asked in the
-- shape the index was built in. So the comparison moves onto
-- `lower(extensions.immutable_unaccent(form_text))` on both sides, which is exactly
-- what the `infl` CTE of `lex.search` does at 0024_search_candidate_arms.sql:49.
--
-- Two behaviours change, both for the better:
--
--   * The language filter moves into the database. resolveTokens fetches entry ids
--     for every language first and only filters by language on the follow-up query
--     (`lib/dictionary/resolveTokens.ts:37`), so a Spanish form could pull back rows
--     that the next query then threw away.
--   * A form typed without diacritics now resolves. "comio" reaches "comió" and from
--     there the entry for "comer", because the index expression unaccents both
--     sides. The raw comparison could not do that.
--
-- One form can be an inflection of several entries -- Spanish `fue` belongs to both
-- `ser` and `ir`. The old code kept whichever row PostgREST happened to return first
-- (`lib/dictionary/resolveTokens.ts:43`, `if (p && !out.has(r.form_text))`). This
-- picks the most frequent entry instead, by the same ordering `lex.term_previews`
-- uses at 0029_gender_on_previews.sql:35-38, so the answer is stable between calls.
--
-- Returns the caller's own spelling in `form_text`, not the stored one, so the
-- result still keys straight into the Map that resolveTokens builds.

create or replace function lex.resolve_inflections(p_lang text, p_forms text[])
returns table (form_text text, entry_id text)
language sql
stable
as $$
  with want as (
    select distinct
      f as form_text,
      lower(extensions.immutable_unaccent(f)) as norm
    from unnest(p_forms) as f
    where coalesce(trim(f), '') <> ''
  ),
  hit as (
    select
      w.form_text,
      i.entry_id,
      row_number() over (
        partition by w.form_text
        order by e.frequency_rank nulls last, length(e.headword), e.id
      ) as rn
    from want w
    join lex.inflections i
      on lower(extensions.immutable_unaccent(i.form_text)) = w.norm
    join lex.entries e
      on e.id = i.entry_id and e.lang::text = p_lang
  )
  select h.form_text, h.entry_id
  from hit h
  where h.rn = 1;
$$;

grant execute on function lex.resolve_inflections(text, text[]) to anon, authenticated, service_role;
