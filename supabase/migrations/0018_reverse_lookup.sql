-- Reverse (Vietnamese -> en/es/zh) lookup, plus a trigram-based "did you mean"
-- suggester. Additive only, mirrors the style of 0016_search.sql: new generated
-- columns, new indexes, new functions. No existing column/index/function/row is
-- touched.
--
-- Data survey behind the design choices below (run against the live DB before
-- writing this migration):
--   * 30,833 of 178,701 lex.senses rows have gloss_vi populated (one curated
--     Vietnamese gloss per sense, tied to a sense_order/pos).
--   * 20,073 lex.entries rows additionally carry attributes->'gloss_vi_all', a
--     jsonb array of *all* Vietnamese meanings for that entry (e.g. en:go has 23
--     meanings there but only 1 tied to an actual sense row) -- a materially
--     richer source than senses.gloss_vi alone, so both are searched.
--   * lex.entries.entry_type is 'word' for 100% of rows (single distinct value),
--     so it carries no filterable signal; not surfaced by lex.search_vi and
--     deliberately left out of the app-level filter UI (see components/search).
--   * extensions.unaccent already strips Vietnamese tone marks correctly
--     (verified: unaccent('nhận được') -> 'nhan duoc'), so the same
--     extensions.immutable_unaccent() wrapper from 0016 covers "gõ thiếu dấu"
--     without a new dictionary/config.

-- Per-sense Vietnamese gloss, unaccented + lowercased, for diacritic-insensitive
-- matching ("nhan duoc" -> "nhận được"). NULL when gloss_vi is null
-- (immutable_unaccent is STRICT, see 0016).
alter table lex.senses add column if not exists gloss_vi_normalized text generated always as (
  lower(extensions.immutable_unaccent(gloss_vi))
) stored;

create index if not exists idx_lex_senses_gloss_vi_trgm on lex.senses using gin (gloss_vi_normalized extensions.gin_trgm_ops);

-- Whole-entry Vietnamese meanings (attributes->>'gloss_vi_all', e.g.
-- '["nhận được", "tiếp đón", ...]'), same normalization. Kept as the raw
-- JSON-array text rather than exploded into rows: a generated column must be an
-- immutable expression of the row's own columns (no subqueries/set-returning
-- functions), and the surrounding brackets/quotes/commas don't affect substring
-- or exact-element matching (see lex.search_vi below).
alter table lex.entries add column if not exists gloss_vi_all_normalized text generated always as (
  lower(extensions.immutable_unaccent(attributes ->> 'gloss_vi_all'))
) stored;

create index if not exists idx_lex_entries_gloss_vi_all_trgm on lex.entries using gin (gloss_vi_all_normalized extensions.gin_trgm_ops);

-- Vietnamese -> en/es/zh reverse lookup. Same return shape as lex.search (see
-- 0016_search.sql) so lib/dictionary can reuse the same row parser/mapper.
-- Ranking, matching lex.search's approach: exact whole-gloss match beats a
-- prefix beats a substring beats a fuzzy trigram match; the winning score is
-- then scaled by frequency_rank so common words surface first.
create or replace function lex.search_vi(p_q text, p_langs text[] default null, p_limit int default 20)
returns table (
  id text, lang text, headword text, traditional text, level text, frequency_rank int,
  attributes jsonb, pos text, gloss_vi text, gloss_en text, ipa text, audio_url text, rank real
)
language sql
stable
as $$
  with q as (
    select lower(extensions.immutable_unaccent(trim(p_q))) as q_norm
  ),
  -- Best-scoring sense per entry against the curated, sense-level gloss_vi.
  sense_hit as (
    select
      s.entry_id, s.pos, s.gloss_vi, s.sense_order,
      greatest(
        case when s.gloss_vi_normalized = (select q_norm from q) then 5.0
             when s.gloss_vi_normalized like (select q_norm from q) || '%' then 4.0
             when s.gloss_vi_normalized like '%' || (select q_norm from q) || '%' then 3.0
             else 0 end,
        coalesce(extensions.similarity(s.gloss_vi_normalized, (select q_norm from q)), 0) * 1.2
      ) as score
    from lex.senses s
    where (select q_norm from q) <> ''
      and s.gloss_vi_normalized is not null
      and (
        s.gloss_vi_normalized like '%' || (select q_norm from q) || '%'
        or s.gloss_vi_normalized % (select q_norm from q)
      )
  ),
  best_sense as (
    select distinct on (entry_id) entry_id, pos, gloss_vi, score
    from sense_hit
    order by entry_id, score desc, sense_order asc
  ),
  -- Entries whose broader gloss_vi_all covers the query even though no single
  -- sense row does. A full-element match ("nhan duoc" as one whole array item)
  -- ranks close to a curated exact match; a bare substring ranks low since it
  -- can land inside an unrelated longer meaning.
  attr_hit as (
    select
      e.id as entry_id,
      case when e.gloss_vi_all_normalized like '%"' || (select q_norm from q) || '"%' then 3.5
           else 1.0 end as score
    from lex.entries e
    where (select q_norm from q) <> ''
      and e.gloss_vi_all_normalized is not null
      and e.gloss_vi_all_normalized like '%' || (select q_norm from q) || '%'
  ),
  candidates as (
    select entry_id from best_sense
    union
    select entry_id from attr_hit
  ),
  primary_sense as (
    select distinct on (entry_id) entry_id, pos, gloss_vi, gloss_en
    from lex.senses
    order by entry_id, sense_order asc
  )
  select
    e.id, e.lang::text, e.headword, e.traditional, e.level, e.frequency_rank, e.attributes,
    coalesce(bs.pos, ps.pos) as pos,
    coalesce(bs.gloss_vi, ps.gloss_vi) as gloss_vi,
    ps.gloss_en as gloss_en,
    (select p.ipa from lex.pronunciations p where p.entry_id = e.id and p.ipa is not null
       order by case when e.lang::text = 'en' and lower(p.accent) like '%us%' then 0
                      when e.lang::text = 'en' and lower(p.accent) like '%uk%' then 1
                      else 2 end
       limit 1) as ipa,
    (select p.audio_url from lex.pronunciations p where p.entry_id = e.id and p.audio_url is not null limit 1) as audio_url,
    -- Frequency is a tie-breaker, not a multiplier. Multiplying let a rank-1 word
    -- like "the" outrank an exact match on "get", because 1/sqrt(1) beat a
    -- perfect score divided by sqrt(50). The bonus stays under the 1.0 gap
    -- between score tiers, so match quality always wins first.
    (greatest(coalesce(bs.score, 0), coalesce(ah.score, 0))
     + 0.5 / sqrt(greatest(coalesce(e.frequency_rank, 100000), 1)::float8))::real as rank
  from lex.entries e
  join candidates c on c.entry_id = e.id
  left join best_sense bs on bs.entry_id = e.id
  left join attr_hit ah on ah.entry_id = e.id
  left join primary_sense ps on ps.entry_id = e.id
  where (p_langs is null or e.lang::text = any(p_langs))
  order by rank desc
  limit p_limit;
