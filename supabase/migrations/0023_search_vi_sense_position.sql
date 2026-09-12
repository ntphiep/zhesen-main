-- Rank a Vietnamese query by where in the entry the matching meaning sits.
--
-- Searching "con mèo" answered with `car` before `cat`. Both carry a gloss that
-- is exactly "con mèo", so both sat in the 5.0 tier and the frequency tie-break
-- decided it: car is rank 334, cat is 1,713. But cat's is sense 1 and car's is
-- sense 19, glossing "Deliberate misspelling of cat" — a novelty the dictionary
-- records, not what anyone typing "con mèo" wants. The same shape put 企业
-- (sense 2) at the top of "nhà" and salud (sense 4) at the top of "xin chào".
--
-- The penalty decays with the square root of the sense position and is capped at
-- 0.4, below the 0.5 diacritic bonus and well below the 1.0 gap between score
-- tiers, so it only ever reorders entries that already matched equally well.
--
-- Both branches of the function are changed identically. They are near-duplicates
-- on purpose (see the comment inside about why the two strategies cannot share a
-- plan), which makes changing only one of them the easy mistake here; this body
-- was generated from the live definition with the same two edits applied to each.

CREATE OR REPLACE FUNCTION lex.search_vi(p_q text, p_langs text[] DEFAULT NULL::text[], p_limit integer DEFAULT 20)
 RETURNS TABLE(id text, lang text, headword text, traditional text, level text, frequency_rank integer, attributes jsonb, pos text, gloss_vi text, gloss_en text, ipa text, audio_url text, rank real)
 LANGUAGE plpgsql
 STABLE
AS $function$
-- The RETURNS TABLE column names (pos, gloss_vi, lang, ...) also become plpgsql
-- variables and would shadow the identically named table columns.
#variable_conflict use_column
declare
  v_norm text := lower(extensions.immutable_unaccent(trim(p_q)));
begin
  -- A one- or two-syllable Vietnamese query is a substring of a huge share of the
  -- glosses: "ăn" normalises to "an", which sits inside bàn, cản, than and 48,675
  -- senses in total. Matching on a word boundary instead cuts that to 1,724 and
  -- the hits are the ones a reader actually meant.
  --
  -- The two strategies live in separate statements rather than one query with a
  -- CASE or an OR. Inside a plain SQL function the planner has to build one plan
  -- covering both, which either hides the `%` operator from
  -- idx_lex_senses_gloss_vi_trgm or drags the unused branch along; measured both
  -- ways, each cost the other strategy roughly two to three hundred milliseconds.
  if length(v_norm) < 4 and v_norm ~ '^[a-z0-9 ]+$' then
    return query
