#!/usr/bin/env bash
# SessionStart hook (startup, resume, clear). Plain stdout on exit 0 becomes context the session
# reads before its first prompt (https://code.claude.com/docs/en/hooks). macOS and Linux port of
# session-digest.ps1, which Windows keeps running.
#
# It fast-forwards the main checkout, then prints what a session cannot see from the tree it
# starts in: the open work on the ZHESEN board, which session runs in which worktree with what
# uncommitted, and what landed since the previous session started. A section that fails prints
# one line and the rest carry on; this hook never stops a session from starting.

here=$(cd "$(dirname "$0")" && pwd)
case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*)
  ps=$(command -v pwsh || echo '/c/Program Files/PowerShell/7/pwsh.exe')
  exec "$ps" -NoProfile -ExecutionPolicy Bypass -File "$here/session-digest.ps1" ;;
esac

if ! command -v node >/dev/null 2>&1; then
  echo '# Project state at session start: unavailable, node is not on PATH (.claude/hooks/session-digest.sh)'
  exit 0
fi

# Prints the named top-level fields of the JSON on stdin, one per line, empty when absent.
json_fields() {
  node -e '
    let s = ""
    process.stdin.on("data", d => (s += d)).on("end", () => {
      let j = {}
      try { j = JSON.parse(s) ?? {} } catch {}
      process.stdout.write(process.argv.slice(1).map(k => String(j[k] ?? "").replace(/\n/g, " ")).join("\n"))
    })' "$@"
}
join_lines() { awk -v sep="$1" 'NR > 1 { printf "%s", sep } { printf "%s", $0 }'; }
out=''
add() { out="$out$1"$'\n'; }

input=$(json_fields cwd session_id)
in_cwd=$(printf '%s\n' "$input" | sed -n 1p)
in_session=$(printf '%s\n' "$input" | sed -n 2p)

