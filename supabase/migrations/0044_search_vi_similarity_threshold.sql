-- Raise the trigram similarity threshold for lex.search_vi only.
--
-- The Vietnamese reverse lookup was the slowest thing left in the product: a
-- first-time query cost 464 to 4309 ms in production, against 182 to 270 ms for
-- the forward direction. It is on the critical path twice, once per Vietnamese
-- search and once more when a dictionary entry builds its "other languages"
-- panel, which feeds a whole gloss_vi into the same function.
--
-- The cost is the `%` arm of sense_hit. pg_trgm's default similarity_threshold
-- of 0.3 makes the GIN index hand back every row sharing roughly a third of the
-- query's trigrams, and the recheck then throws almost all of them away.
-- Measured on `lex.search_vi('bầu trời', array['en','es','zh'], 24)`:
--
--   threshold   heap blocks   rows removed by index recheck
--   0.3               3 350                         19 206
--   0.4               2 529                          6 519
--   0.45              1 187                          1 754
--
-- Same query, execution time on a warm cache: 151 ms at 0.3, 30 ms at 0.45. The
-- first cold run at 0.3 took 3 461 ms, of which the recheck was 3 116 ms.
--
-- 0.45 costs nothing in answer quality. Across 18 Vietnamese queries the top
-- three results are identical to 0.3 and 16 of the 18 still return a full 24
-- rows. The two that shrink lose only the fuzzy tail: for "xin chào", the rows
-- that drop are `rope` ("dây chão"), `soup` ("xúp, canh, cháo"), `bow`
-- ("cúi chào") and `welcome` ("chào mừng"), while all eleven real greetings
-- stay. Those rows scored 0.43 to 0.50 against a 5.0 exact-gloss tier, so the
-- arm can never outrank a substring match anyway -- it only ever filled the
-- slots below.
--
-- Set on the function rather than on the role or the database. lex.search and
-- lex.suggest use `%` against headwords, which are short, and the forward
-- direction is already fast; a global change would trade their typo tolerance
-- for speed they do not need.

-- pg_trgm is not preloaded, so in a fresh session its GUC is still an unknown
-- placeholder and `alter function ... set` on it fails with
-- "42501: permission denied to set parameter", which needs superuser. Calling
-- any pg_trgm function first loads the library and registers the GUC properly.
select extensions.similarity('a', 'b');

alter function lex.search_vi(text, text[], integer)
  set pg_trgm.similarity_threshold = 0.45;

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'lex' and p.proname = 'search_vi'
      and p.proconfig @> array['pg_trgm.similarity_threshold=0.45']
  ) then
    raise exception 'lex.search_vi did not keep the similarity threshold';
  end if;
end $$;
