#!/bin/bash
# Runs on the instance. Writes the two CSV files build.mjs reads into the folder given:
# every English multi-word entry, and the pronunciation rows of each word they hold.
#   bash export.sh /tmp/phrase-ipa
set -euo pipefail
out="${1:?usage: export.sh <folder>}"
mkdir -p "$out"
P="docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q"
# `like '% %'` matched nothing when this ran through SSM, so a space is found with strpos.
$P > "$out/phrases.csv" <<'SQL'
set statement_timeout = '600s'; set default_transaction_read_only = on;
copy (
  select e.id, e.headword, e.entry_type,
         coalesce((select string_agg(distinct s.pos, ',') from lex.senses s where s.entry_id = e.id), '') as pos,
         exists (select 1 from lex.pronunciations p where p.entry_id = e.id and p.ipa is not null
                 and p.source_id is distinct from 'zhesen-phrase-ipa') as has_ipa
  from lex.entries e
  where e.lang = 'en' and e.form_of is null and e.entry_type in ('phrase', 'idiom', 'collocation')
    and strpos(e.headword, ' ') > 0
) to stdout with (format csv, header true);
SQL
$P > "$out/prons.csv" <<'SQL'
set statement_timeout = '900s'; set default_transaction_read_only = on;
copy (
  with multi as (
    select e.id, e.headword from lex.entries e
    where e.lang = 'en' and e.form_of is null and e.entry_type in ('phrase', 'idiom', 'collocation')
      and strpos(e.headword, ' ') > 0
  ),
  tok as (select distinct t from multi, unnest(string_to_array(lower(multi.headword), ' ')) t)
  select lower(e.headword) as token, e.id as entry_id, e.form_of is null as lemma, e.entry_type,
         p.id as pron_id, p.accent, p.ipa, p.audio_url
  from tok join lex.entries e on e.lang = 'en' and lower(e.headword) = tok.t and e.entry_type = 'word'
  join lex.pronunciations p on p.entry_id = e.id
  union all
  select lower(e.headword), e.id, true, e.entry_type, p.id, p.accent, p.ipa, p.audio_url
  from multi m join lex.entries e on e.id = m.id join lex.pronunciations p on p.entry_id = e.id
  where p.ipa is not null and p.source_id is distinct from 'zhesen-phrase-ipa'
) to stdout with (format csv, header true);
SQL
wc -l "$out"/*.csv
