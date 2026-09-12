-- Close three gaps a review found in the candidate arms of 0022.
--
-- An exact match could be cut by the cap. Every arm kept its 500 most frequent
-- rows and an entry with no `frequency_rank` sorts last, so a word that IS the
-- query could be dropped from an arm that overflowed. 1,018 English, 512 Spanish
-- and 12 Chinese entries carry no rank. Nothing is lost today, because the only
-- arm that overflows is the prefix arm and Latin-script exact matches also reach
-- the tsvector arm, which never overflows -- but that is a coincidence of the
-- current data, not a property of the query. Exact headword and exact traditional
-- are now their own uncapped arms; each is one indexed equality lookup.
--
-- The fuzzy arm was cut by the wrong measure. Its score is not a tier plus a
-- frequency tie-break like the others: it multiplies string similarity by a
-- frequency prior (see 0016), precisely so a rare word spelled almost exactly
-- like the query can beat a common word spelled loosely. Cutting the arm on
-- frequency alone discards the first kind before it is ever scored, which is the
-- case spell-checking exists for. It is cut on similarity now. Measured, the arm
-- never reaches 500 anyway: real misspellings put 7 to 93 rows through it.
--
-- The inflection arm skipped the language filter that 97aabba added to the other
-- seven. The outer query filters the result, so nothing wrong ever reached a
-- caller, but the arm still carried rows in other languages through the ranking.

CREATE OR REPLACE FUNCTION lex.search(p_q text, p_langs text[] DEFAULT NULL::text[], p_limit integer DEFAULT 20)
 RETURNS TABLE(id text, lang text, headword text, traditional text, level text, frequency_rank integer, attributes jsonb, pos text, gloss_vi text, gloss_en text, ipa text, audio_url text, rank real)
 LANGUAGE sql
 STABLE
