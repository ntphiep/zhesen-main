-- 0077_gloss_terms_strip_parentheses.sql
-- `lex.gloss_terms_reload` removes a gloss's parentheses before it splits on `,` and `;`.
--
-- 0067 split first, so a comma inside a parenthesis cut it in two: "Cá (hoặc bẫy một con
-- vật, đặc biệt là cá)" gave the bare term `cá` to en:dull, and "search con cá" returned
-- dull (#54). Over the 80-character-or-less glosses that hold a parenthesis, measured on
-- production on 2026-09-29: terms ending in `)` fall from 698 to 16, empty parts from 1,227
-- to 167, and a gloss led by a label, "(tiền tố) có thể", now yields its term.
--
-- One change to 0067's body: the `regexp_replace` inside `regexp_split_to_array`. The
-- 80-character cut still reads the original gloss.
--
-- TO ROLL BACK: replay 0067's `create or replace function` block, then run the reload
-- below again.
--
-- reviewed-destructive: Harry Nguyen. The `delete from lex.gloss_terms` is the rebuild
-- step of a derived table that holds nothing a person wrote; the insert after it refills it.

create or replace function lex.gloss_terms_reload(p_entries text[] default null)
returns void
language sql
set search_path = lex, extensions, public
as $$
  delete from lex.gloss_terms
  where p_entries is null or entry_id = any (p_entries);

  with src as (
    select s.entry_id, e.lang, v.term, v.head, s.sense_order
    from lex.senses s
    join lex.entries e on e.id = s.entry_id
    cross join lateral (
      select btrim(regexp_replace(lower(part), '\s*\(.*$', ''), ' .,;:!?') as base
      -- A closed parenthesis goes before the split, so a comma inside it cuts nothing.
      from unnest(regexp_split_to_array(regexp_replace(s.gloss_vi, '\s*\([^()]*\)', '', 'g'), '[,;]')) as part
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

set local statement_timeout = '900s';

-- Only an entry with a parenthesised short gloss changes; 5,607 on production.
do $$
declare
  ids text[];
begin
  for ids in
    select array_agg(entry_id) from (
      select entry_id, (row_number() over (order by entry_id) - 1) / 500 as batch
      from (select distinct entry_id from lex.senses where gloss_vi like '%(%' and length(gloss_vi) <= 80) d
    ) b group by batch
  loop
    perform lex.gloss_terms_reload(ids);
  end loop;
end
$$;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260929000001', 'gloss_terms_strip_parentheses')
on conflict (version) do nothing;