common=$(git -C "${in_cwd:-$here}" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
[ -n "$common" ] || exit 0
main=$(dirname "$common")

# Shared by every worktree, so "previous session" means the previous start of any session.
state_file="$common/claude-session-digest.json"
last=$(json_fields at master 2>/dev/null <"$state_file")
last_at=$(printf '%s\n' "$last" | sed -n 1p)
last_master=$(printf '%s\n' "$last" | sed -n 2p)
now=$(date +%s)
since=${last_at:-$((now - 7 * 86400))}
since_iso=$(node -e 'process.stdout.write(new Date(process.argv[1] * 1000).toISOString().replace(/\.\d+Z$/, "Z"))' "$since")

tmp=$(mktemp -d)
trap 'rm -r -f -- "$tmp"' EXIT

# The three network calls run in the background against one deadline, so a stalled connection
# costs a section, never the hook's 30 s timeout. A call still running then is skipped and killed.
# Each writes a .done marker when it finishes; its output file is read only after that.
deadline=$((now + 18))
wait_deadline() {
  local f
  while [ "$(date +%s)" -lt "$deadline" ]; do
    for f in "$@"; do [ -f "$tmp/$f.done" ] || { sleep 0.2; continue 2; }; done
    return
  done
}
query=$(cat <<'EOF'
query($since: DateTime!) {
  user(login: "ntphiep") { projectV2(number: 2) { items(first: 100) { totalCount nodes {
    status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
    priority: fieldValueByName(name: "Priority") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
    content { ... on Issue { number title state } } } } } }
  repository(owner: "ntphiep", name: "zhesen-main") {
    closed: issues(states: CLOSED, first: 30, orderBy: {field: UPDATED_AT, direction: DESC}, filterBy: {since: $since}) { nodes { number title closedAt } }
    opened: issues(states: OPEN, first: 30, orderBy: {field: CREATED_AT, direction: DESC}) { nodes { number title createdAt } }
  }
}
EOF
)
# The board belongs to ntphiep. Where gh answers as another account, Composio's github toolkit
# answers as ntphiep instead; gh's own account is left as it is. The account is asked of the API,
# not of gh's config, because GH_TOKEN overrides the config.
board_cmd() {
  if [ "$(gh api user --jq .login 2>/dev/null)" != ntphiep ] && command -v composio >/dev/null 2>&1; then
    composio proxy https://api.github.com/graphql --toolkit github -X POST -H 'content-type: application/json' \
      -d "$(node -e 'process.stdout.write(JSON.stringify({ query: process.argv[1], variables: { since: process.argv[2] } }))' "$query" "$since_iso")"
  else
    gh api graphql -f query="$query" -f since="$since_iso"
  fi
}
# stderr is kept apart so a warning cannot corrupt the JSON, and stands in for it when stdout is empty.
(board_cmd >"$tmp/board" 2>"$tmp/board.err"; [ -s "$tmp/board" ] || cp "$tmp/board.err" "$tmp/board"; : >"$tmp/board.done") </dev/null 2>/dev/null &
board_pid=$!
wiki_dir="$common/claude-wiki.git"
(
  if [ -d "$wiki_dir" ]; then git -C "$wiki_dir" fetch --quiet --prune origin >/dev/null 2>&1
  else git clone --quiet --mirror https://github.com/ntphiep/zhesen-main.wiki.git "$wiki_dir" >/dev/null 2>&1; fi
  git -C "$wiki_dir" log --since="$since_iso" --format='@%s' --name-only master >"$tmp/wiki" 2>/dev/null
  : >"$tmp/wiki.done"
) </dev/null 2>/dev/null &
wiki_pid=$!
(git -C "$main" fetch --quiet origin >/dev/null 2>&1; : >"$tmp/fetch.done") </dev/null 2>/dev/null &
fetch_pid=$!
# Disowned, so a job killed at the end is not reported as "Terminated" on stderr.
disown "$board_pid" "$wiki_pid" "$fetch_pid"

wait_deadline fetch
tip=$(git -C "$main" rev-parse --short origin/master 2>/dev/null)
add '# Project state at session start (.claude/hooks/session-digest.sh)'
[ -f "$tmp/fetch.done" ] || add 'git fetch did not finish in time, so origin/master below may be behind GitHub.'

# The main checkout is what CLAUDE_PROJECT_DIR hooks and new sessions read, and no session
# edits it, so it only moves forward here.
branch=$(git -C "$main" symbolic-ref --quiet --short HEAD 2>/dev/null)
head=$(git -C "$main" rev-parse --short HEAD 2>/dev/null)
if [ "$branch" = master ] && [ -n "$tip" ] && [ "$head" != "$tip" ]; then
  if ! git -C "$main" merge-base --is-ancestor HEAD origin/master 2>/dev/null; then
    add 'Main checkout: master holds commits not on origin/master, so it was not fast-forwarded.'
  elif err=$(git -C "$main" merge --ff-only --quiet origin/master 2>&1); then
    moved=$(git -C "$main" diff --name-only "$head" "$tip" -- AGENTS.md CLAUDE.md .claude | join_lines ', ')
    add "Main checkout: fast-forwarded $head..$tip."
    [ -n "$moved" ] && add "Instruction files changed in that range; a session started in the main checkout loaded the old copy, so re-read: $moved."
  else
    add "Main checkout: fast-forward refused: $(printf '%s\n' "$err" | sed -n '1s/^ *//;1s/ *$//;1p')"
  fi
fi

# Worktrees, and the sessions whose working directory is inside each one. The session files
# are Claude Code's own and undocumented; when their shape changes this part goes quiet.
paths=() branches=() prunable=() sessions=()
while IFS= read -r line; do
  case "$line" in
    'worktree '*) paths+=("${line#worktree }"); branches+=(detached); prunable+=(0); sessions+=('') ;;
    'branch '*) b=${line#branch }; branches[${#branches[@]} - 1]=${b#refs/heads/} ;;
    prunable*) prunable[${#prunable[@]} - 1]=1 ;;
  esac
done < <(git -C "$main" worktree list --porcelain 2>/dev/null)
# APFS is case-insensitive by default, so paths are compared lowercased on macOS.
os=$(uname -s)
fold() { if [ "$os" = Darwin ]; then printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; else printf '%s' "$1"; fi; }
find_tree() {
  local dir best=-1 len=-1 i p
  dir="$(fold "${1%/}")/"
  for i in "${!paths[@]}"; do
    p="$(fold "${paths[$i]%/}")/"
    case "$dir" in "$p"*) [ "${#p}" -gt "$len" ] && best=$i len=${#p} ;; esac
  done
  echo "$best"
}
session_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sessions"
while IFS=$'\x1f' read -r pid scwd sid sname sstatus; do
  [ -n "$scwd" ] && [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null || continue
  i=$(find_tree "$scwd")
  [ "$i" -ge 0 ] || continue
  if [ "$sid" = "$in_session" ]; then entry="$sname (this session)"; else entry="$sname $sstatus"; fi
  sessions[i]="${sessions[i]:+${sessions[i]}, }$entry"
done < <(node -e '
  const fs = require("fs"), path = require("path"), dir = process.argv[1]
  let files = []
  try { files = fs.readdirSync(dir).filter(f => f.endsWith(".json")) } catch {}
  for (const f of files) {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))
      console.log([s.pid, s.cwd, s.sessionId, s.name, s.status].map(v => String(v ?? "")).join("\x1f"))
    } catch {}
  }' "$session_dir")
add ''
add '## Worktrees and sessions'
for i in "${!paths[@]}"; do
  p=${paths[i]}
  if [ "$p" = "$main" ]; then name='main checkout'
  else case "$p" in "$main"/*) name=${p#"$main"/} ;; *) name=$p ;; esac; fi
  if [ "${prunable[i]}" = 1 ]; then add "- $name (${branches[i]}): directory missing, clear it with \`git worktree prune\`"; continue; fi
  read -r behind ahead <<<"$(git -C "$p" rev-list --left-right --count origin/master...HEAD 2>/dev/null)"
  if [ -n "$ahead" ]; then drift="$ahead ahead, $behind behind origin/master"; else drift='no origin/master'; fi
  dirty=$(git -C "$p" status --porcelain 2>/dev/null | cut -c4-)
  count=$(printf '%s' "$dirty" | grep -c '')
  if [ "$count" -eq 0 ]; then files=clean
  else
    files="$count uncommitted: $(printf '%s\n' "$dirty" | head -4 | join_lines ', ')"
    [ "$count" -gt 4 ] && files="$files, ..."
  fi
  if [ -n "${sessions[i]}" ]; then who="sessions: ${sessions[i]}"; else who='no session'; fi
  add "- $name (${branches[i]}, $drift): $who; $files"
done
i=$(find_tree "${in_cwd:-$main}")
add ''
if [ "$i" -lt 0 ] || [ "${paths[i]}" = "$main" ]; then
  add 'This session is in the main checkout. Before the first edit, call EnterWorktree with a short task name and run `npm ci` there (AGENTS.md, "One session, one worktree").'
else
  add "This session is in the worktree ${paths[i]} on ${branches[i]}. Edit here, ship with /ship, and leave the main checkout alone."
fi

# Board and issues, read from the one GraphQL answer. Mode "board" prints the board section,
# "issues" the issues opened and closed since the previous session, "repo" 1 when the answer
# carried the issue lists.
board_js='
  const fs = require("fs"), [mode, file, done, since] = process.argv.slice(1)
  const raw = done === "1" ? fs.readFileSync(file, "utf8") : "the GitHub call did not finish in time"
  let json, data
  try { json = JSON.parse(raw); data = json.data } catch {}
  const out = [], key = p => (p ? p.split(":")[0] : "no priority")
  if (mode === "repo") { if (data?.repository) out.push("1") }
  else if (mode === "board") {
    // An error body can be pretty-printed, so its message is read rather than its first line.
    const reason = json?.errors?.[0]?.message ?? json?.message ?? raw.split("\n").find(l => l.trim()) ?? ""
    if (!data?.user) out.push(`## Board: unavailable (${reason.trim().slice(0, 120)})`)
    else {
      const items = data.user.projectV2.items
      const open = items.nodes.filter(n => n.content?.state === "OPEN")
      out.push(`## Board ZHESEN (https://github.com/users/ntphiep/projects/2): ${open.length} open`)
      const inHand = open.filter(n => ["In Progress", "In Review"].includes(n.status?.name))
      if (inHand.length) inHand.forEach(n => out.push(`- ${n.status.name}: #${n.content.number} ${n.content.title}`))
      else out.push("- Nothing is In Progress or In Review.")
      open.filter(n => n.status?.name === "Todo" && /^P[01]/.test(n.priority?.name ?? ""))
        .sort((a, b) => a.priority.name.localeCompare(b.priority.name) || a.content.number - b.content.number)
        .forEach(n => out.push(`- ${key(n.priority.name)} #${n.content.number} ${n.content.title}`))
      const counts = {}
      open.forEach(n => (counts[key(n.priority?.name)] = (counts[key(n.priority?.name)] ?? 0) + 1))
      const names = Object.keys(counts).sort((a, b) => (a[0] !== "P") - (b[0] !== "P") || a.localeCompare(b))
      out.push(`- Open by priority: ${names.map(k => `${k} ${counts[k]}`).join(", ")}.`)
      const stale = items.nodes.filter(n => n.content?.state === "CLOSED" && n.status?.name !== "Done")
      if (stale.length) out.push(`- ${stale.length} closed issues are not in Done: ${stale.map(n => `#${n.content.number}`).join(", ")}.`)
      if (items.totalCount > 100) out.push(`- The board holds ${items.totalCount} items; only the first 100 were read.`)
    }
  } else if (data?.repository) {
    for (const [kind, field, label] of [["opened", "createdAt", "Issues opened and still open"], ["closed", "closedAt", "Issues closed"]]) {
      const hits = data.repository[kind].nodes.filter(n => Date.parse(n[field]) > since * 1000)
      if (!hits.length) continue
      out.push(`${label} (${hits.length}): ${hits.slice(0, 10).map(n => `#${n.number} ${n.title}`).join("; ")}${hits.length > 10 ? "; ..." : ""}`)
    }
  }
  process.stdout.write(out.join("\n"))'
add ''
wait_deadline board wiki
board_done=0
[ -f "$tmp/board.done" ] && board_done=1
add "$(node -e "$board_js" board "$tmp/board" "$board_done" "$since")"

# What changed since the previous session started.
add ''
add "## Since the previous session started ($(node -e '
  const d = new Date(process.argv[1] * 1000), p = n => String(n).padStart(2, "0")
  process.stdout.write(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`)' "$since"))"
known=0
[ -n "$last_master" ] && git -C "$main" cat-file -e "$last_master^{commit}" 2>/dev/null && known=1
if [ "$known" = 1 ]; then range="$last_master..origin/master"; log=$(git -C "$main" log --format='%h %s' "$range" 2>/dev/null)
else range="--since=$since_iso origin/master"; log=$(git -C "$main" log --format='%h %s' "--since=$since_iso" origin/master 2>/dev/null); fi
if [ -n "$log" ]; then
  count=$(printf '%s\n' "$log" | grep -c '')
  add "Commits on origin/master ($count):"
  add "$(printf '%s\n' "$log" | head -15 | sed 's/^/- /')"
  [ "$count" -gt 15 ] && add "- ... $((count - 15)) more: git log $range"
else
  add 'No new commits on origin/master.'
fi
issues=$(node -e "$board_js" issues "$tmp/board" "$board_done" "$since")
[ -n "$issues" ] && add "$issues"
if [ -f "$tmp/wiki.done" ]; then
  # Pages only: images/ and dotfiles are not something a session reads.
  pages=$(awk '/^@/ { s = substr($0, 2); next } /^[^.\/][^\/]*\.md$/ && !seen[$0]++ { sub(/\.md$/, ""); print "- " $0 ": " s }' "$tmp/wiki")
  if [ -n "$pages" ]; then
    add 'Wiki pages changed (https://github.com/ntphiep/zhesen-main/wiki), read the ones that bear on the task:'
    add "$pages"
  fi
fi

# Without the issue lists this run reported nothing about issues, so the window stays open.
if [ "$(node -e "$board_js" repo "$tmp/board" "$board_done" "$since")" = 1 ]; then
  node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({ at: Number(process.argv[2]), master: process.argv[3] }))' \
    "$state_file" "$(date +%s)" "$(git -C "$main" rev-parse origin/master 2>/dev/null)"
fi

printf '%s' "${out%$'\n'}"

# A call still running is killed with every descendant, so nothing outlives the hook. The parent
# goes first, so it cannot start another child while its current ones are killed.
kill_tree() {
  local kids c
  kids=$(pgrep -P "$1")
  kill "$1" 2>/dev/null
  for c in $kids; do kill_tree "$c"; done
}
[ -f "$tmp/board.done" ] || kill_tree "$board_pid"
[ -f "$tmp/wiki.done" ] || kill_tree "$wiki_pid"
[ -f "$tmp/fetch.done" ] || kill_tree "$fetch_pid"
exit 0
