-- 0190_form_of_lead_part_of_speech.sql
-- A pointer makes an entry a form of its lemma in the part of speech of its first current
-- sense, as `lemmaFromSenses` (lib/dictionary/lemma.ts) reads it for the word page. 0080 took
-- the first inflection pointer of any part of speech, so es:para (a preposition, then forms of
-- parar), pero, nada, entre, gracias and sobre carried `form_of`, and the level lists, their
-- counts, the levelled common-words strip and the sitemap left them out.
--
-- A pointer in another part of speech still counts when the lead is an open class and the
-- lemma is the commoner word: Wiktionary leads thought, being, saw and mice with a noun or a
-- verb of their own, and the part of speech alone put 1,369 such English forms back on the
-- A1-B2 lists. An old sense (the register `isOldSense` reads) neither leads nor points, so went
-- is a form of go and art is not a form of be. A headword of several words takes as many from
-- the pointer: colour blind is a form of color blind. `isFormOnly`'s rule, every current sense
-- a pointer, was measured and rejected for the lists: it cleared dogs ("feet" in US slang),
-- seconds and casas (a surname). The word lists are 0080's; test/dictionary-lemma-sql.test.ts
-- keeps them equal to lemma.ts.
--
-- Run in a rolled-back transaction on production on 2026-10-05 over the 10,758 entries that
-- carry `form_of`: en 805 cleared (582 at A1-B2), 88 moved, 6,979 kept; es 1,474 cleared
-- (1,043 at A1-B2), 10 moved, 1,401 kept; zh 1 cleared; none gained. Spanish A1 goes from
-- 1,053 to 1,204 words and English A1 from 1,058 to 1,108. The rule can only clear or change a
-- `form_of`, never add one, so the reload covers only the entries carrying one.
--
-- The senses triggers apply the rule to every load after this. The apply script backs up
-- (id, form_of), reloads in batches of 2,000 (1,000 took 0.6 to 1.1 s), revalidates the `lex`
-- tag and refreshes lex.sitemap_entries.
--
-- TO ROLL BACK: replay lex.pointer_lemma from 0080, then set form_of from
-- s3://zhesen-db-backups-014498663963/migrations/form-of-20261005.csv.

set lock_timeout = '5s';

create or replace function lex.pointer_lemma(p_entry_id text)
returns text
language sql
stable
set search_path = lex, extensions, public
as $$
  with e as (
    select e.lang, lower(e.headword) as head, coalesce(e.frequency_rank, 2147483647) as rank,
           cardinality(regexp_split_to_array(btrim(e.headword), '\s+')) as words
    from lex.entries e
    where e.id = p_entry_id
  ), s as (
    select s.gloss_en, s.pos,
           coalesce(s.register, '') ~ '\m(?:obsolete|archaic|dated|rare|vulgar|offensive|dialectal)\M' as old,
           row_number() over (order by s.sense_order, s.id) as n
    from lex.senses s
    where s.entry_id = p_entry_id
  ), lead as (
    select coalesce((select s.pos from s where not s.old order by s.n limit 1),
                    (select s.pos from s order by s.n limit 1)) as pos
  ), m as (
    select s.n, s.pos, regexp_match(s.gloss_en,
      '^((?:(?:simple|past|present|future|participle|gerund|comparative|superlative|degree'
      '|first-person|second-person|third-person|singular|plural|indicative|subjunctive|imperative'
      '|preterite|imperfect|conditional|affirmative|negative|formal|informal|feminine|masculine'
      '|neuter|remote|inflection|and|or|form|alternative|spelling|misspelling|obsolete|archaic'
      '|dated|nonstandard|rare|standard|british|uk|us|letter-case|pronunciation|\([^)]*\))\s+)+)'
      'of\s+([[:alpha:]][[:alpha:]''’-]*)((?:\s+[[:alpha:]][[:alpha:]''’-]*)+(?=\s*[.;:)]*\s*$))?', 'i') as g
    from s
    where s.n <= 15 and not s.old
  ), p as (
    select m.n, m.pos, btrim(m.g[2]) ||
             case when e.words > 1 and m.g[3] is not null
                   and cardinality(regexp_split_to_array(btrim(m.g[3]), '\s+')) = e.words - 1
                  then ' ' || regexp_replace(btrim(m.g[3]), '\s+', ' ', 'g') else '' end as lemma
    from m cross join e
    where m.g is not null
      and (m.n = 1 or m.g[1] ~* '\m(plural|singular|past|present|future|participle|gerund|comparative|superlative|person|indicative|subjunctive|imperative|preterite|imperfect|conditional|inflection)\M')
      -- A label alone is a definition: CC-CEDICT's "(idiom) of long standing" points at nothing.
      and btrim(regexp_replace(m.g[1], '\([^)]*\)', '', 'g')) <> ''
  )
  select p.lemma
  from p cross join e cross join lead
  where lower(p.lemma) <> e.head
    and (p.pos is not distinct from lead.pos
      -- A pointer in another part of speech holds only under an open-class lead, and only when
      -- the lemma is the commoner word: thought (a noun first) of think, not para of parar.
      or (lead.pos not in ('article', 'determiner', 'det', 'pronoun', 'pron', 'preposition', 'prep',
                           'prep_phrase', 'conjunction', 'numeral', 'particle')
          and (select min(l.frequency_rank) from lex.entries l
               where l.lang = e.lang and l.headword_normalized = lower(p.lemma)) < e.rank))
  order by p.pos is not distinct from lead.pos desc, p.n
  limit 1;
$$;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261005000190', 'form_of_lead_part_of_speech')
on conflict (version) do nothing;
