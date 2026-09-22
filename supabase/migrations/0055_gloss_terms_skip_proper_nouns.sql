-- `lex.gloss_terms` stops indexing the senses that name a place, a person or another
-- entry, because those answer a Vietnamese query with something that is not a word.
--
-- Wiktionary gives a common English headword a long tail of senses after its real ones:
-- "A surname.", "A town in Vernon County, Wisconsin.", "An island of Quebec, Canada.",
-- "Alternative form of ...". Those senses used to carry no Vietnamese text, so they
-- contributed nothing. The Azure import filled them in, and the terms went straight into
-- the index: measured on production, `lex.gloss_terms` gained rows reading "sông battle",
-- "bang new york", "một họ hàn quốc" and "new zealand", and a lookup of "con cá" answered
-- with `dull` beside `fish`, because sense 17 of dull is "To fish with such a snare".
--
-- The cut is made on the English gloss rather than on sense depth. A depth cap of twelve
-- was measured first and removed 42,762 of 211,527 rows, but it also lost 22,219 terms
-- outright, among them ordinary ones like "đồ ăn vặt". The patterns below match 35,354
-- senses, 23,722 of which carry a Vietnamese gloss, and every one of them is a proper noun
-- or a pointer at another entry.
--
-- Only the `where` clause changes; the rest of the function is 0048's, restated because
-- `create or replace` takes the whole body.
--
-- TO ROLL BACK: replay 0048's `create or replace function lex.gloss_terms_reload` block,
-- then `select lex.gloss_terms_reload();`.
--
-- reviewed-destructive: Harry Nguyen. The `delete from lex.gloss_terms` is 0048's own
-- rebuild step, restated here because `create or replace` takes the whole body. The table
-- is derived from lex.senses and holds nothing a person wrote; the statement below
-- rebuilds it in the same transaction.

create or replace function lex.gloss_terms_reload(p_entries text[] default null)
returns void
language sql
set search_path = lex, extensions, public
as $$
  with del as (
    delete from lex.gloss_terms
    where p_entries is null or entry_id = any (p_entries)
    returning 1
  ),
  src as (
    select s.entry_id, e.lang, v.term, v.head, s.sense_order
    from lex.senses s
    join lex.entries e on e.id = s.entry_id
    cross join lateral (
      select btrim(regexp_replace(lower(part), '\s*\(.*$', ''), ' .,;:!?') as base
      from unnest(regexp_split_to_array(s.gloss_vi, '[,;]')) as part
    ) b
    cross join lateral (values (b.base, false), (lex.vi_head(b.base), true)) as v(term, head)
    where (p_entries is null or s.entry_id = any (p_entries))
      and s.gloss_vi is not null
      -- Over 80 characters the gloss is a definition, not a list of terms, and splitting
      -- it on commas yields words that merely appear inside an explanation.
      and length(s.gloss_vi) <= 80
      and v.term <> ''
      and length(v.term) <= 40
      -- A gazetteer or a name list, not a meaning.
      and not (s.gloss_en ~* '^(a |an |the )?(surname|given name|male given name|female given name|place|placename|village|town|city|river|county|hamlet|borough|municipality|unincorporated community|census-designated place|suburb|district|province|state|island|lake|mountain|parish|township|neighborhood|neighbourhood|locality|civil parish)\M')
      -- A pointer at another entry, which already carries the meaning itself.
      and not (s.gloss_en ~* '^(initialism|abbreviation|acronym|ellipsis|alternative form|alternative spelling|obsolete form|archaic form|misspelling|synonym|plural|inflection|clipping|short for) of\M')
  )
  insert into lex.gloss_terms (entry_id, lang, term, term_una, head, sense_order)
  select
    entry_id, lang, term,
    lower(extensions.immutable_unaccent(term)),
    -- False as soon as one gloss writes the term itself, which is the stronger claim.
    bool_and(head),
    min(sense_order)
  from src
  group by entry_id, lang, term
  on conflict (entry_id, term) do nothing;
$$;

-- The rebuild touches every sense and runs for minutes. Under the default
-- statement_timeout it is cancelled part way and the index is left short: measured,
-- one cancelled run left 7,970 rows in place of 186,430.
set local statement_timeout = '900s';

select lex.gloss_terms_reload();

insert into supabase_migrations.schema_migrations (version, name)
values ('20260922000003', 'gloss_terms_skip_proper_nouns')
on conflict (version) do nothing;
