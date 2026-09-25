-- 0067_gloss_terms_reload_delete_first.sql
-- `lex.gloss_terms_reload` deletes an entry's terms before inserting them again.
--
-- Since 0048 the delete sat in a CTE, and a CTE runs on the same snapshot as the main
-- statement: the insert met every existing term, skipped it through ON CONFLICT, and the
-- delete removed it. Each call flipped an entry between full and empty, and the
-- sense triggers call it on every edit. Measured on staging: en:cat held 47 terms, 0 after
-- one call and 47 after the next. On production the rebuild raised en from 129,393 rows to
-- 137,314, es from 39,924 to 39,942 and zh from 17,113 to 17,144.
-- https://www.postgresql.org/docs/17/queries-with.html#QUERIES-WITH-MODIFYING
--
-- Two statements in order replace the CTE; the rest is 0055's body unchanged.
--
-- TO ROLL BACK: replay 0055's `create or replace function` block.
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

set local statement_timeout = '900s';

select lex.gloss_terms_reload();

insert into supabase_migrations.schema_migrations (version, name)
values ('20260926000002', 'gloss_terms_reload_delete_first')
on conflict (version) do nothing;
