-- Every statement on lex.senses fires the gloss_terms and form_of triggers, and both reload
-- functions filtered with `p_entries is null or entry_id = any (p_entries)`. A language sql
-- body is planned with p_entries unknown, so neither branch could use an index: over 1,216,987
-- senses one reload of es:de took 7,523 ms, an empty array 4,422 ms, and form_of 808 ms, while
-- the same delete by entry_id alone took 0.5 ms. lex.learner_load spent 59 s on es:de. The
-- bodies are unchanged; each call is planned with its own p_entries, and an empty set
-- returns at once.
--
-- reviewed-destructive: the deletes are the existing rebuild of derived gloss_terms rows,
-- unchanged from 0077; approved as part of the learner layer work in issue #83.

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
      -- A gazetteer or a name list, not a meaning.
      and not (s.gloss_en ~* '^(a |an |the )?(surname|given name|male given name|female given name|place|placename|village|town|city|river|county|hamlet|borough|municipality|unincorporated community|census-designated place|suburb|district|province|state|island|lake|mountain|parish|township|neighborhood|neighbourhood|locality|civil parish)\M')
      -- A pointer at another entry, which already carries the meaning itself.
      and not (s.gloss_en ~* '^(initialism|abbreviation|acronym|ellipsis|alternative form|alternative spelling|obsolete form|archaic form|misspelling|synonym|plural|inflection|clipping|short for) of\M')
  ) src
  group by entry_id, lang, term
  on conflict (entry_id, term) do nothing;
end;
$$;

create or replace function lex.form_of_reload(p_entries text[] default null)
returns void
language plpgsql
set search_path = lex, extensions, public
set plan_cache_mode = 'force_custom_plan'
as $$
begin
  if p_entries is not null and cardinality(p_entries) = 0 then
    return;
  end if;
  update lex.entries e
  set form_of = p.lemma
  from (
    select x.id, lex.pointer_lemma(x.id) as lemma
    from lex.entries x
    where p_entries is null or x.id = any (p_entries)
  ) p
  where e.id = p.id and e.form_of is distinct from p.lemma;
end;
$$;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260929000086', 'senses_trigger_reload_by_entry')
on conflict (version) do nothing;