AS $function$
  -- Referenced many times below, so Postgres materializes it and everything here
  -- is computed once. The two tsqueries belong here rather than inline: written
  -- inline they were rebuilt for every candidate row, four times each, which is
  -- what made the one-letter query "a" take over a second for 2,558 candidates.
  with q as (
    select
      trim(p_q) as q_raw,
      lower(extensions.immutable_unaccent(trim(p_q))) as q_norm,
      lower(extensions.immutable_unaccent(trim(p_q))) || '%' as q_prefix,
      lower(regexp_replace(extensions.immutable_unaccent(trim(p_q)), '\s+', '', 'g')) as q_pinyin,
      websearch_to_tsquery('lex.zhesen_en', trim(p_q)) as tq_en,
      websearch_to_tsquery('lex.zhesen_es', trim(p_q)) as tq_es
  ),
  -- Entries reachable through one of their inflected forms: "corriendo" -> correr.
  infl as (
    select distinct i.entry_id as id
    from lex.inflections i
    join lex.entries ie on ie.id = i.entry_id, q
    where q.q_norm <> ''
      and (p_langs is null or ie.lang::text = any(p_langs))
      and lower(extensions.immutable_unaccent(i.form_text)) = q.q_norm
  ),
  -- One arm per way of matching, each a predicate on a single table so each can
  -- use its own index.
  --
  -- Each arm keeps only its best 500 matches, by whichever measure that arm scores
  -- by: frequency for the arms whose score is a tier plus a frequency tie-break,
  -- similarity for the fuzzy arm, whose score multiplies the two and where cutting
  -- on frequency alone would drop the rare-but-near word a spell checker exists to
  -- find. Measured: only the prefix arm reaches 500 at all, and only for a single
  -- letter (2,558 headwords for 'a'); real misspellings put 7 to 93 rows through
  -- the fuzzy arm and the Chinese arms peak at 126.
  --
  -- The language filter has to be inside the cap, not after it. Applied after, a
  -- search narrowed to one language would be served from 500 rows chosen across
  -- all three: measured at 180 to 320 rows per language for common prefixes today,
  -- comfortably more than the 24 shown, but that is a property of the data and not
  -- something the query should depend on.
  cand as (
    -- Exact matches are never capped. Every other arm keeps only its 500 most
    -- frequent rows, and an entry with no frequency_rank sorts last, so a word
    -- that IS the query could be cut from an arm that overflowed -- 1,018 English,
    -- 512 Spanish and 12 Chinese entries carry no rank. These two sets are one
    -- indexed equality lookup each and hold a handful of rows, so there is nothing
    -- to cap.
          (select e.id from lex.entries e, q where q.q_norm <> '' and e.headword_normalized = q.q_norm)
    union (select e.id from lex.entries e, q where q.q_raw <> '' and e.traditional = q.q_raw)
    union          (select e.id from lex.entries e, q where (p_langs is null or e.lang::text = any(p_langs)) and q.q_raw <> '' and e.headword_normalized like q.q_prefix order by e.frequency_rank nulls last limit 500)
    union (select e.id from lex.entries e, q where (p_langs is null or e.lang::text = any(p_langs)) and q.q_raw <> '' and e.lang::text in ('en', 'es') and e.headword_normalized % q.q_norm order by extensions.similarity(e.headword_normalized, q.q_norm) desc limit 500)
    union (select e.id from lex.entries e, q where (p_langs is null or e.lang::text = any(p_langs)) and q.q_raw <> '' and e.lang::text = 'en' and e.search_vector @@ q.tq_en order by e.frequency_rank nulls last limit 500)
    union (select e.id from lex.entries e, q where (p_langs is null or e.lang::text = any(p_langs)) and q.q_raw <> '' and e.lang::text = 'es' and e.search_vector @@ q.tq_es order by e.frequency_rank nulls last limit 500)
    union (select e.id from lex.entries e, q where (p_langs is null or e.lang::text = any(p_langs)) and q.q_raw <> '' and e.headword &@ q.q_raw order by e.frequency_rank nulls last limit 500)
    union (select e.id from lex.entries e, q where (p_langs is null or e.lang::text = any(p_langs)) and q.q_raw <> '' and e.traditional &@ q.q_raw order by e.frequency_rank nulls last limit 500)
    union (select e.id from lex.entries e, q where (p_langs is null or e.lang::text = any(p_langs)) and q.q_pinyin <> '' and e.pinyin_toneless like q.q_pinyin || '%' order by e.frequency_rank nulls last limit 500)
    union select id from infl
  ),
  ranked as (
    select
      e.id,
      greatest(
        greatest(
          case when e.headword_normalized = q.q_norm then 4.0
               when e.headword_normalized like q.q_prefix then 3.0
               else 0 end,
          -- en/es headword_normalized keeps diacritics (e.g. "canción"), so also
          -- compare an unaccented copy for a query typed without accents.
          case when e.lang::text in ('en', 'es') and lower(extensions.immutable_unaccent(e.headword_normalized)) = q.q_norm then 4.0
               when e.lang::text in ('en', 'es') and lower(extensions.immutable_unaccent(e.headword_normalized)) like q.q_prefix then 3.0
               else 0 end,
          -- The traditional form is the same word, so an exact one scores like an
          -- exact headword; a partial one scores like the pgroonga headword tier.
          case when e.lang::text = 'zh' and e.traditional = q.q_raw then 4.0
               when e.lang::text = 'zh' and e.traditional &@ q.q_raw then 1.5
               else 0 end,
          case when e.lang::text = 'en' and e.search_vector @@ q.tq_en then ts_rank(e.search_vector, q.tq_en)
               when e.lang::text = 'es' and e.search_vector @@ q.tq_es then ts_rank(e.search_vector, q.tq_es)
               else 0 end,
          case when e.lang::text = 'zh' and e.headword &@ q.q_raw then 1.5 else 0 end,
          case when e.lang::text = 'zh' and q.q_pinyin <> '' and e.pinyin_toneless = q.q_pinyin then 3.5
               when e.lang::text = 'zh' and q.q_pinyin <> '' and e.pinyin_toneless like q.q_pinyin || '%' then 2.5
               else 0 end,
          -- Between the exact (4.0) and prefix (3.0) tiers: "corriendo" is exactly
          -- a form of "correr", but a headword that IS the query still comes first,
          -- so searching "running" keeps the entry for "running" above "run".
          case when exists (select 1 from infl where infl.id = e.id) then 3.5 else 0 end
        ) + 0.5 / sqrt(greatest(coalesce(e.frequency_rank, 100000), 1)::float8),
        -- Fuzzy matches are scored the way a spell checker does: how close the
        -- string is, weighted by how likely the word is. Trigram distance alone
        -- puts "relieve" above "receive" for the typo "recieve", because it
        -- genuinely is the closer string; frequency is what tells them apart. The
        -- prior is capped so a very common word cannot ride frequency alone, and
        -- the branch stays under the 3.0 prefix tier so a guess never outranks a
        -- word that actually starts with what was typed.
        --
        -- Structural matches above take the opposite treatment: there frequency is
        -- only a tie-breaker, because multiplying by it once put "can" ahead of an
        -- exact match on "cat".
        least(
          2.9,
          (case when e.lang::text in ('en', 'es')
                  then coalesce(extensions.similarity(e.headword_normalized, q.q_norm), 0) * 2.0
                else 0 end)
          * least(3.0, 1.0 + 50.0 / sqrt(greatest(coalesce(e.frequency_rank, 100000), 1)::float8))
        )
      )::real as rank
    from lex.entries e
    join cand on cand.id = e.id
    cross join q
    where p_langs is null or e.lang::text = any(p_langs)
    order by rank desc
    limit p_limit
  )
  select
    e.id, e.lang::text, e.headword, e.traditional, e.level, e.frequency_rank, e.attributes,
    (select s.pos from lex.senses s where s.entry_id = e.id order by s.sense_order limit 1) as pos,
    (select s.gloss_vi from lex.senses s where s.entry_id = e.id order by s.sense_order limit 1) as gloss_vi,
    (select s.gloss_en from lex.senses s where s.entry_id = e.id order by s.sense_order limit 1) as gloss_en,
    (select p.ipa from lex.pronunciations p where p.entry_id = e.id and p.ipa is not null
       order by case when e.lang::text = 'en' and lower(p.accent) like '%us%' then 0
                     when e.lang::text = 'en' and lower(p.accent) like '%uk%' then 1
                     else 2 end
       limit 1) as ipa,
    (select p.audio_url from lex.pronunciations p where p.entry_id = e.id and p.audio_url is not null limit 1) as audio_url,
    r.rank
  from ranked r
  join lex.entries e on e.id = r.id
  order by r.rank desc;
$function$
;

grant execute on function lex.search(text, text[], int) to anon, authenticated, service_role;
