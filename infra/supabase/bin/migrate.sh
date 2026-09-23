#!/usr/bin/env bash
# Moves the Cloud project into this instance, and checks the result.
#
#   migrate.sh preflight [--force]   versions, extensions, empty-target check
#   migrate.sh full [--keep]         schema + data, then the objects pg_dump omits
#   migrate.sh post-restore          only the objects pg_dump omits, then verify
#   migrate.sh resync-users --force [--keep]  auth and public rows only, for cutover
#   migrate.sh verify                row counts and live endpoints, both sides
#
# Run as root on the instance. Every psql and pg_dump runs inside supabase-db, so
# the host needs no Postgres client: the image ships the matching PG 17 binaries.
set -euo pipefail
# Dumps carry password hashes and refresh tokens: root-only files.
umask 077

CONTAINER="supabase-db"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_ROOT="/var/lib/zhesen/migration"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$WORK_ROOT/$STAMP"

CMD="${1:-}"
shift || true
FORCE=0
KEEP=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --keep) KEEP=1 ;;
    *) echo "migrate: unknown option $arg" >&2; exit 2 ;;
  esac
done

TOKEN="$(curl -fsS -X PUT http://169.254.169.254/latest/api/token \
  -H 'X-aws-ec2-metadata-token-ttl-seconds: 300')"
REGION="$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/placement/region)"
CLOUD_URL="$(aws ssm get-parameter --name /zhesen/migration/cloud_db_url \
  --with-decryption --query Parameter.Value --output text --region "$REGION")"
[ -n "$CLOUD_URL" ] && [ "$CLOUD_URL" != "None" ] || {
  echo "migrate: /zhesen/migration/cloud_db_url is empty" >&2; exit 1; }

# The URL reaches the container through a root-only env file, so it is in neither
# the host process list nor the shell history.
ENV_FILE="$(mktemp /run/zhesen-migrate.XXXXXX)"
chmod 600 "$ENV_FILE"
printf 'PGURL=%s\n' "$CLOUD_URL" >"$ENV_FILE"
trap 'rm -f "$ENV_FILE"' EXIT
unset CLOUD_URL

cloud_psql() {
  docker exec -i --env-file "$ENV_FILE" "$CONTAINER" \
    bash -c 'exec psql "$PGURL" "$@"' bash "$@"
}
cloud_pg_dump() {
  docker exec -i --env-file "$ENV_FILE" "$CONTAINER" \
    bash -c 'exec pg_dump "$PGURL" "$@"' bash "$@"
}
local_psql() {
  docker exec -i "$CONTAINER" psql -U supabase_admin -d postgres "$@"
}
cloud_one() { cloud_psql -tAX -c "$1"; }
local_one() { local_psql -tAX -c "$1"; }

FAILURES=0
SUMMARY=""
record() { # name cloud local
  local match="no"
  [ "$2" = "$3" ] && match="yes" || FAILURES=$((FAILURES + 1))
  SUMMARY+="$(printf '%-34s %12s %12s %6s' "$1" "$2" "$3" "$match")"$'\n'
}

AUTH_TABLES="auth.users auth.identities auth.sessions auth.refresh_tokens auth.mfa_factors"

cmd_preflight() {
  echo "== versions"
  echo "cloud: $(cloud_one 'select version()')"
  echo "local: $(local_one 'select version()')"

  echo
  echo "== auth schema migration level"
  local cloud_mig local_mig
  cloud_mig="$(cloud_one 'select max(version) from auth.schema_migrations')"
  local_mig="$(local_one 'select max(version) from auth.schema_migrations')"
  echo "cloud: $cloud_mig"
  echo "local: $local_mig"
  # Both are fixed-width timestamps, so a string compare is the numeric one.
  if [[ "$local_mig" < "$cloud_mig" ]]; then
    echo "migrate: local GoTrue is behind the Cloud schema; bump the auth image first" >&2
    exit 1
  fi

  echo
  echo "== target is empty"
  local has_lex has_public
  has_lex="$(local_one "select count(*) from information_schema.schemata where schema_name = 'lex'")"
  has_public="$(local_one "select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'")"
  echo "lex schema: $has_lex   public tables: $has_public"
  if [ "$has_lex" != "0" ] || [ "$has_public" != "0" ]; then
    if [ "$FORCE" != "1" ]; then
      echo "migrate: target already holds data; re-run with --force to proceed" >&2
      exit 1
    fi
    echo "migrate: --force given, continuing over existing objects"
  fi

  echo
  echo "== extensions"
  local_psql -v ON_ERROR_STOP=1 <<'SQL'
create schema if not exists extensions;
create extension if not exists pgroonga schema extensions;
create extension if not exists pg_trgm schema extensions;
create extension if not exists unaccent schema extensions;
create extension if not exists pgcrypto schema extensions;
create extension if not exists "uuid-ossp" schema extensions;
create extension if not exists pg_stat_statements schema extensions;
SQL
  local_psql -c "select extname, extversion from pg_extension order by extname"

  echo
  echo "== preload libraries the authenticator role setting names"
  # A missing library in session_preload_libraries refuses every PostgREST connection.
  # The image resolves $libdir through a nix profile, so LOAD is the test, not ls.
  local_psql -v ON_ERROR_STOP=1 -c "load 'supautils'" -c "load 'safeupdate'"
}

