-- 0150_search_vi_learner_order.sql
-- lex.search_vi puts the word a learner expects first (#98, audit D1 and D4).
--
-- 1. A query typed without marks is first itself: exact term 4.0, its toned neighbours 3.9.
--    "mua" opened with season (mùa), "cho" with market (chợ), 等 (chờ) led zh.
-- 2. "con" before an animal no longer costs the head penalty: dog's "con chó" scored 0.15 under
--    pooch's "chó". vi_head also strips "căn" and "ngôi" before a short list of nouns, so
--    house's "căn nhà" answers "nhà"; it listed home, place, casa, door, yard, housekeeping,
--    chore and housework, and no house.
-- 3. A term only slang, obsolete, archaic, dated, rare, dialect, vulgar, offensive or
--    derogatory senses write scores 0.3 lower (lex.gloss_terms.register_marked; zh reads the
--    qualifier in gloss_en). An A1-B2 or HSK1-4 entry gains 0.1 and wins ties. A form whose
--    lemma is also listed is dropped: drank beside drink, gusta beside gustar.
--
-- Measured on production on 2026-10-06 in rolled-back transactions, 75 queries by 3
-- languages, a cell scored by the summed positions of every answer a teacher accepts: 37
-- improved, 188 unchanged, 0 worsened; the accepted answer leads 191 cells instead of 176.
--
-- Rows keep their old score until lex.gloss_terms_reload rebuilds their entry. Rebuild in
-- batches, resumable, one transaction each: 114,832 entries, 419,914 rows. Measured: 4,000
-- entries in 1.2 s and 33 MB, the 3,212 densest in 29.7 s and 59 MB (0121's body 29.3 s).
--   select format('select lex.gloss_terms_reload(%L::text[]);', array_agg(entry_id))
--   from (select entry_id, (row_number() over (order by entry_id) - 1) / 1000 as b
--         from (select distinct entry_id from lex.gloss_terms where register_marked is null) d) t
--   group by b order by b \gexec
--   vacuum analyze lex.gloss_terms;
--
-- TO ROLL BACK: replay 0121's lex.gloss_terms_reload and lex.search_vi, restore 0048's
-- lex.vi_head, then alter table lex.gloss_terms drop column register_marked and rebuild.
--
-- reviewed-destructive: the delete inside gloss_terms_reload is the existing rebuild of
-- derived rows, unchanged from 0121.

set lock_timeout = '5s';
set statement_timeout = '900s';

alter table lex.gloss_terms add column if not exists register_marked boolean;

comment on column lex.gloss_terms.register_marked is
  'True when every sense writing the term is slang, obsolete, archaic, dated, rare, dialect, vulgar, offensive or derogatory, or for zh carries such a qualifier or "classifier for" in gloss_en; null on rows not rebuilt since 0150.';
comment on column lex.gloss_terms.head is
  'True when the term was produced by stripping a leading word that changes or blurs the meaning, such as "việc", "cái" or "con" in "con tin"; scores lower. "con" before an animal and "căn" or "ngôi" before a building leave it false.';

-- "căn" and "ngôi" are classifiers only before these nouns; elsewhere they begin
-- Sino-Vietnamese words: căn bản, căn cứ, căn bậc hai, ngôi thứ ba. Toned only: "can
-- trường" (gan dạ) is not "trường".
create or replace function lex.vi_head(t text)
returns text
language sql
immutable parallel safe
set search_path = lex, extensions, public
as $$
  select regexp_replace(
    regexp_replace(
      coalesce(t, ''),
      '^(con|cái|cai|chiếc|chiec|quyển|quyen|cuốn|cuon|ngọn|ngon|đống|bức|buc|tấm|tam|loại|loai|kiểu|kieu|việc|viec|cuộc|cuoc|nền|quả|trái|cây|món|sự|đồ|bộ|hạt|viên|hòn|cách)\s+',
      ''
    ),
    '^(căn|ngôi)\s+(?=(nhà|phòng|bếp|sao|đền|chùa|làng|mộ|trường)(\s|$))',
    ''
  )
$$;

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

  insert into lex.gloss_terms (entry_id, lang, term, term_una, head, sense_order, sense_rank, register_marked)
  select entry_id, lang, term,
         lower(extensions.immutable_unaccent(term)),
         -- False as soon as one gloss writes the term itself, which is the stronger claim.
         bool_and(head),
         min(sense_order),
         min(sense_rank),
         -- False as soon as one plain sense writes the term.
         bool_and(marked)
  from (
    select s.entry_id, e.lang, v.term, v.head, s.sense_order, r.sense_rank,
           (coalesce(s.register, '') ~ '\m(slang|obsolete|archaic|dated|rare|dialect|dialectal|vulgar|offensive|derogatory)\M'
            -- CC-CEDICT writes the register inside the English gloss, not in a column.
            or (e.lang = 'zh' and coalesce(s.gloss_en, '') ~* '\((dialect|slang|Internet slang|archaic|old|obsolete|vulgar|literary|classical|derog\.)\)|^classifier for|^(old )?variant of')) as marked
    from lex.senses s
    join lex.entries e on e.id = s.entry_id
    -- The place `rankSenses` (lib/dictionary/textQuality.ts) gives the sense on its page, in
    -- an entry that ranks a sense by sense_frequency. sense_frequency is a band within a part
    -- of speech, not a rank: when has five senses at "1", and its noun sense 13 "thời gian"
    -- would otherwise score as sense 1.
    left join (
      select x.id,
             (row_number() over (
                partition by x.entry_id
                order by coalesce(x.register, '') ~ '\m(obsolete|archaic|dated|rare|vulgar|offensive|dialectal)\M',
                         case when x.sense_frequency ~ '^[1-5]$' then x.sense_frequency::int end nulls last,
                         x.gloss_vi is null, x.sense_order))::smallint as sense_rank
      from lex.senses x
      where (p_entries is null or x.entry_id = any (p_entries))
        and x.entry_id in (select y.entry_id from lex.senses y
                           where y.sense_frequency ~ '^[1-5]$' and (p_entries is null or y.entry_id = any (p_entries)))
    ) r on r.id = s.id
    cross join lateral (
      select btrim(regexp_replace(lower(part), '\s*\(.*$', ''), ' .,;:!?') as base
      -- A closed parenthesis goes before the split, so a comma inside it cuts nothing.
      from unnest(regexp_split_to_array(regexp_replace(s.gloss_vi, '\s*\([^()]*\)', '', 'g'), '[,;]')) as part
    ) b
    -- "con" is a pure classifier only before an animal: "con chó" is "chó", but "con tin"
    -- (hostage), "con cái" and "con bạc" are other words. Animals that are also another
    -- common word (báo, công, cú, cò, mực, rắn, sâu) keep the penalty.
    cross join lateral (values (b.base, false),
                               (lex.vi_head(b.base),
                                b.base !~ '^(căn|ngôi)\s'
                                and b.base !~ '^con (chó|mèo|gà|vịt|ngỗng|cá|bò|trâu|lợn|heo|ngựa|lừa|dê|cừu|thỏ|chuột|chim|khỉ|voi|hổ|cọp|gấu|sói|cáo|hươu|nai|ếch|rùa|cua|tôm|ốc|ong|kiến|muỗi|ruồi|bướm|nhện|dơi|sóc|nhím|sư tử|cá sấu|lạc đà|hà mã|vẹt|quạ|đại bàng|bồ câu|chim sẻ)(\s|$)')) as v(term, head)
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
            -- "cho" is a word in its own right, so it leads; chợ, chờ and chó follow it,
            -- since the query may also be one of them typed without marks.
            case when g.term = q.raw                  then 4.0
                 when g.term_una = q.una              then 3.9
                 when g.term = q.raw_head             then 3.7
                 when g.term_una = q.una_head         then 3.6
                 else 3.2 end
        end)
        - (case when g.head then 0.15 else 0.0 end)
        -- Slang or an obsolete sense is a weaker answer than a plain one: "tiền" listed
        -- rocks, chips and nuggets beside money.
        - (case when g.register_marked then 0.3 else 0.0 end)
        -- A gloss deep inside a long entry is a weaker answer than sense 1 of the right
        -- word: "bau troi" is sense 13 of element and sense 28 of blue. A sense its page
        -- places nearer the top counts at that place.
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
  -- A prefix-only row survives only where nothing matched a whole term anywhere, which is
  -- what a half-typed word looks like.
  eligible as (
    select t.* from (
      select
        b.*, fe.headword, fe.form_of, fe.frequency_rank,
        -- A learner's level word before a rarer synonym: dog before pooch, 去 before 于.
        coalesce(fe.level in ('A1', 'A2', 'B1', 'B2', 'HSK1', 'HSK2', 'HSK3', 'HSK4'), false) as core,
        bool_or(b.whole) over () as any_whole
      from best b
      join lex.entries fe on fe.id = b.entry_id
      where b.hit_rank >= 2.5
    ) t
    where t.whole or not t.any_whole
  ),
  -- One quota per language, so a strong language cannot take the whole budget.
  per_lang as (
    select * from (
      select
        x.entry_id, x.sense_order, x.score,
        row_number() over (partition by x.hit_lang
                           order by x.score desc, x.core desc, x.frequency_rank asc nulls last, x.entry_id)
          as rn
      from (select y.*, (y.hit_rank + case when y.core then 0.1 else 0.0 end)::real as score
            from eligible y) x
      -- A form listed beside its lemma repeats it: drank beside drink, gusta beside gustar.
      where not (x.form_of is not null
                 and exists (select 1 from eligible l
                             where l.hit_lang = x.hit_lang and l.headword = x.form_of
                               -- thank and thanks each name the other as their lemma.
                               and l.form_of is distinct from x.headword))
    ) t
    where rn <= p_limit
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
    r.score
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
  order by r.score desc, r.rn;
end;
$function$;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261005000150', 'search_vi_learner_order')
on conflict (version) do nothing;
