-- Replace the ilike('headword', 'q%') search (EXPLAIN showed it scans the
-- (lang, frequency_rank) index and throws away ~24% of the 20k en rows per
-- query, 374ms measured on a broader unindexed variant) with proper indexes and
-- a single DB-side ranking function. This migration is additive-only: new
-- extensions, new generated columns, new indexes, new function. No existing
-- column, index, or row is touched.
--
-- Extensions live in the `extensions` schema, matching this project's existing
-- convention (pg_stat_statements/uuid-ossp/pgcrypto are already there).
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pgroonga with schema extensions;

-- unaccent() is only STABLE (confirmed via pg_proc.provolatile = 's'), so Postgres
-- rejects it inside a generated column or index expression ("functions in index
-- expression must be marked IMMUTABLE", verified by trying it). The unaccent
-- dictionary's rules are fixed at extension install time and do not change at
-- runtime, so wrapping it as IMMUTABLE is the standard, safe workaround (the
-- alternative -- a BEFORE INSERT/UPDATE trigger, per PostgreSQL's own "Triggers
-- for Automatic Updates" docs -- would need a one-off UPDATE to backfill 34k
-- existing rows, which is data-modifying DDL this migration deliberately avoids).
create or replace function extensions.immutable_unaccent(text)
returns text
language sql
immutable
parallel safe
strict
as $$
  select extensions.unaccent('extensions.unaccent', $1)
$$;

-- Custom text search configurations so a query typed without diacritics still
-- matches accented headwords/glosses ("cancion" -> "canción"). One config per
-- language because the dictionary chain (unaccent + <lang>_stem) is fixed per
-- configuration; see postgresql.org/docs/17/unaccent.html for the COPY+ALTER
-- MAPPING pattern this mirrors.
do $$
begin
  if not exists (select 1 from pg_ts_config where cfgname = 'chesen_en') then
    create text search configuration lex.chesen_en (copy = pg_catalog.english);
    alter text search configuration lex.chesen_en
      alter mapping for hword, hword_part, word with unaccent, english_stem;
  end if;
  if not exists (select 1 from pg_ts_config where cfgname = 'chesen_es') then
    create text search configuration lex.chesen_es (copy = pg_catalog.spanish);
    alter text search configuration lex.chesen_es
      alter mapping for hword, hword_part, word with unaccent, spanish_stem;
  end if;
end
$$;

-- Generated (stored) tsvector for the Latin-script languages. Computed once per
-- row by Postgres as part of this ALTER TABLE (no manual backfill needed) and
-- kept in sync automatically on future writes. NULL for zh, which is handled by
-- the pgroonga + pinyin columns below instead.
alter table lex.entries add column if not exists search_vector tsvector generated always as (
  case lang
    when 'en' then to_tsvector('lex.chesen_en'::regconfig, extensions.immutable_unaccent(coalesce(headword, '') || ' ' || coalesce(headword_normalized, '')))
    when 'es' then to_tsvector('lex.chesen_es'::regconfig, extensions.immutable_unaccent(coalesce(headword, '') || ' ' || coalesce(headword_normalized, '')))
    else null
  end
) stored;

create index if not exists idx_lex_entries_search_vector on lex.entries using gin (search_vector);

-- Trigram index on headword_normalized for typo tolerance ("recieve" -> "receive"
-- via the pg_trgm `%` similarity operator, default threshold 0.3) and for
-- indexed LIKE-prefix lookups (gin_trgm_ops also accelerates `~~`/`~~*`).
create index if not exists idx_lex_entries_headword_trgm on lex.entries using gin (headword_normalized extensions.gin_trgm_ops);

-- PGroonga index for Chinese: unlike ILIKE/trigram, its `&@` match operator finds
-- a character anywhere in the headword, not just as a prefix (verified: querying
-- '什' returns 为什么/什么样, which have it in the middle).
create index if not exists idx_lex_entries_headword_pgroonga on lex.entries using pgroonga (headword);

-- Toneless pinyin for romanized search ("ni hao" -> 你好). Sourced from
-- entries.attributes->>'pinyin' (a single space-separated string covering the
-- whole headword, 100% populated for all 3245 zh entries as of this writing) --
-- not from characters.pinyin (per-character, text[], multiple readings per char,
-- no whole-word reading). Diacritics are stripped with the same immutable_unaccent
-- wrapper used above (it also strips pinyin tone marks, e.g. "Zhōng guó" -> "Zhong
-- guo"), then spaces are removed and the result lowercased.
alter table lex.entries add column if not exists pinyin_toneless text generated always as (
  case when lang = 'zh' and attributes ? 'pinyin'
    then lower(regexp_replace(extensions.immutable_unaccent(attributes ->> 'pinyin'), '\s+', '', 'g'))
    else null
  end
) stored;

create index if not exists idx_lex_entries_pinyin_toneless_trgm on lex.entries using gin (pinyin_toneless extensions.gin_trgm_ops);

-- Single ranking search function backing lib/dictionary/search.ts. Combines, per
-- row, whichever of the signals above applies to that row's language, takes the
-- best (greatest) score, then scales by frequency so common words surface first.
-- Returns the same fields DictEntryPreview needs, already flattened (primary
-- sense by sense_order, IPA picked with the same us > uk > any preference as the
-- old pickIpa()) so search.ts no longer needs the nested senses()/pronunciations()
-- PostgREST embed + client-side reduction.
create or replace function lex.search(p_q text, p_langs text[] default null, p_limit int default 20)
returns table (
  id text, lang text, headword text, traditional text, level text, frequency_rank int,
  attributes jsonb, pos text, gloss_vi text, gloss_en text, ipa text, audio_url text, rank real
)
language sql
stable
as $$
  with q as (
    select
      trim(p_q) as q_raw,
      lower(extensions.immutable_unaccent(trim(p_q))) as q_norm,
      lower(regexp_replace(extensions.immutable_unaccent(trim(p_q)), '\s+', '', 'g')) as q_pinyin
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
    (
      greatest(
        case when e.headword_normalized = (select q_norm from q) then 4.0
             when e.headword_normalized like (select q_norm from q) || '%' then 3.0
             else 0 end,
        -- en/es headword_normalized keeps diacritics (e.g. "canción"), so also
        -- compare an unaccented copy for a query typed without accents.
        case when e.lang::text in ('en', 'es') and lower(extensions.immutable_unaccent(e.headword_normalized)) = (select q_norm from q) then 4.0
             when e.lang::text in ('en', 'es') and lower(extensions.immutable_unaccent(e.headword_normalized)) like (select q_norm from q) || '%' then 3.0
             else 0 end,
        case when e.lang::text in ('en', 'es')
               then coalesce(extensions.similarity(e.headword_normalized, (select q_norm from q)), 0) * 2.0
             else 0 end,
        case when e.lang::text = 'en' and e.search_vector @@ websearch_to_tsquery('lex.chesen_en', (select q_raw from q))
               then ts_rank(e.search_vector, websearch_to_tsquery('lex.chesen_en', (select q_raw from q)))
             when e.lang::text = 'es' and e.search_vector @@ websearch_to_tsquery('lex.chesen_es', (select q_raw from q))
               then ts_rank(e.search_vector, websearch_to_tsquery('lex.chesen_es', (select q_raw from q)))
             else 0 end,
        case when e.lang::text = 'zh' and (select q_raw from q) <> '' and e.headword &@ (select q_raw from q) then 1.5
             else 0 end,
        case when e.lang::text = 'zh' and (select q_pinyin from q) <> '' and e.pinyin_toneless = (select q_pinyin from q) then 3.5
             when e.lang::text = 'zh' and (select q_pinyin from q) <> '' and e.pinyin_toneless like (select q_pinyin from q) || '%' then 2.5
             else 0 end
      ) * (1.0 / sqrt(greatest(coalesce(e.frequency_rank, 100000), 1)::float8))
    )::real as rank
  from lex.entries e, q
  where (p_langs is null or e.lang::text = any(p_langs))
    and q.q_raw <> ''
    and (
      e.headword_normalized like q.q_norm || '%'
      or (e.lang::text in ('en', 'es') and e.headword_normalized % q.q_norm)
      or (e.lang::text = 'en' and e.search_vector @@ websearch_to_tsquery('lex.chesen_en', q.q_raw))
      or (e.lang::text = 'es' and e.search_vector @@ websearch_to_tsquery('lex.chesen_es', q.q_raw))
      or (e.lang::text = 'zh' and e.headword &@ q.q_raw)
      or (e.lang::text = 'zh' and q.q_pinyin <> '' and e.pinyin_toneless like q.q_pinyin || '%')
    )
  order by rank desc
  limit p_limit;
$$;

grant execute on function lex.search(text, text[], int) to anon, authenticated, service_role;
