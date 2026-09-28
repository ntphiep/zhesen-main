#!/usr/bin/env bash
# Stop hook: a turn that touched TypeScript does not end until types, lint and the related
# tests agree. macOS and Linux port of verify-gate.ps1, which Windows keeps running.
#
# Two constraints this script exists to hold, both learned the hard way:
#   - It finds the repository from the input's cwd, never from a fixed path. A hard-coded root
#     went stale on a folder rename and the gate was dead for months.
#   - A missing tool is a BLOCK, not a skip. A gate that cannot check must never report clean.
#
# Hook contract (https://code.claude.com/docs/en/hooks):
#   exit 0  the turn may end
#   exit 2  the turn may not end; stderr becomes the reason given to Claude
#   exit 1  does NOT block, so it can never enforce anything

here=$(cd "$(dirname "$0")" && pwd)
case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*)
  ps=$(command -v pwsh || echo '/c/Program Files/PowerShell/7/pwsh.exe')
  exec "$ps" -NoProfile -ExecutionPolicy Bypass -File "$here/verify-gate.ps1" ;;
esac

deny() {
  printf '%s\n' "$1" >&2
  exit 2
}

# stop_hook_active means Claude is already continuing because of this hook. Blocking again
# on something it cannot resolve would spin until Claude Code's 8-block ceiling cuts it off.
# Unparseable stdin is not evidence of a problem, and not a reason to pass unverified code.
# The input is read with sed, not node: node can be missing from a GUI-launched PATH, and the
# gate must still reach its own checks rather than block every session on a missing reader.
input=$(cat)
printf '%s' "$input" | grep -Eq '"stop_hook_active" *: *true' && exit 0
cwd=$(printf '%s' "$input" | sed -nE 's/.*"cwd" *: *"((\\.|[^"\\])*)".*/\1/p' | head -1 |
  sed 's/\\\//\//g; s/\\"/"/g; s/\\\\/\\/g')

# A silently disabled gate cannot fake a fresh timestamp, so this is how to check it is alive.
date -u +%Y-%m-%dT%H:%M:%SZ >"$here/../.verify-gate-last-run" 2>/dev/null

# Only a linked worktree is judged. Sessions do not edit the main checkout (worktree-guard.sh),
# so what is dirty there belongs to other sessions, and so does a cwd outside any repository.
# `/ship` still runs the full `npm run verify` before anything reaches master.
[ -n "$cwd" ] || exit 0
root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || exit 0
git_dir=$(git -C "$root" rev-parse --absolute-git-dir 2>/dev/null)
common=$(git -C "$root" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
[ "$git_dir" = "$common" ] && exit 0
[ -f "$root/package.json" ] ||
  deny "verify-gate: no package.json at '$root'. This worktree is not a checkout of the app and cannot be verified."
cd "$root" || deny "verify-gate: cannot enter '$root'."

# -z gives NUL-separated, unquoted paths. Without it git escapes non-ASCII names
# (core.quotepath) and the existence test silently misses them. --untracked-files=all lists
# the files inside a new folder, which otherwise shows only as the folder itself.
# A deleted file still counts: its importers break, and tsc is what sees that.
changed=()
deleted=0
skip=0
while IFS= read -r -d '' entry; do
  # A rename emits the old path as the next field. Consume it.
  if [ "$skip" = 1 ]; then skip=0; continue; fi
  [ "${#entry}" -ge 4 ] || continue
  case "${entry:0:2}" in *R* | *C*) skip=1 ;; esac
  path=${entry:3}
  case "$path" in *.ts | *.tsx | *.mts) if [ -f "$path" ]; then changed+=("$path"); else deleted=1; fi ;; esac
done < <(git status --porcelain -z --untracked-files=all 2>/dev/null)
[ "${#changed[@]}" -gt 0 ] || [ "$deleted" = 1 ] || exit 0

# Mirrors `npm run verify`, minus the whole-suite run: `vitest related` walks the module
# graph so only tests that import a changed file run.
for tool in tsc eslint vitest; do
  [ -x "node_modules/.bin/$tool" ] ||
    deny "verify-gate: node_modules/.bin/$tool is missing. Run 'npm ci' and try again. Do not skip this step: an environment that cannot run the checks cannot declare the code clean."
done

problems=''
if ! out=$(node_modules/.bin/tsc --noEmit 2>&1); then problems="$problems[tsc --noEmit] FAIL"$'\n'"$out"$'\n\n'; fi
if [ "${#changed[@]}" -gt 0 ]; then
  if ! out=$(node_modules/.bin/eslint "${changed[@]}" 2>&1); then problems="$problems[eslint] FAIL"$'\n'"$out"$'\n\n'; fi
  if ! out=$(node_modules/.bin/vitest related --run "${changed[@]}" 2>&1); then problems="$problems[vitest related] FAIL"$'\n'"$out"$'\n\n'; fi
fi

if [ -n "$problems" ]; then
  deny "=== VERIFY GATE: this turn cannot end ===

$problems
Fix the code. Do not edit a test to make it pass.

If the UI changed: rebuild, click through it, and paste the runtime evidence."
fi

exit 0
