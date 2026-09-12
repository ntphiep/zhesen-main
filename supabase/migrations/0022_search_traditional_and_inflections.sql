-- Two whole classes of query that returned nothing, and the scan shape that made
-- adding them affordable.
--
-- Traditional characters. 2,358 of the 4,045 Chinese entries carry a
-- `traditional` form and `lex.search` selected the column without ever matching
-- on it, so 謝謝 found nothing while 谢谢 found the word. Anyone reading
-- Taiwanese or Hong Kong material types the traditional form.
--
-- Inflected forms. `lex.inflections` holds 352,332 rows -- 306,392 Spanish and
-- 45,940 English -- and the search function never consulted it. Typing
-- "corriendo" returned "corriente" at rank 2.23 from a trigram guess, never
-- "correr", which is the word the learner was reading. Conjugated verbs are most
-- of what a Spanish learner meets in a sentence.
--
-- The inflection match cannot join into the old WHERE clause. Postgres answers a
-- chain of ORs from indexes only while every arm is a predicate on the one table
-- it is scanning; an arm that reaches into `lex.inflections` -- as a join or as a
-- subplan -- forces the whole thing into a sequential scan. Measured both ways:
-- each read all 36,361 entries, and the one-letter query "a" took 7.8 to 11.4
-- seconds.
--
-- So the arms are now a UNION of single-table lookups, each one index-driven, and
-- the ranking runs against that candidate set. Ranking also happens before the
-- per-row lookups for sense, pronunciation and audio: those now run for the rows
-- that made the limit rather than for every candidate, which is the same shape
-- `lex.search_vi` was given in 0018 for the same reason.
--
-- Additive only: two indexes and a new body for lex.search. No column, row or
-- existing index is touched.

-- Matches a character anywhere in the traditional form, the same way the
-- headword index does, so 謝 finds 謝謝 and not only the whole word.
create index if not exists idx_lex_entries_traditional_pgroonga
  on lex.entries using pgroonga (traditional);

-- Normalized in the index expression rather than in a stored column: the table is
-- the second largest in the schema and this needs no space in it. Unaccented so a
-- query typed "comio" still reaches "comió" and from there "comer".
create index if not exists idx_lex_infl_form_norm
  on lex.inflections (lower(extensions.immutable_unaccent(form_text)));

create or replace function lex.search(p_q text, p_langs text[] default null, p_limit int default 20)
returns table (
  id text, lang text, headword text, traditional text, level text, frequency_rank int,
  attributes jsonb, pos text, gloss_vi text, gloss_en text, ipa text, audio_url text, rank real
)
language sql
stable
as $$
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
    from lex.inflections i, q
    where q.q_norm <> ''
      and lower(extensions.immutable_unaccent(i.form_text)) = q.q_norm
  ),
  -- One arm per way of matching, each a predicate on a single table so each can
  -- use its own index.
  --
  -- Each arm keeps only its most frequent matches. A single letter matches 2,558
  -- headwords by prefix and ranking all of them is most of the cost of such a
  -- query; nothing past the first few hundred could place in a list of 24, because
  -- the score is a tier plus a frequency tie-break and the frequent words hold
  -- every tier they share. A specific query never reaches the cap.
  --
  -- The language filter has to be inside the cap, not after it. Applied after, a
  -- search narrowed to one language would be served from 500 rows chosen across
  -- all three: measured at 180 to 320 rows per language for common prefixes today,
  -- comfortably more than the 24 shown, but that is a property of the data and not
  -- something the query should depend on.
  cand as (
          (select e.id from lex.entries e, q where (p_langs is null or e.lang::text = any(p_langs)) and q.q_raw <> '' and e.headword_normalized like q.q_prefix order by e.frequency_rank nulls last limit 500)
    union (select e.id from lex.entries e, q where (p_langs is null or e.lang::text = any(p_langs)) and q.q_raw <> '' and e.lang::text in ('en', 'es') and e.headword_normalized % q.q_norm order by e.frequency_rank nulls last limit 500)
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
$$;

grant execute on function lex.search(text, text[], int) to anon, authenticated, service_role;
