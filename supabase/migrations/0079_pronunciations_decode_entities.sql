-- 0079_pronunciations_decode_entities.sql
-- Decode the HTML entities the Wiktionary parse left in Commons audio file names.
--
-- 477 English rows of `lex.pronunciations` carried a file name such as
-- "LL-Q1860 (eng)-Vealhurl-florist&#39;s.wav": the entity went into `audio_url`
-- percent-encoded (`%26%2339%3B`), and the `/x/xy/` folder was the md5 of that wrong
-- name, so Commons answered 404 and `audioMatchesHeadword` hid the button (#31). Entities
-- seen on 2026-09-29: &#39; 801 times, &#45; 176, &#38; 10, &#34; 4, &#59; 2.
--
-- The name is decoded, spaces become underscores as on Commons, and the folder is
-- recomputed from md5 of the decoded name with its first letter capitalised, which is how
-- Commons lays out its files:
-- https://www.mediawiki.org/wiki/Manual:$wgHashedUploadDirectory
-- Every rewritten URL was checked against Commons before this ran.
--
-- The pipeline decodes the name at parse time from zhesen-pipeline's #31 commit on, so a
-- reload keeps the fix. Rerunning this file changes nothing: no row matches afterwards.
--
-- TO ROLL BACK: no undo is kept; the old values were URLs that answered 404.

with bad as (
  select id,
    replace(replace(replace(replace(replace(replace(source_ref,
      '&#39;', ''''), '&#45;', '-'), '&#38;', '&'), '&#34;', '"'), '&#59;', ';'), ' ', '_') as base,
    replace(replace(replace(replace(replace(source_ref,
      '&#39;', ''''), '&#45;', '-'), '&#38;', '&'), '&#34;', '"'), '&#59;', ';') as ref_after,
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(audio_url,
      '%26%2339%3B', '%27', 'gi'), '%26%2345%3B', '-', 'gi'), '%26%2338%3B', '%26', 'gi'),
      '%26%2334%3B', '%22', 'gi'), '%26%2359%3B', '%3B', 'gi') as url
  from lex.pronunciations
  -- The folder is rebuilt from source_ref, so a row without an encoded name there is left alone.
  where audio_url ~* '%26%23[0-9]+%3B' and source_ref ~ '&#[0-9]+;'
), named as (
  -- Commons stores a name with its first letter capitalised: en-us-men's.ogg is En-us-men's.ogg.
  select b.*, upper(left(base, 1)) || substr(base, 2) as name from bad b
)
update lex.pronunciations p
set audio_url = regexp_replace(b.url, '^(https://upload\.wikimedia\.org/wikipedia/commons/(transcoded/)?)[0-9a-f]/[0-9a-f]{2}/',
      '\1' || substr(md5(b.name), 1, 1) || '/' || substr(md5(b.name), 1, 2) || '/'),
    source_ref = b.ref_after
from named b
where p.id = b.id;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260929000003', 'pronunciations_decode_entities')
on conflict (version) do nothing;
