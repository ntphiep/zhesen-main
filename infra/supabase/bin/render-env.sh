#!/usr/bin/env bash
# Writes .env next to docker-compose.yml from env.template, resolving every
# ${SSM:/path} placeholder. Run by cloud-init on first boot and by hand after a
# parameter changes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$ROOT/env.template"
TARGET="$ROOT/.env"
PREFIX="/zhesen/prod"

[ -r "$TEMPLATE" ] || { echo "render-env: $TEMPLATE not readable" >&2; exit 1; }

# IMDSv2 only; the instance sets http_tokens = required.
TOKEN="$(curl -fsS -X PUT http://169.254.169.254/latest/api/token \
  -H 'X-aws-ec2-metadata-token-ttl-seconds: 300')"
REGION="$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/placement/region)"

# One call for the whole prefix rather than one per placeholder. The CLI
# paginates on its own and merges the pages.
PARAMS="$(aws ssm get-parameters-by-path \
  --path "$PREFIX" --with-decryption --recursive \
  --region "$REGION" --output json)"

TMP="$(mktemp "$TARGET.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

while IFS= read -r line; do
  # Comment lines pass through untouched, placeholders or not.
  if [[ "$line" == \#* ]]; then printf '%s\n' "$line"; continue; fi
  while [[ "$line" =~ \$\{SSM:([^}]+)\} ]]; do
    name="${BASH_REMATCH[1]}"
    value="$(jq -r --arg n "$name" \
      '.Parameters[] | select(.Name == $n) | .Value' <<<"$PARAMS")"
    if [ -z "$value" ]; then
      echo "render-env: SSM parameter $name is missing or empty" >&2
      exit 1
    fi
    line="${line//\$\{SSM:$name\}/$value}"
  done
  printf '%s\n' "$line"
done <"$TEMPLATE" >"$TMP"

chmod 600 "$TMP"
mv -f "$TMP" "$TARGET"
trap - EXIT

echo "render-env: wrote $TARGET ($(wc -l <"$TARGET") lines, mode 600)"