with q as (
    select
      lower(extensions.immutable_unaccent(trim(p_q))) as q_norm
  ),
  -- Best-scoring sense per entry against the curated, sense-level gloss_vi. The
  -- language filter is applied here rather than at the end: without it every call
  -- scanned all 178k senses and the three per-language calls each repeated the
  -- same work, which took "ăn" to roughly six seconds.
  sense_hit as (
    select
      s.entry_id, s.pos, s.gloss_vi, s.sense_order,
      greatest(
        case when s.gloss_vi_normalized = (select q_norm from q) then 5.0
             -- A gloss lists its senses comma-separated, so a query that fills one
             -- of them whole means the word means that: 吃 "ăn, tiêu thụ" answers
             -- "ăn", while 就 "ăn kèm, nhắm với" only happens to start with it.
             when s.gloss_vi_normalized ~ ('(^|[,;] *)' || (select q_norm from q) || '( *[,;]|$)') then 4.5
             when s.gloss_vi_normalized like (select q_norm from q) || '%' then 4.0
             when s.gloss_vi_normalized like '%' || (select q_norm from q) || '%' then 3.0
             else 0 end,
        -- Trigram similarity says nothing useful about a two-character query, and
        -- computing it for every candidate row is what made short queries slow.
        0
      ) as score
    from lex.senses s
    join lex.entries se on se.id = s.entry_id
    where (select q_norm from q) <> ''
      and (p_langs is null or se.lang::text = any(p_langs))
      and s.gloss_vi_normalized is not null
      -- Written as two flat alternatives rather than a CASE: wrapping the `%`
      -- operator inside CASE hides it from the planner, which then stops using
      -- idx_lex_senses_gloss_vi_trgm and makes long queries slower than before.
      and s.gloss_vi_normalized ~ ('(^|[^[:alnum:]])' || (select q_norm from q) || '([^[:alnum:]]|$)')
  ),
  best_sense as (
    select distinct on (entry_id) entry_id, pos, gloss_vi, score, sense_order
    from sense_hit
    order by entry_id, score desc, sense_order asc
  ),
  -- Entries whose broader gloss_vi_all covers the query even though no single
  -- sense row does. A full-element match ("nhan duoc" as one whole array item)
  -- ranks close to a curated exact match; a bare substring ranks low since it can
  -- land inside an unrelated longer meaning.
  attr_hit as (
    select
      e.id as entry_id,
      case when e.gloss_vi_all_normalized like '%"' || (select q_norm from q) || '"%' then 3.5
           else 1.0 end as score
    from lex.entries e
    where (select q_norm from q) <> ''
      and (p_langs is null or e.lang::text = any(p_langs))
      and e.gloss_vi_all_normalized is not null
      and e.gloss_vi_all_normalized ~ ('(^|[^[:alnum:]])' || (select q_norm from q) || '([^[:alnum:]]|$)')
  ),
  candidates as (
    select entry_id from best_sense
    union
    select entry_id from attr_hit
  ),
  -- Rank and cut to p_limit before touching pronunciations or the entry's own
  -- first sense, so those lookups run for the handful of rows actually returned
  -- instead of for every candidate.
  ranked as (
    select
      e.id, e.lang::text as lang, e.headword, e.traditional, e.level,
      e.frequency_rank, e.attributes,
      bs.pos as hit_pos, bs.gloss_vi as hit_gloss_vi,
      (greatest(coalesce(bs.score, 0), coalesce(ah.score, 0))
       -- A gloss carrying the query with its diacritics intact answers the question
       -- better than one that only matches once they are folded away: "ăn" should
       -- reach 吃 before 印象 ("ấn tượng") or 保险 ("an toàn"), which collapse to the
       -- same "an". Worth more than the frequency tie-breaker, and the two together
       -- stay under the 1.0 gap between score tiers.
       + case when lower(coalesce(bs.gloss_vi, '')) like '%' || lower(trim(p_q)) || '%'
              then 0.5 else 0 end
       + 0.3 / sqrt(greatest(coalesce(e.frequency_rank, 100000), 1)::float8)
       -- Where in the entry the matching gloss sits. "con mèo" is sense 1 of cat
       -- and sense 19 of car, where it glosses "deliberate misspelling of cat". car
       -- is the more frequent word, so without this it answered the query first.
       -- Capped at 0.4 so it only reorders inside a score tier, never across one.
       - 0.4 * (1 - 1 / sqrt(greatest(coalesce(bs.sense_order, 1), 1)::float8)))::real as rank
    from lex.entries e
    join candidates c on c.entry_id = e.id
    left join best_sense bs on bs.entry_id = e.id
    left join attr_hit ah on ah.entry_id = e.id
    order by rank desc
    limit p_limit
  )
  select
    r.id, r.lang, r.headword, r.traditional, r.level, r.frequency_rank, r.attributes,
    coalesce(r.hit_pos, ps.pos) as pos,
    coalesce(r.hit_gloss_vi, ps.gloss_vi) as gloss_vi,
    ps.gloss_en,
    (select p.ipa from lex.pronunciations p
      where p.entry_id = r.id and p.ipa is not null
      order by case when r.lang = 'en' and lower(p.accent) like '%us%' then 0
                    when r.lang = 'en' and lower(p.accent) like '%uk%' then 1
                    else 2 end
      limit 1) as ipa,
    (select p.audio_url from lex.pronunciations p
      where p.entry_id = r.id and p.audio_url is not null limit 1) as audio_url,
    r.rank
  from ranked r
  left join lateral (
    select s.pos, s.gloss_vi, s.gloss_en
    from lex.senses s
    where s.entry_id = r.id
    order by s.sense_order asc
    limit 1
  ) ps on true
  order by r.rank desc;
  else
    return query