# The trigger, the event trigger and the role settings are not in a `pg_dump -n`
# of lex/public: the first two hang off auth.users and the catalogue, the last
# live in pg_db_role_setting.
apply_post_restore() {
  # supautils refuses a superuser-owned event trigger on a function owned by
  # postgres, so this one is created as postgres, the owner it had on Cloud.
  docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
drop event trigger if exists ensure_rls;
create event trigger ensure_rls on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();
SQL

  local_psql -v ON_ERROR_STOP=1 --single-transaction <<'SQL'
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter database postgres set "app.settings.jwt_exp" = '3600';
alter role anon set statement_timeout = '3s';
alter role authenticated set statement_timeout = '8s';
alter role authenticator set statement_timeout = '8s';
alter role authenticator set lock_timeout = '8s';
-- PostgREST 13+ refuses to load its schema cache when a listed schema is missing, and a
-- Cloud dump carries no admin schema: 0056 creates it and adds it here itself.
do $$ begin
  execute format('alter role authenticator set "pgrst.db_schemas" = %L', 'public, graphql_public, lex'
    || case when to_regnamespace('admin') is null then '' else ', admin' end);
end $$;
-- A list, not one quoted string: quoted, Postgres looks for a library named
-- "supautils, safeupdate" and refuses every authenticator connection.
alter role authenticator set session_preload_libraries = supautils, safeupdate;
alter role postgres set search_path = "$user", public, extensions;
SQL
  local_psql -c 'analyze'
  local_psql -c "notify pgrst, 'reload schema'"
}

cmd_full() {
  mkdir -p "$WORK"
  echo "== dumping schema"
  cloud_pg_dump --schema-only -n lex -n public -n supabase_migrations \
    --no-publications --no-subscriptions >"$WORK/schema.sql"

  # Hand-written functions in the extensions schema (immutable_unaccent) are not
  # in a -n dump of lex/public, yet lex indexes call them.
  echo "== dumping hand-written functions in the extensions schema"
  cloud_one "select pg_get_functiondef(p.oid) || ';' || chr(10)
      || 'alter function ' || p.oid::regprocedure || ' owner to ' || p.proowner::regrole || ';'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'extensions'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and p.proowner::regrole::text <> 'supabase_admin'" >"$WORK/extensions.sql"

  echo "== dumping data"
  cloud_pg_dump --data-only -n lex -n public -n supabase_migrations -n auth \
    --exclude-table=auth.schema_migrations \
    --exclude-table=auth.audit_log_entries >"$WORK/data.sql"

  # pg_dump 17 emits \restrict/\unrestrict and SET transaction_timeout, which a
  # psql of a different patch level rejects.
  sed -i -e '/^\\restrict /d' -e '/^\\unrestrict /d' \
    -e '/^SET transaction_timeout = /d' "$WORK/schema.sql" "$WORK/data.sql"
  # public already exists in the image; pg_dump 17 emits CREATE for it regardless.
  # supabase_migrations may or may not exist. lex never does.
  sed -i -e 's/^CREATE SCHEMA \(public\|supabase_migrations\);$/CREATE SCHEMA IF NOT EXISTS \1;/' \
    "$WORK/schema.sql"

  docker cp "$WORK/extensions.sql" "$CONTAINER:/tmp/extensions.sql"
  docker cp "$WORK/schema.sql" "$CONTAINER:/tmp/schema.sql"
  docker cp "$WORK/data.sql" "$CONTAINER:/tmp/data.sql"
  # umask 077 above makes the copies root-only; psql in the container may not be root.
  docker exec "$CONTAINER" chmod 644 /tmp/extensions.sql /tmp/schema.sql /tmp/data.sql

  echo "== restoring"
  # session_replication_role=replica keeps handle_new_user and every FK trigger
  # from firing while the rows land; the triggers are recreated afterwards.
  local_psql --single-transaction -v ON_ERROR_STOP=1 \
    -f /tmp/extensions.sql \
    -f /tmp/schema.sql \
    -c 'SET session_replication_role = replica' \
    -f /tmp/data.sql
  docker exec "$CONTAINER" rm -f /tmp/extensions.sql /tmp/schema.sql /tmp/data.sql

  echo "== post-restore objects"
  apply_post_restore

  cmd_verify
  [ "$KEEP" = "1" ] || rm -rf "$WORK"
}

# public.languages is the target of lex.entries.lang and lex.grammar_points.lang,
# so it is neither dumped nor truncated here: a CASCADE through it would empty
# the dictionary. Its rows are static and already landed with `full`.
RESYNC_TABLES_SQL="select string_agg(format('%I.%I', table_schema, table_name), ', ' order by 1)
  from information_schema.tables
  where table_type = 'BASE TABLE'
    and ((table_schema = 'auth' and table_name not in ('schema_migrations', 'audit_log_entries'))
      or (table_schema = 'public' and table_name <> 'languages'))"

