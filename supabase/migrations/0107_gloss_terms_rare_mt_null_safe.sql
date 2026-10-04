-- 0107_gloss_terms_rare_mt_null_safe.sql
-- Make the rare machine-translation exclusion of 0106 null-safe, then rebuild lex.gloss_terms.
--
-- In 0106 the clause `not (s.provenance->>'gloss_vi_source' = 'mt:google' and ...)` is NULL for a
-- sense with no gloss_vi_source key, and WHERE drops a NULL row. Every reload of an unlevelled
-- entry outside the 50,000 most frequent therefore lost the terms of its human and AI glosses
-- too: measured on production on 2026-10-04, 105 such entries (en:Ainu among them) had no terms
-- left. `is not distinct from` keeps the comparison two-valued. The reload is restated from 0106
-- with only that clause changed, then rebuilds the entries that lost their terms.
--
-- reviewed-destructive: the delete inside gloss_terms_reload is the existing rebuild of
-- derived rows, unchanged from 0106.

create or replace function lex.gloss_terms_reload(p_entries text[] default null)
returns void
language plpgsql
set search_path = lex, extensions, public
set plan_cache_mode = 'force_custom_plan'
as $$
begin
  if p_entries is not null and cardinality(p_entries) = 0 then
    return;
  end if;
  if p_entries is null then
    delete from lex.gloss_terms;
  else
    delete from lex.gloss_terms where entry_id = any (p_entries);
  end if;

  insert into lex.gloss_terms (entry_id, lang, term, term_una, head, sense_order)
  select entry_id, lang, term,
         lower(extensions.immutable_unaccent(term)),
         -- False as soon as one gloss writes the term itself, which is the stronger claim.
         bool_and(head),
         min(sense_order)
  from (
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
      -- A machine translation of a rare word's definition, which would outrank common words.
      and not (s.provenance->>'gloss_vi_source' is not distinct from 'mt:google'
               and e.level is null and coalesce(e.frequency_rank, 2147483647) > 50000)
      -- A gazetteer or a name list, not a meaning.
      and not (s.gloss_en ~* '^(a |an |the )?(surname|given name|male given name|female given name|place|placename|village|town|city|river|county|hamlet|borough|municipality|unincorporated community|census-designated place|suburb|district|province|state|island|lake|mountain|parish|township|neighborhood|neighbourhood|locality|civil parish)\M')
      -- A pointer at another entry, which already carries the meaning itself; an
      -- inflection's label ("quá khứ và phân từ quá khứ của beg") is not a term either.
      and not (s.gloss_en ~* '^(initialism|abbreviation|acronym|ellipsis|alternative form|alternative spelling|obsolete form|archaic form|misspelling|synonym|plural|inflection|clipping|short for|past participle|present participle|simple past( and past participle)?|gerund|(feminine|masculine)( singular| plural)?|(first|second|third)-person[a-z /-]*) of\M')
  ) src
  group by entry_id, lang, term
  on conflict (entry_id, term) do nothing;
end;
$$;

set lock_timeout = '5s';
set statement_timeout = '900s';

-- An entry the faulty reload touched lost every term, so the entries to rebuild are the rare
-- ones holding a short gloss and no term.
select lex.gloss_terms_reload(array(
  select e.id
  from lex.entries e
  where e.level is null and coalesce(e.frequency_rank, 2147483647) > 50000
    and exists (select 1 from lex.senses s
                where s.entry_id = e.id and s.gloss_vi is not null and length(s.gloss_vi) <= 80)
    and not exists (select 1 from lex.gloss_terms g where g.entry_id = e.id)
));
