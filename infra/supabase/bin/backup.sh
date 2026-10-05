#!/usr/bin/env bash
# Daily logical backup, run from /etc/cron.d/zhesen-backup at 03:30 UTC. The
# dump restores one database into any other Postgres 17; it is the only backup.
set -euo pipefail
# Dumps carry password hashes and refresh tokens: root-only files.
umask 077

LOCAL_DIR="/var/backups/zhesen"
CONTAINER="supabase-db"

TOKEN="$(curl -fsS -X PUT http://169.254.169.254/latest/api/token \
  -H 'X-aws-ec2-metadata-token-ttl-seconds: 300')"
REGION="$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/placement/region)"

BUCKET="$(aws ssm get-parameter --name /zhesen/prod/backup_bucket \
  --query Parameter.Value --output text --region "$REGION")"
[ -n "$BUCKET" ] && [ "$BUCKET" != "None" ] || {
  echo "backup: /zhesen/prod/backup_bucket is empty" >&2; exit 1; }
TOPIC="$(aws ssm get-parameter --name /zhesen/prod/alerts_topic_arn \
  --query Parameter.Value --output text --region "$REGION")"

# A dump that fails at 03:30 must not stay a line in a log nobody reads.
on_exit() {
  local rc=$?
  if [ "$rc" -ne 0 ] && [ -n "$TOPIC" ] && [ "$TOPIC" != "None" ]; then
    aws sns publish --topic-arn "$TOPIC" --region "$REGION" \
      --subject "zhesen backup failed" \
      --message "bin/backup.sh exited $rc at $(date -u +%FT%TZ); see /var/log/zhesen-backup.log" || true
  fi
}
trap on_exit EXIT

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$LOCAL_DIR"
DUMP="$LOCAL_DIR/postgres-$STAMP.dump"
GLOBALS="$LOCAL_DIR/globals-$STAMP.sql"
ROUTER="$LOCAL_DIR/9router-$STAMP.sqlite"
OMNI="$LOCAL_DIR/omniroute-$STAMP.sqlite"

# -Fc so pg_restore can pick single objects out of it later.
docker exec "$CONTAINER" pg_dump -U supabase_admin -Fc postgres >"$DUMP"
# Roles and their settings live outside any one database.
docker exec "$CONTAINER" pg_dumpall -U supabase_admin --globals-only >"$GLOBALS"

aws s3 cp "$DUMP" "s3://$BUCKET/postgres/" --region "$REGION"
aws s3 cp "$GLOBALS" "s3://$BUCKET/postgres/" --region "$REGION"

# The routers' provider logins and API keys, after the dump so a router fault cannot cost
# it. The backup API copies a consistent snapshot while the router keeps writing; mode=ro
# fails on a missing file instead of creating an empty one.
snapshot() {
  python3 -c 'import sqlite3, sys
src = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
dst = sqlite3.connect(sys.argv[2])
src.backup(dst)
dst.close()' "$1" "$2"
}
snapshot /opt/zhesen/9router/db/data.sqlite "$ROUTER"
aws s3 cp "$ROUTER" "s3://$BUCKET/9router/" --region "$REGION"
# OmniRoute's logins stay encrypted with SSM omniroute_storage_key.
snapshot /opt/zhesen/omniroute/data/storage.sqlite "$OMNI"
aws s3 cp "$OMNI" "s3://$BUCKET/omniroute/" --region "$REGION"

# Only the newest set stays on the disk, for the fastest restore; S3 keeps 30 days.
find "$LOCAL_DIR" -type f ! -name "*-$STAMP.*" -delete

echo "backup: $STAMP -> s3://$BUCKET/postgres/, 9router/ and omniroute/"
du -h "$DUMP" "$GLOBALS" "$ROUTER" "$OMNI"