cmd_resync_users() {
  if [ "$FORCE" != "1" ]; then
    echo "migrate: resync-users truncates every auth and public table; re-run with --force" >&2
    exit 1
  fi
  mkdir -p "$WORK"
  echo "== dumping auth and public data"
  cloud_pg_dump --data-only -n public -n auth \
    --exclude-table=auth.schema_migrations \
    --exclude-table=auth.audit_log_entries \
    --exclude-table=public.languages >"$WORK/data.sql"
  sed -i -e '/^\\restrict /d' -e '/^\\unrestrict /d' \
    -e '/^SET transaction_timeout = /d' "$WORK/data.sql"
  docker cp "$WORK/data.sql" "$CONTAINER:/tmp/data.sql"
  docker exec "$CONTAINER" chmod 644 /tmp/data.sql

  # No CASCADE: one TRUNCATE over the whole list satisfies the FKs among them, and
  # a FK from outside the list makes the statement fail instead of following it.
  local tables
  tables="$(local_one "$RESYNC_TABLES_SQL")"
  echo "== truncate and reload: $tables"
  local_psql --single-transaction -v ON_ERROR_STOP=1 -v tables="$tables" <<'SQL'
SET session_replication_role = replica;
TRUNCATE :tables;
\i /tmp/data.sql
SQL
  docker exec "$CONTAINER" rm -f /tmp/data.sql

  local_psql -c 'analyze'
  cmd_verify
  [ "$KEEP" = "1" ] || rm -rf "$WORK"
}

cmd_verify() {
  echo
  printf '%-34s %12s %12s %6s\n' "check" "cloud" "local" "match"

  local tables
  tables="$(cloud_one "select table_schema || '.' || table_name
    from information_schema.tables
    where table_schema in ('lex', 'public') and table_type = 'BASE TABLE'
    order by 1")"

  local t
  for t in $tables $AUTH_TABLES; do
    record "$t" \
      "$(cloud_one "select count(*) from $t")" \
      "$(local_one "select count(*) from $t")"
  done

  # A count matching proves nothing about which rows landed.
  record "md5(lex.entries.id)" \
    "$(cloud_one "select md5(string_agg(id::text, ',' order by id)) from lex.entries")" \
    "$(local_one "select md5(string_agg(id::text, ',' order by id)) from lex.entries")"

  # Cloud also carries storage and realtime triggers and policies; only the
  # schemas that moved are compared.
  local pol trg evt
  pol="select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('lex', 'public')"
  trg="select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname in ('lex', 'public', 'auth')"
  evt="select count(*) from pg_event_trigger where evtname = 'ensure_rls'"
  record "pg_policy (lex, public)" "$(cloud_one "$pol")" "$(local_one "$pol")"
  record "pg_trigger (lex, public, auth)" "$(cloud_one "$trg")" "$(local_one "$trg")"
  record "pg_event_trigger ensure_rls" "$(cloud_one "$evt")" "$(local_one "$evt")"

  printf '%s' "$SUMMARY"

  echo
  echo "== search"
  # pgroonga has to be indexed and the gloss index rebuilt for these to answer.
  local zh vi
  zh="$(local_one "select count(*) from lex.search('习', array['zh'], 8) where headword = '学习'")"
  echo "lex.search('习') contains 学习: $zh"
  [ "$zh" = "1" ] || FAILURES=$((FAILURES + 1))

  vi="$(local_one "select count(*) from lex.search_vi('cá', array['en','zh','es'], 8)")"
  echo "lex.search_vi('cá') rows: $vi"
  [ "$vi" -gt 0 ] || FAILURES=$((FAILURES + 1))

  echo
  echo "== endpoints"
  local anon rest_code auth_code
  anon="$(grep '^ANON_KEY=' "$ROOT/.env" | cut -d= -f2-)"
  rest_code="$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $anon" \
    'http://localhost/rest/v1/languages?select=code')"
  # Envoy answers 401 to any /auth/v1/ request without an apikey, health included.
  auth_code="$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $anon" 'http://localhost/auth/v1/health')"
  echo "GET /rest/v1/languages: $rest_code"
  echo "GET /auth/v1/health:    $auth_code"
  [ "$rest_code" = "200" ] || FAILURES=$((FAILURES + 1))
  [ "$auth_code" = "200" ] || FAILURES=$((FAILURES + 1))

  echo
  if [ "$FAILURES" -gt 0 ]; then
    echo "verify: $FAILURES check(s) failed"
    exit 1
  fi
  echo "verify: all checks passed"
}

case "$CMD" in
  preflight) cmd_preflight ;;
  full) cmd_full ;;
  post-restore) apply_post_restore; cmd_verify ;;
  resync-users) cmd_resync_users ;;
  verify) cmd_verify ;;
  *) sed -n '2,9p' "$0" >&2; exit 2 ;;
esac
