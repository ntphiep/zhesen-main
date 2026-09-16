-- A Vietnamese query containing a bracket makes the reverse lookup fail.
--
-- `lex.search_vi` builds a regular expression by concatenating the normalized query
-- into a pattern (0023_search_vi_sense_position.sql:171), so whatever the visitor
-- typed is read as regex source. Measured against the live database:
--
--   search_vi('a((')       -> 400, 2201B, "invalid regular expression: parentheses () not balanced"
--   search_vi('(a)(b)(c')  -> 400, 2201B, same
--   search_vi('a{9999999}')-> 400, 2201B, "invalid repetition count(s)"
--
-- Only the long-query branch is affected. The short branch is entered under
-- `length(v_norm) < 4 and v_norm ~ '^[a-z0-9 ]+$'` (0023:40), so its two regexes can
-- only ever see letters, digits and spaces. The long branch has no such guard and
-- exactly one regex, the comma-separated-sense test in the scoring expression.
--
-- It fails intermittently, which is what hid it. The regex sits in the SELECT list,
-- not the WHERE clause, so it is evaluated only for rows that already passed the
-- trigram filter: `search_vi('((((')` returns 200 with an empty array because
-- nothing matched, while `search_vi('a((')` throws because something did.
--
-- What the visitor sees is not even an error about their query. `searchAllLanguagesVi`
-- rethrows (lib/dictionary/search.ts:56), `app/dictionary/search/route.ts:86` has no
-- catch around `cachedSearch`, so the route 500s, and `fetchSearch` turns any non-OK
-- status into `{ status: 'refused' }` (lib/dictionary/searchClient.ts:25), which the
-- search box renders as "Đang có quá nhiều lượt tra cứu."
--
-- The fix escapes the regex metacharacters before the concatenation. It is applied in
-- the long branch only, and nothing else in this function changes: the body below is
-- 0023's, with `q_re` added to the long branch's `q` CTE and used at the one site.
-- The short branch is reproduced byte for byte.
--
-- Escaping rather than dropping the regex, because the pattern earns its keep: it is
-- what lets 吃 "ăn, tiêu thụ" answer "ăn" while 就 "ăn kèm, nhắm với" does not
-- (0023:55-58).
--
-- HOW TO VERIFY, before and after. One PostgREST call reproduces it; substitute the
-- project URL and the anon key:
--
--   printf '%s' '{"p_q":"a((","p_langs":["en","zh","es"],"p_limit":24}' > body.json
--   curl -s -o - -w '\nhttp=%{http_code}\n' \
--     -X POST "$SUPABASE_URL/rest/v1/rpc/search_vi" \
--     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
--     -H 'Content-Profile: lex' -H 'Accept-Profile: lex' \
--     -H 'Content-Type: application/json' --data-binary @body.json
--
-- Before: http=400 with
--   {"code":"2201B","message":"invalid regular expression: parentheses () not balanced"}
-- After: http=200 with a JSON array, empty or not. Repeat with "(a)(b)(c" and
-- "a{9999999}", which fail the same way today, and with "hợp đồng" and "ăn" to check
-- that ordinary queries still return what they returned before.
--
-- MEASURED AFTER. The escape set was checked against fourteen inputs offline: every
-- resulting pattern compiles and still matches its own literal text. That check used
-- Python's regex engine, which is not Postgres ARE, so it can catch a wrong character
-- class but cannot stand in for running the migration. Run it on a branch database
-- first. This is the riskiest of the files in this batch, because changing one
-- expression means re-emitting all 230 lines of the function body.
--
-- TO ROLL BACK. Re-apply 0023_search_vi_sense_position.sql, which is the definition
-- this replaces byte for byte apart from `q_re`. No index, column or row is touched
-- and the signature is unchanged.

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
    -- This branch needs no escaping: the guard above admits only [a-z0-9 ], none of
    -- which is a regex metacharacter.
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
      lower(extensions.immutable_unaccent(trim(p_q))) as q_norm,
      -- The same string with every regex metacharacter escaped. Only the scoring
      -- pattern below reads regex source; the LIKE tests treat the raw value as a
      -- pattern too, but `%` and `_` there only widen the match and never raise.
      -- `-` sits last inside the bracket expression and `\\` first, so both are
      -- literal; the replacement `\\\1` writes a backslash in front of whatever
      -- matched.
      regexp_replace(
        lower(extensions.immutable_unaccent(trim(p_q))),
        '([\\^$.|?*+(){}\[\]-])', '\\\1', 'g'
      ) as q_re
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
             when s.gloss_vi_normalized ~ ('(^|[,;] *)' || (select q_re from q) || '( *[,;]|$)') then 4.5
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
