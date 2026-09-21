-- The Vietnamese lookup stops comparing whole gloss strings and compares one gloss term
-- at a time, out of an index.
--
-- `lex.search_vi` has kept the same shape since 0018: scan `lex.senses`, test the query
-- against `gloss_vi_normalized` as one string, score the result. Eight migrations have
-- patched that shape (0023, 0034, 0036, 0039, 0042, 0043, 0044, 0047) and two defects
-- survived all of them, because both follow from comparing whole strings.
--
-- 1. A longer gloss wins by sharing more characters. Measured on production before this
--    migration, lex.search_vi('con ca', array['en','es','zh'], 8) with marks on the query:
--
--      zh:子女    con cai   4.506
--      offspring  con cai   4.503
--      wife       con cai   4.161
--      cow        Con cai   3.841
--      fish       ca        3.775   <- the answer, fifth
--      dar        Mot con ca duoc tim thay o song Severn   3.502
--
--    "con" is a classifier and names no word, but it counts as half the query, so any
--    gloss reading "con cai" outscores the gloss reading "ca".
--
-- 2. A gloss term buried in a compound answers a query for the term alone.
--    lex.search_vi('lua', ...) put fire seventh, under bonfire, and mixed in the Chinese
--    and English words for railway and train, all reached through "xe lua".
--
-- The fix is to store the terms. `lex.gloss_terms` holds one row per (entry, term), where
-- a term is one comma-separated piece of a Vietnamese gloss with any trailing bracketed
-- definition removed, stored both as written and with a leading classifier stripped.
-- Measured on production: 193,513 rows, 96,014 distinct terms, average 11 characters.
--
-- After, on the same data:
--
--   con ca  ->  fish, pez, pescador, fishes                     and nothing else
--   lua     ->  llama, fuego, flame, flames, flama, fire,
--               burning, brand, light, tongue, low, catch       all of them about fire
--   nuoc    ->  agua, water, watering, watered, aguas, wet
--   com     ->  zh:fan, arroz, zh:rou, rice, meat, flesh
--
-- A gloss longer than 80 characters is a definition rather than a list of terms, and
-- splitting one produced the noise it was meant to remove: taco, whose Vietnamese
-- definition names its filling, answered "com" as strongly as the Chinese word for rice.
-- 708 senses of 117,972 are that long and are left out of the term table; `lex.suggest`
-- still reaches them by trigram.
--
-- Cost. The table replaces a sequential scan of 183,526 senses with a btree probe on two
-- `text_pattern_ops` indexes, which answer both `=` and a prefix. That is what makes a
-- per-keystroke Vietnamese lookup possible: the previous function needed 410 ms warm for
-- "an" and over 3 s cold, where the anon role's statement_timeout cancels it
-- (SQLSTATE 57014) and the route answers 503.
--
-- Tone marks are decided by the query, not by a per-row penalty. A query carrying any
-- Vietnamese mark is matched against `term`, so cho with an acute and cho with a dot
-- below stay apart; a query typed without marks is matched against `term_una` and the
-- ambiguity is accepted, because nothing in the text can resolve it. `lex.tone_key`
-- (0047) still covers the spellings the language writes two ways, "hoa binh" with the
-- mark on either vowel, and is now computed only for candidate rows rather than indexed.
--
-- TO ROLL BACK: replay the lex.search_vi half of 0018, then 0023, 0034, 0036, 0039, 0042,
-- 0043, 0044 and 0047 in order, which reconstructs the previous definition exactly; each
-- of those migrations asserts the hit count of every replacement it makes, so a drift
-- raises rather than silently producing a different function. Then drop the three
-- triggers on lex.senses and drop lex.gloss_terms, lex.gloss_terms_sync,
-- lex.gloss_terms_reload and lex.vi_head.

-- The classifier opening a Vietnamese noun phrase names no word. Both spellings of each
-- one, because this also runs over the query as typed, which may carry no marks at all.
-- Conservative on purpose: "qua", "cay", "bo", "do" and "to" are ordinary words without
-- their marks, so stripping them would lose more than it finds.
create or replace function lex.vi_head(t text)
returns text
language sql
immutable
parallel safe
set search_path = lex, extensions, public
as $$
  select regexp_replace(
    coalesce(t, ''),
    '^(con|cái|cai|chiếc|chiec|quyển|quyen|cuốn|cuon|ngọn|ngon|đống|bức|buc|tấm|tam|loại|loai|kiểu|kieu|việc|viec|cuộc|cuoc|nền|quả|trái|cây|món|sự|đồ|bộ|hạt|viên|hòn|cách)\s+',
    ''
  )
