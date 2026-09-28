#!/usr/bin/env bash
# PreToolUse hook on Edit, Write, MultiEdit and NotebookEdit: the main checkout is shared by
# every running session, so a file edit there is refused and the session is sent to a worktree.
# macOS and Linux port of worktree-guard.ps1, which Windows keeps running.
#
# Once a session is inside a worktree, Claude Code's own isolation checks refuse edits to the
# main checkout (https://code.claude.com/docs/en/worktrees). This hook covers the session that
# has not entered one yet. It does not see Bash, so a shell redirect still gets through.

here=$(cd "$(dirname "$0")" && pwd)
case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*)
  ps=$(command -v pwsh || echo '/c/Program Files/PowerShell/7/pwsh.exe')
  exec "$ps" -NoProfile -ExecutionPolicy Bypass -File "$here/worktree-guard.ps1" ;;
esac

# The input is read with sed, not node: node can be missing from a GUI-launched PATH, and a
# guard that cannot read its input would otherwise let every edit through.
json_string() {
  printf '%s' "$input" | sed -nE "s/.*\"$1\" *: *\"((\\\\.|[^\"\\\\])*)\".*/\\1/p" | head -1 |
    sed 's/\\\//\//g; s/\\"/"/g; s/\\\\/\\/g'
}
input=$(cat)
target=$(json_string file_path)
[ -n "$target" ] || target=$(json_string notebook_path)
[ -n "$target" ] || exit 0

# The common dir is <main>/.git from the main checkout and from every linked worktree alike.
common=$(git -C "$here" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
main=$(dirname "$common")

# Resolves . and .. as text, since the file may not exist yet.
case "$target" in /*) ;; *) target="$PWD/$target" ;; esac
IFS=/ read -r -a parts <<<"$target"
kept=()
for part in "${parts[@]}"; do
  case "$part" in
    '' | .) ;;
    ..) [ "${#kept[@]}" -gt 0 ] && unset "kept[${#kept[@]}-1]" ;;
    *) kept+=("$part") ;;
  esac
done
file=$(printf '/%s' "${kept[@]}")

# APFS is case-insensitive by default, so /Users/x/Zhesen-Main is the same folder.
root=$main
if [ "$(uname -s)" = Darwin ]; then
  root=$(printf '%s' "$root" | tr '[:upper:]' '[:lower:]')
  file=$(printf '%s' "$file" | tr '[:upper:]' '[:lower:]')
fi

case "$file/" in "$root"/*) ;; *) exit 0 ;; esac
# Subagent memory (`memory: project`) is gitignored and lives only here, so it stays writable.
case "$file" in "$root"/.claude/worktrees/* | "$root"/.claude/agent-memory/*) exit 0 ;; esac

reason="$main is the main checkout, shared by every running session, so edits there are refused."
reason="$reason Call EnterWorktree with a short name for the task, run \`npm ci\` in the new worktree, and redo this edit there at the same relative path."
reason="$reason If this session already has uncommitted changes in the main checkout, carry only its own files across with \`git diff -- <files>\` and \`git apply\` in the worktree; this hook does not block git."
reason=$(printf '%s' "$reason" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}' "$reason"
exit 0
