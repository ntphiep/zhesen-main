#!/bin/bash
# Runs on the instance. Writes the two CSV files build.mjs reads into the folder given: every
# English entry id with its frequency rank, and every English sense with its part of speech
# and English gloss.
#   bash export.sh /tmp/wikt-notes
set -euo pipefail
out="${1:?usage: export.sh <folder>}"
mkdir -p "$out"
P="docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q"
$P > "$out/entries.csv" <<'SQL'
set statement_timeout = '600s'; set default_transaction_read_only = on;
copy (select id, frequency_rank from lex.entries where lang = 'en') to stdout with (format csv, header true);
SQL
$P > "$out/senses.csv" <<'SQL'
set statement_timeout = '900s'; set default_transaction_read_only = on;
copy (
  select s.id, s.entry_id, s.pos, s.gloss_en from lex.senses s
  where s.entry_id like 'en:%'
) to stdout with (format csv, header true);
SQL
wc -l "$out"/*.csv
