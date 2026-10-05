#!/usr/bin/env bash
# Stores the sha256 of SSM /zhesen/prod/ai_cache_secret in private.ai_cache_secret, which
# public.ai_coach_store (migration 0181) checks before writing a shared coach answer. Run as
# root on the instance after 0181 and after every rotation of the parameter. Prints neither
# the secret nor its hash.
set -euo pipefail

CONTAINER="supabase-db"

TOKEN="$(curl -fsS -X PUT http://169.254.169.254/latest/api/token \
  -H 'X-aws-ec2-metadata-token-ttl-seconds: 300')"
REGION="$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/placement/region)"

SECRET="$(aws ssm get-parameter --name /zhesen/prod/ai_cache_secret \
  --with-decryption --query Parameter.Value --output text --region "$REGION")"
# The app trims the value it reads (lib/ai/cacheSecret.ts), so the hash is of the trimmed value.
SECRET="$(printf '%s' "$SECRET" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
[ -n "$SECRET" ] && [ "$SECRET" != "None" ] || {
  echo "set-ai-cache-secret: /zhesen/prod/ai_cache_secret is empty" >&2; exit 1; }
HASH="$(printf '%s' "$SECRET" | sha256sum | cut -d' ' -f1)"
unset SECRET
[[ "$HASH" =~ ^[0-9a-f]{64}$ ]] || { echo "set-ai-cache-secret: hashing failed" >&2; exit 1; }

# Through stdin, so the hash is in neither the process list nor the shell history.
printf "insert into private.ai_cache_secret (id, hash) values (true, decode('%s', 'hex'))
on conflict (id) do update set hash = excluded.hash;\n" "$HASH" |
  docker exec -i "$CONTAINER" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q
unset HASH
echo "set-ai-cache-secret: stored"
