#Requires -Version 7
<#
PreToolUse hook on Edit, Write, MultiEdit and NotebookEdit: the main checkout is shared by
every running session, so a file edit there is refused and the session is sent to a worktree.

Once a session is inside a worktree, Claude Code's own isolation checks refuse edits to the
main checkout (https://code.claude.com/docs/en/worktrees). This hook covers the session that
has not entered one yet. It does not see Bash, so a shell redirect still gets through.
#>

$ErrorActionPreference = 'Continue'

try { $in = [Console]::In.ReadToEnd() | ConvertFrom-Json } catch { exit 0 }
$target = $in.tool_input.file_path ?? $in.tool_input.notebook_path
if (-not $target) { exit 0 }

# The common dir is <main>\.git from the main checkout and from every linked worktree alike.
$common = git -C $PSScriptRoot rev-parse --path-format=absolute --git-common-dir 2>$null
if (-not $common) { exit 0 }
$main = [IO.Path]::GetFullPath((Split-Path $common -Parent)).TrimEnd('\') + '\'
$file = [IO.Path]::GetFullPath($target)

$inMain = $file.StartsWith($main, [StringComparison]::OrdinalIgnoreCase)
# Subagent memory (`memory: project`) is gitignored and lives only here, so it stays writable.
$exempt = "$main.claude\worktrees\", "$main.claude\agent-memory\" |
  Where-Object { $file.StartsWith($_, [StringComparison]::OrdinalIgnoreCase) }
if (-not $inMain -or $exempt) { exit 0 }

@{
  hookSpecificOutput = @{
    hookEventName            = 'PreToolUse'
    permissionDecision       = 'deny'
    permissionDecisionReason = @(
      "$($main.TrimEnd('\')) is the main checkout, shared by every running session, so edits there are refused."
      'Call EnterWorktree with a short name for the task, run `npm ci` in the new worktree, and redo this edit there at the same relative path.'
      'If this session already has uncommitted changes in the main checkout, carry only its own files across with `git diff -- <files>` and `git apply` in the worktree; this hook does not block git.'
    ) -join ' '
  }
} | ConvertTo-Json -Compress -Depth 3
exit 0