$$;

grant execute on function lex.search_vi(text, text[], int) to anon, authenticated, service_role;

-- "Did you mean...?" suggestions for a query with zero hits in either direction.
-- Trigram-nearest headwords (forward) and Vietnamese glosses (reverse).
--
-- Deliberately uses a *looser* cutoff (similarity > 0.15) than lex.search/
-- lex.search_vi's own trigram fallback (the `%` operator's default
-- pg_trgm.similarity_threshold of 0.3, unchanged here so it stays index-
-- accelerated on the hot path). Verified this matters: lex.search('recieve')
-- already returns en:receive via its own `%` branch (similarity 0.333), so a
-- suggester using the *same* 0.3 cutoff would only ever fire for queries with
-- no candidate above 0.3 -- i.e. it would almost never have anything to add
-- beyond "no results". Scanning at 0.15 instead directly with `similarity()`
-- (not index-accelerated, but this function only runs on the rare zero-result
-- path, and lex.entries/lex.senses are small enough -- ~35k/~179k rows -- for a
-- full scan there to be cheap) surfaces the weaker matches the main search
-- intentionally excludes as noise.
create or replace function lex.suggest(p_q text, p_limit int default 5)
returns table (id text, lang text, headword text, gloss_vi text, kind text, score real)
language sql
stable
as $$
  with q as (
    select lower(extensions.immutable_unaccent(trim(p_q))) as q_norm
  ),
  fwd as (
    select
      e.id, e.lang::text, e.headword,
      (select s.gloss_vi from lex.senses s where s.entry_id = e.id order by s.sense_order limit 1) as gloss_vi,
      'headword'::text as kind,
      extensions.similarity(e.headword_normalized, (select q_norm from q))::real as score
    from lex.entries e
    where (select q_norm from q) <> ''
      and extensions.similarity(e.headword_normalized, (select q_norm from q)) > 0.15
  ),
  rev as (
    select
      s.entry_id as id, e.lang::text, e.headword, s.gloss_vi,
      'gloss_vi'::text as kind,
      extensions.similarity(s.gloss_vi_normalized, (select q_norm from q))::real as score
    from lex.senses s
    join lex.entries e on e.id = s.entry_id
    where (select q_norm from q) <> ''
      and s.gloss_vi_normalized is not null
      and extensions.similarity(s.gloss_vi_normalized, (select q_norm from q)) > 0.15
  ),
  combined as (
    select * from fwd
    union all
    select * from rev
  ),
  deduped as (
    select distinct on (id) id, lang, headword, gloss_vi, kind, score
    from combined
    order by id, score desc
  )
  select id, lang, headword, gloss_vi, kind, score
  from deduped
  order by score desc
  limit p_limit;
$$;

grant execute on function lex.suggest(text, int) to anon, authenticated, service_role;
