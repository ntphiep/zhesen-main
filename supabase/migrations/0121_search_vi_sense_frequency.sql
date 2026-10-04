-- 0121_search_vi_sense_frequency.sql
-- lex.search_vi scores a sense ranked by sense_frequency at that rank, as the word page orders
-- it (rankSenses, lib/dictionary/textQuality.ts), instead of by its Wiktionary position alone.
--
-- The depth penalty read sense_order only. Measured on production on 2026-10-04: give up's
-- "To stop or quit" sense is sense 5 with sense_frequency 1 and leads its page as "từ bỏ, chấm
-- dứt, bỏ cuộc", yet lex.search_vi('bỏ cuộc', array['en'], 8) scored it 3.70 and left give up
-- out of the eight results the lookup shows. 4,112 English entries carry sense_frequency;
-- no other language does.
--
-- lex.gloss_terms gains sense_rank, the best sense_frequency among the senses that write the
-- term, filled by lex.gloss_terms_reload (0107's body plus that column). search_vi takes the
-- nearer of the two positions, so a rank only lifts a sense and an entry without one scores as
-- before. Both bodies are otherwise the live definitions (0099 and 0107); the SET clauses are
-- restated, as create or replace drops the ones it omits.
--
-- Measured against a temporary copy of lex.gloss_terms on production on 2026-10-04: "bỏ cuộc"
-- lists give up third, and 22 of 30 sample queries change order, mostly by lifting the common
-- word ("yêu": love from fifth to first; "làm việc": work from sixth to first; "nói": say from
-- fourth to first). Ties at 3.85 grow, and frequency_rank orders them ("người" now opens with who).
--
-- TO ROLL BACK: replay 0099's lex.search_vi and 0107's lex.gloss_terms_reload, then
-- alter table lex.gloss_terms drop column sense_rank.
--
-- reviewed-destructive: the delete inside gloss_terms_reload is the existing rebuild of
-- derived rows, unchanged from 0107.

set lock_timeout = '5s';
set statement_timeout = '900s';

alter table lex.gloss_terms add column if not exists sense_rank smallint;

comment on column lex.gloss_terms.sense_rank is
  'The best sense_frequency among the senses whose gloss writes this term; null when none is ranked.';

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

  insert into lex.gloss_terms (entry_id, lang, term, term_una, head, sense_order, sense_rank)
  select entry_id, lang, term,
         lower(extensions.immutable_unaccent(term)),
         -- False as soon as one gloss writes the term itself, which is the stronger claim.
         bool_and(head),
         min(sense_order),
         min(sense_rank)
  from (
    select s.entry_id, e.lang, v.term, v.head, s.sense_order,
           case when s.sense_frequency ~ '^[1-9][0-9]?$' then s.sense_frequency::smallint end as sense_rank
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

CREATE OR REPLACE FUNCTION lex.search_vi(p_q text, p_langs text[] DEFAULT NULL::text[], p_limit integer DEFAULT 20)
 RETURNS TABLE(id text, lang text, headword text, traditional text, level text, frequency_rank integer, attributes jsonb, pos text, gloss_vi text, gloss_en text, ipa text, audio_url text, rank real)
 LANGUAGE plpgsql
 STABLE PARALLEL SAFE
 SET search_path TO 'lex', 'extensions', 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
#variable_conflict use_column
begin
  return query
  with k as (
    select
      lower(btrim(coalesce(p_q, '')))                                as raw,
      lower(extensions.immutable_unaccent(btrim(coalesce(p_q, '')))) as una
  ),
  q as (
    select
      raw, una,
      raw <> una              as marked,
      lex.vi_head(raw)        as raw_head,
      lex.vi_head(una)        as una_head,
      lex.tone_key(raw)       as raw_tone,
      lex.prefix_upper(raw)   as raw_hi,
      lex.prefix_upper(una)   as una_hi
    from k
  ),
  -- Two prefix ranges and two equalities, all four on lex.gloss_terms, so they combine
  -- into one bitmap over the two text_pattern_ops indexes. `~>=~` and `~<~` rather than
  -- `like`, because the planner derives bounds from `like` only for a constant pattern and
  -- this one comes from a CTE.
  scored as (
    select
      g.entry_id,
      g.lang as hit_lang,
      g.sense_order,
      -- A whole term matched, as opposed to the query being a prefix of one. Carried
      -- rather than inferred from the rank, because the two penalties below can push a
      -- weak whole-term hit under a strong prefix one.
      (g.term = q.raw or g.term = q.raw_head
       or g.term_una = q.una or g.term_una = q.una_head) as whole,
      ((case
          when q.marked then
            case when g.term = q.raw                    then 4.0
                 -- "hoa binh" with the mark on either vowel is one word: Vietnamese puts
                 -- the tone on either half of a diphthong and the data holds both.
                 -- tone_key costs ~32 us per call; equal tone keys imply equal unaccented forms,
                 -- so the term_una test skips it for every prefix-only row.
                 when g.term_una = q.una and lex.tone_key(g.term) = q.raw_tone then 3.9
                 when g.term = q.raw_head               then 3.7
                 when g.term operator(pg_catalog.~>=~) q.raw
                      and g.term operator(pg_catalog.~<~) q.raw_hi then 3.2
                 -- Reached only through term_una, so the marks disagree: a different
                 -- Vietnamese word. Below the floor.
                 else 2.0 end
          else
            -- Nothing in a query typed without marks can tell the words apart, so the
            -- ambiguity is accepted and frequency decides the order.
            case when g.term_una = q.una              then 4.0
                 when g.term_una = q.una_head         then 3.7
                 else 3.2 end
        end)
        - (case when g.head then 0.15 else 0.0 end)
        -- A gloss deep inside a long entry is a weaker answer than sense 1 of the right
        -- word: "bau troi" is sense 13 of element and sense 28 of blue. A sense ranked by
        -- sense_frequency counts at that rank when it is nearer the top, as on its page.
        - 0.5 * (1.0 - 1.0 / sqrt(least(g.sense_order, coalesce(g.sense_rank, g.sense_order)) + 1.0))
      )::real as hit_rank
    from q
    join lex.gloss_terms g
      on (p_langs is null or g.lang = any (p_langs))
     and (   (g.term     operator(pg_catalog.~>=~) q.raw
              and g.term operator(pg_catalog.~<~)  q.raw_hi)
          or  g.term     = q.raw_head
          or (g.term_una operator(pg_catalog.~>=~) q.una
              and g.term_una operator(pg_catalog.~<~) q.una_hi)
          or  g.term_una = q.una_head)
    where q.raw <> ''
  ),
  best as (
    select distinct on (entry_id) entry_id, hit_lang, sense_order, hit_rank, whole
    from scored
    order by entry_id, whole desc, hit_rank desc, sense_order asc
  ),
  -- One quota per language, so a strong language cannot take the whole budget. A
  -- prefix-only row survives only where nothing matched a whole term anywhere, which is
  -- what a half-typed word looks like.
  per_lang as (
    select * from (
      select
        b.*,
        row_number() over (partition by b.hit_lang
                           order by b.hit_rank desc, fe.frequency_rank asc nulls last, b.entry_id)
          as rn,
        bool_or(b.whole) over () as any_whole
      from best b
      join lex.entries fe on fe.id = b.entry_id
      where b.hit_rank >= 2.5
    ) t
    where rn <= p_limit and (whole or not any_whole)
  )
  -- Rank first, enrich second: the subqueries below run only for the surviving rows.
  select
    e.id, e.lang, e.headword, e.traditional, e.level, e.frequency_rank, e.attributes,
    lex.entry_pos(e.id) as pos,
    -- The sense that matched, not sense 1: "lua" matches sense 2 of fire, and sense 1
    -- says nothing about fire.
    coalesce(hs.gloss_vi, ps.gloss_vi) as gloss_vi,
    ps.gloss_en,
    (select p.ipa from lex.pronunciations p
      where p.entry_id = e.id and p.ipa is not null
      order by case when e.lang = 'en' and lower(p.accent) like '%us%' then 0
                    when e.lang = 'en' and lower(p.accent) like '%uk%' then 1
                    else 2 end
      limit 1) as ipa,
    (select p.audio_url from lex.pronunciations p
      where p.entry_id = e.id and p.audio_url is not null limit 1) as audio_url,
    r.hit_rank
  from per_lang r
  join lex.entries e on e.id = r.entry_id
  left join lateral (
    select s.gloss_vi from lex.senses s
    where s.entry_id = e.id and s.sense_order = r.sense_order and s.gloss_vi is not null
    limit 1
  ) hs on true
  left join lateral (
    select s.pos, s.gloss_vi, s.gloss_en from lex.senses s
    where s.entry_id = e.id
    order by s.sense_order asc
    limit 1
  ) ps on true
  order by r.hit_rank desc, e.frequency_rank asc nulls last;
end;
$function$;

-- Only an entry with a ranked sense gains a sense_rank.
select lex.gloss_terms_reload(array(
  select distinct s.entry_id from lex.senses s where s.sense_frequency is not null
));

insert into supabase_migrations.schema_migrations (version, name)
values ('20261004000121', 'search_vi_sense_frequency')
on conflict (version) do nothing;