with q as (
    select
      lower(extensions.immutable_unaccent(trim(p_q))) as q_norm
  ),
  -- Best-scoring sense per entry against the curated, sense-level gloss_vi. The
  -- language filter is applied here rather than at the end: without it every call
  -- scanned all 178k senses and the three per-language calls each repeated the
  -- same work, which took "ăn" to roughly six seconds.
  sense_hit as (
    select
      s.entry_id, s.pos, s.gloss_vi, s.sense_order,
      greatest(
        case when s.gloss_vi_normalized = (select q_norm from q) then 5.0
             -- A gloss lists its senses comma-separated, so a query that fills one
             -- of them whole means the word means that: 吃 "ăn, tiêu thụ" answers
             -- "ăn", while 就 "ăn kèm, nhắm với" only happens to start with it.
             when s.gloss_vi_normalized ~ ('(^|[,;] *)' || (select q_norm from q) || '( *[,;]|$)') then 4.5
             when s.gloss_vi_normalized like (select q_norm from q) || '%' then 4.0
             when s.gloss_vi_normalized like '%' || (select q_norm from q) || '%' then 3.0
             else 0 end,
        -- Trigram similarity says nothing useful about a two-character query, and
        -- computing it for every candidate row is what made short queries slow.
        coalesce(extensions.similarity(s.gloss_vi_normalized, (select q_norm from q)), 0) * 1.2
      ) as score
    from lex.senses s
    join lex.entries se on se.id = s.entry_id
    where (select q_norm from q) <> ''
      and (p_langs is null or se.lang::text = any(p_langs))
      and s.gloss_vi_normalized is not null
      -- Written as two flat alternatives rather than a CASE: wrapping the `%`
      -- operator inside CASE hides it from the planner, which then stops using
      -- idx_lex_senses_gloss_vi_trgm and makes long queries slower than before.
      and ( s.gloss_vi_normalized like '%' || (select q_norm from q) || '%'
            or s.gloss_vi_normalized % (select q_norm from q) )
  ),
  best_sense as (
    select distinct on (entry_id) entry_id, pos, gloss_vi, score, sense_order
    from sense_hit
    order by entry_id, score desc, sense_order asc
  ),
  -- Entries whose broader gloss_vi_all covers the query even though no single
  -- sense row does. A full-element match ("nhan duoc" as one whole array item)
  -- ranks close to a curated exact match; a bare substring ranks low since it can
  -- land inside an unrelated longer meaning.
  attr_hit as (
    select
      e.id as entry_id,
      case when e.gloss_vi_all_normalized like '%"' || (select q_norm from q) || '"%' then 3.5
           else 1.0 end as score
    from lex.entries e
    where (select q_norm from q) <> ''
      and (p_langs is null or e.lang::text = any(p_langs))
      and e.gloss_vi_all_normalized is not null
      and e.gloss_vi_all_normalized like '%' || (select q_norm from q) || '%'
  ),
  candidates as (
    select entry_id from best_sense
    union
    select entry_id from attr_hit
  ),
  -- Rank and cut to p_limit before touching pronunciations or the entry's own
  -- first sense, so those lookups run for the handful of rows actually returned
  -- instead of for every candidate.
  ranked as (
    select
      e.id, e.lang::text as lang, e.headword, e.traditional, e.level,
      e.frequency_rank, e.attributes,
      bs.pos as hit_pos, bs.gloss_vi as hit_gloss_vi,
      (greatest(coalesce(bs.score, 0), coalesce(ah.score, 0))
       -- A gloss carrying the query with its diacritics intact answers the question
       -- better than one that only matches once they are folded away: "ăn" should
       -- reach 吃 before 印象 ("ấn tượng") or 保险 ("an toàn"), which collapse to the
       -- same "an". Worth more than the frequency tie-breaker, and the two together
       -- stay under the 1.0 gap between score tiers.
       + case when lower(coalesce(bs.gloss_vi, '')) like '%' || lower(trim(p_q)) || '%'
              then 0.5 else 0 end
       + 0.3 / sqrt(greatest(coalesce(e.frequency_rank, 100000), 1)::float8)
       -- Where in the entry the matching gloss sits. "con mèo" is sense 1 of cat
       -- and sense 19 of car, where it glosses "deliberate misspelling of cat". car
       -- is the more frequent word, so without this it answered the query first.
       -- Capped at 0.4 so it only reorders inside a score tier, never across one.
       - 0.4 * (1 - 1 / sqrt(greatest(coalesce(bs.sense_order, 1), 1)::float8)))::real as rank
    from lex.entries e
    join candidates c on c.entry_id = e.id
    left join best_sense bs on bs.entry_id = e.id
    left join attr_hit ah on ah.entry_id = e.id
    order by rank desc
    limit p_limit
  )
  select
    r.id, r.lang, r.headword, r.traditional, r.level, r.frequency_rank, r.attributes,
    coalesce(r.hit_pos, ps.pos) as pos,
    coalesce(r.hit_gloss_vi, ps.gloss_vi) as gloss_vi,
    ps.gloss_en,
    (select p.ipa from lex.pronunciations p
      where p.entry_id = r.id and p.ipa is not null
      order by case when r.lang = 'en' and lower(p.accent) like '%us%' then 0
                    when r.lang = 'en' and lower(p.accent) like '%uk%' then 1
                    else 2 end
      limit 1) as ipa,
    (select p.audio_url from lex.pronunciations p
      where p.entry_id = r.id and p.audio_url is not null limit 1) as audio_url,
    r.rank
  from ranked r
  left join lateral (
    select s.pos, s.gloss_vi, s.gloss_en
    from lex.senses s
    where s.entry_id = r.id
    order by s.sense_order asc
    limit 1
  ) ps on true
  order by r.rank desc;
  end if;
end;
$function$
;

grant execute on function lex.search_vi(text, text[], int) to anon, authenticated, service_role;
