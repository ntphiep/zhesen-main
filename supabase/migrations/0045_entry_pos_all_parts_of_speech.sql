-- A preview row carries every part of speech the entry has, not sense 1's.
--
-- Four functions answered `pos` the same way: the sense with the lowest
-- `sense_order`. Wiktionary orders senses by its own editorial convention, not by
-- how the word is used, so the value was frequently the rarest reading.
--
-- Measured on production, 2026-09-20:
--
--   en:tentative has five senses. sense_order 1 and 2 are 'noun', 3 to 5 are
--   'adjective'. lex.search('tentative', array['en'], 3) answered "pos":"noun".
--   The word is an adjective in ordinary use; the noun sense is archaic.
--
--   115,891 of 146,071 English senses carry a pos and 30,180 carry none.
--
-- Every consumer inherited the one wrong value: the search filter chips, the
-- wordlist column, and the row written into public.user_words.pos.
--
-- lex.entry_pos returns the distinct values joined by a comma, ordered by how many
-- senses carry each and then by where the first one appears. Comma because
-- public.user_words.pos is a single text column and the application already splits
-- on it (lib/dictionary/pos.ts). Raw values are returned unchanged: the same
-- category is spelled 'adj' on Spanish rows and 'adjective' on English ones, and
-- posGroup() is the one place that reconciles them.
--
-- The call sits after `limit` in each function, so it runs for the rows returned and
-- not for every candidate, which is the rule the ranking already follows.
--
-- lex.search_vi loses `hit_pos`, the part of speech of the sense that matched the
-- Vietnamese query. That was one value where the row needs all of them; the matched
-- SENSE is #12 and is a different field. It carries the expression twice, once in each
-- branch of `if length(v_norm) < 4 ...` (0036), so that one expects two hits.
--
-- Applied as a text transform of the live definitions, asserting the hit count,
-- rather than re-emitting four function bodies by hand. Same method as 0042.
--
-- TO ROLL BACK: replace each `lex.entry_pos(<alias>.id)` with the subquery quoted in
-- the assertion below, and drop lex.entry_pos.

create or replace function lex.entry_pos(p_entry_id text)
returns text
language sql
stable
set search_path = lex, extensions, public
as $function$
  select string_agg(t.pos, ',' order by t.n desc, t.first_order)
  from (
    select s.pos, count(*) as n, min(s.sense_order) as first_order
    from lex.senses s
    where s.entry_id = p_entry_id and s.pos is not null and s.pos <> ''
    group by s.pos
  ) t
$function$;

grant execute on function lex.entry_pos(text) to anon, authenticated, service_role;

-- pg_get_functiondef re-emits lex.search_vi with its own
-- `SET pg_trgm.similarity_threshold TO '0.45'` (0044), and setting that parameter fails
-- with 42501 until pg_trgm is loaded into the session. Calling one of its functions
-- loads it. Measured: without this line the block dies on lex.search_vi.
select extensions.similarity('a', 'b');

do $mig$
declare
  target record;
  def text;
  hits int;
begin
  for target in
    select * from (values
      -- lex.search: one line, alias `e`, from 0024.
      ('search',
       '\(select s\.pos from lex\.senses s where s\.entry_id = e\.id order by s\.sense_order limit 1\)',
       'lex.entry_pos(e.id)', 1),
      -- lex.search_vi: the matched sense's pos with sense 1 as the fallback, from 0036,
      -- once per branch of the short-query test.
      ('search_vi',
       'coalesce\(r\.hit_pos, ps\.pos\)',
       'lex.entry_pos(r.id)', 2),
      -- lex.term_previews: alias `h`, from 0029.
      ('term_previews',
       '\(select s\.pos from lex\.senses s\s+where s\.entry_id = h\.id and s\.pos is not null\s+order by s\.sense_order limit 1\)',
       'lex.entry_pos(h.id)', 1),
      -- lex.match_cross_language: alias `r`, from 0029.
      ('match_cross_language',
       '\(select s\.pos from lex\.senses s\s+where s\.entry_id = r\.id and s\.pos is not null\s+order by s\.sense_order limit 1\)',
       'lex.entry_pos(r.id)', 1)
    ) as t(fn, pattern, replacement, expected)
  loop
    select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'lex' and p.proname = target.fn;
    if def is null then raise exception 'lex.% not found', target.fn; end if;

    hits := (
      select count(*) from regexp_matches(def, target.pattern, 'g')
    );
    if hits <> target.expected then
      raise exception 'lex.%: expected % pos subquery, found %', target.fn, target.expected, hits;
    end if;

    execute regexp_replace(def, target.pattern, target.replacement, 'g');
  end loop;
end
$mig$;

-- `create or replace function` keeps existing grants, but 0042 restated them after the
-- same kind of transform and CI has no check that would catch a lost one.
grant execute on function lex.search(text, text[], int) to anon, authenticated, service_role;
grant execute on function lex.search_vi(text, text[], int) to anon, authenticated, service_role;
grant execute on function lex.term_previews(text, text[]) to anon, authenticated, service_role;
grant execute on function lex.match_cross_language(text[], text, text, int) to anon, authenticated, service_role;