$$;

grant execute on function lex.vi_head(text) to anon, authenticated, service_role;

-- One row per (entry, term). `head` records that every occurrence of this term came from
-- stripping a classifier, which scores below a term the gloss actually writes.
create table if not exists lex.gloss_terms (
  entry_id    text    not null references lex.entries(id) on delete cascade,
  lang        text    not null,
  term        text    not null,
  term_una    text    not null,
  head        boolean not null,
  sense_order integer not null,
  primary key (entry_id, term)
);

-- text_pattern_ops so one index serves both the exact term and a prefix: the database
-- collation is not C, and a plain btree cannot answer `term like 'con c%'`.
create index if not exists idx_lex_gloss_terms_term
  on lex.gloss_terms (term text_pattern_ops, lang);
create index if not exists idx_lex_gloss_terms_una
  on lex.gloss_terms (term_una text_pattern_ops, lang);

alter table lex.gloss_terms enable row level security;
drop policy if exists lex_gloss_terms_select_anon on lex.gloss_terms;
drop policy if exists lex_gloss_terms_select_auth on lex.gloss_terms;
create policy lex_gloss_terms_select_anon on lex.gloss_terms for select to anon using (true);
create policy lex_gloss_terms_select_auth on lex.gloss_terms for select to authenticated using (true);
grant select on lex.gloss_terms to anon, authenticated, service_role;

-- reviewed-destructive: the `delete` below clears only rows this same statement rebuilds
-- from lex.senses, which is the source of truth. Nothing else writes this table.
create or replace function lex.gloss_terms_reload(p_entries text[] default null)
returns void
language sql
set search_path = lex, extensions, public
as $$
  with del as (
    delete from lex.gloss_terms
    where p_entries is null or entry_id = any (p_entries)
    returning 1
  ),
  src as (
    select s.entry_id, e.lang, v.term, v.head, s.sense_order
    from lex.senses s
    join lex.entries e on e.id = s.entry_id
    cross join lateral (
      select btrim(regexp_replace(lower(part), '\s*\(.*$', ''), ' .,;:!?') as base
      from unnest(regexp_split_to_array(s.gloss_vi, '[,;]')) as part
    ) b
    cross join lateral (values (b.base, false), (lex.vi_head(b.base), true)) as v(term, head)
    where (p_entries is null or s.entry_id = any (p_entries))
      and s.gloss_vi is not null
      -- Over 80 characters the gloss is a definition, not a list of terms, and splitting
      -- it on commas yields words that merely appear inside an explanation.
      and length(s.gloss_vi) <= 80
      and v.term <> ''
      and length(v.term) <= 40
  )
  insert into lex.gloss_terms (entry_id, lang, term, term_una, head, sense_order)
  select
    entry_id, lang, term,
    lower(extensions.immutable_unaccent(term)),
    -- False as soon as one gloss writes the term itself, which is the stronger claim.
    bool_and(head),
    min(sense_order)
  from src
  group by entry_id, lang, term
  on conflict (entry_id, term) do nothing;
$$;

-- Statement level with transition tables, not row level: a data load rewrites tens of
-- thousands of senses in one statement, and a per-row rebuild would run the extraction
-- once per sense of the same entry.
create or replace function lex.gloss_terms_sync()
returns trigger
language plpgsql
set search_path = lex, extensions, public
as $$
begin
  if tg_op = 'INSERT' then
    perform lex.gloss_terms_reload(array(select distinct entry_id from new_rows));
  elsif tg_op = 'DELETE' then
    perform lex.gloss_terms_reload(array(select distinct entry_id from old_rows));
  else
    perform lex.gloss_terms_reload(array(
      select entry_id from new_rows
      union
      select entry_id from old_rows));
  end if;
  return null;
end
$$;

drop trigger if exists trg_lex_gloss_terms_ins on lex.senses;
drop trigger if exists trg_lex_gloss_terms_upd on lex.senses;
drop trigger if exists trg_lex_gloss_terms_del on lex.senses;

create trigger trg_lex_gloss_terms_ins after insert on lex.senses
  referencing new table as new_rows
  for each statement execute function lex.gloss_terms_sync();
create trigger trg_lex_gloss_terms_upd after update on lex.senses
  referencing old table as old_rows new table as new_rows
  for each statement execute function lex.gloss_terms_sync();
create trigger trg_lex_gloss_terms_del after delete on lex.senses
  referencing old table as old_rows
  for each statement execute function lex.gloss_terms_sync();

select lex.gloss_terms_reload();

-- The planner has no statistics for a table it has never seen, and the new function
-- joins it to lex.entries on the primary key.
analyze lex.gloss_terms;

-- Replaces the body outright rather than transforming the previous text, which is what
-- 0042, 0045 and 0047 each did. Eight layers of patch is what this removes.
-- The defaults are the ones the previous definition carried. `create or replace` drops
-- everything it does not restate, and a caller passing two arguments would stop resolving.
create or replace function lex.search_vi(
  p_q text, p_langs text[] default null, p_limit integer default 20)
returns table (
  id text, lang text, headword text, traditional text, level text,
  frequency_rank integer, attributes jsonb, pos text, gloss_vi text, gloss_en text,
  ipa text, audio_url text, rank real
)
language sql
stable
parallel safe
set search_path = lex, extensions, public
as $$
  with k as (
    select
      lower(btrim(coalesce(p_q, '')))                                as raw,
      lower(extensions.immutable_unaccent(btrim(coalesce(p_q, '')))) as una
  ),
  q as (
    select
      raw, una,
      raw <> una        as marked,
      lex.vi_head(raw)  as raw_head,
      lex.vi_head(una)  as una_head,
      lex.tone_key(raw) as raw_tone
    from k
  ),
  -- Every branch is a condition on lex.gloss_terms, so the four combine into one bitmap
  -- over the two text_pattern_ops indexes. A branch reaching another table would lose it.
  scored as (
    select
      g.entry_id,
      g.lang,
      g.sense_order,
      ((case
          when q.marked then
            case when g.term = q.raw                    then 4.0
                 -- "hoa binh" with the mark on either vowel is one word: Vietnamese puts
                 -- the tone on either half of a diphthong and the data holds both.
                 when lex.tone_key(g.term) = q.raw_tone then 3.9
                 when g.term = q.raw_head               then 3.7
                 when g.term like q.raw || '%'          then 3.2
                 when g.term like q.raw_head || '%'     then 3.0
                 -- Reached only through term_una, so the marks disagree: a different
                 -- Vietnamese word. Below the floor.
                 else 2.0 end
          else
            -- Nothing in a query typed without marks can tell the words apart, so the
            -- ambiguity is accepted and frequency decides the order.
            case when g.term_una = q.una               then 4.0
                 when g.term_una = q.una_head          then 3.7
                 when g.term_una like q.una || '%'     then 3.2
                 else 3.0 end
        end)
        - (case when g.head then 0.15 else 0.0 end)
        -- A gloss deep inside a long entry is a weaker answer than sense 1 of the right
        -- word: "bau troi" is sense 13 of element and sense 28 of blue.
        - 0.5 * (1.0 - 1.0 / sqrt(g.sense_order + 1.0))
      )::real as rank
    from q
    join lex.gloss_terms g
      on (p_langs is null or g.lang = any (p_langs))
     and (   g.term     like q.raw      || '%'
          or g.term     like q.raw_head || '%'
          or g.term_una like q.una      || '%'
          or g.term_una like q.una_head || '%')
    where q.raw <> ''
  ),
  best as (
    select distinct on (entry_id) entry_id, lang, sense_order, rank
    from scored
    order by entry_id, rank desc, sense_order asc
  ),
  -- One quota per language, so a strong language cannot take the whole budget.
  per_lang as (
    select * from (
      select b.*, row_number() over (partition by b.lang order by b.rank desc) as rn
      from best b
      where b.rank >= 2.5
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
    r.rank
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
  order by r.rank desc, e.frequency_rank asc nulls last;
$$;

grant execute on function lex.search_vi(text, text[], integer) to anon, authenticated, service_role;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260921000001', 'gloss_terms_and_search_vi_rewrite')
on conflict (version) do nothing;
