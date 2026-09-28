#Requires -Version 7
<#
Stop hook: a turn that touched TypeScript does not end until types, lint and the related
tests agree.

Two constraints this script exists to hold, both learned the hard way:
  - It finds the repository from the input's cwd, never from a fixed path. A hard-coded root
    went stale on a folder rename and the gate was dead for months.
  - A missing tool is a BLOCK, not a skip. A gate that cannot check must never report clean.

Hook contract (https://code.claude.com/docs/en/hooks):
  exit 0  the turn may end
  exit 2  the turn may not end; stderr becomes the reason given to Claude
  exit 1  does NOT block, so it can never enforce anything
#>

$ErrorActionPreference = 'Continue'

function Deny([string]$Message) {
  [Console]::Error.WriteLine($Message)
  exit 2
}

# stop_hook_active means Claude is already continuing because of this hook. Blocking again
# on something it cannot resolve would spin until Claude Code's 8-block ceiling cuts it off.
$cwd = $null
try {
  $raw = [Console]::In.ReadToEnd()
  if ($raw) {
    $stdin = $raw | ConvertFrom-Json
    if ($stdin.stop_hook_active) { exit 0 }
    $cwd = $stdin.cwd
  }
} catch {
  # Unparseable stdin is not evidence of a problem, and not a reason to pass unverified code.
}

# A silently disabled gate cannot fake a fresh timestamp, so this is how to check it is alive.
Set-Content -LiteralPath (Join-Path $PSScriptRoot '..\.verify-gate-last-run') `
            -Value (Get-Date -Format 'o') -Encoding utf8

# Only a linked worktree is judged. Sessions do not edit the main checkout (worktree-guard.ps1),
# so what is dirty there belongs to other sessions, and so does a cwd outside any repository.
# `/ship` still runs the full `npm run verify` before anything reaches master.
$root = if ($cwd) { git -C $cwd rev-parse --show-toplevel 2>$null }
if (-not $root) { exit 0 }
$gitDir = git -C $root rev-parse --absolute-git-dir 2>$null
$common = git -C $root rev-parse --path-format=absolute --git-common-dir 2>$null
if ([IO.Path]::GetFullPath($gitDir) -eq [IO.Path]::GetFullPath($common)) { exit 0 }
if (-not (Test-Path (Join-Path $root 'package.json'))) {
  Deny "verify-gate: no package.json at '$root'. This worktree is not a checkout of the app and cannot be verified."
}
Set-Location $root

# -z gives NUL-separated, unquoted paths. Without it git escapes non-ASCII names
# (core.quotepath) and Test-Path silently misses them. --untracked-files=all lists the files
# inside a new folder, which otherwise shows only as the folder itself.
# A deleted file still counts: its importers break, and tsc is what sees that.
$changed = @()
$deleted = $false
$fields = (git status --porcelain -z --untracked-files=all 2>$null) -split "`0" | Where-Object { $_ -ne '' }
for ($i = 0; $i -lt $fields.Count; $i++) {
  $entry = $fields[$i]
  if ($entry.Length -lt 4) { continue }
  $status = $entry.Substring(0, 2)
  $path = $entry.Substring(3)
  # A rename emits the old path as the next field. Consume it.
  if ($status -match '[RC]') { $i++ }
  if ($path -match '\.(ts|tsx|mts)$') {
    if (Test-Path -LiteralPath $path) { $changed += $path } else { $deleted = $true }
  }
}
if ($changed.Count -eq 0 -and -not $deleted) { exit 0 }

# Mirrors `npm run verify`, minus the whole-suite run: `vitest related` walks the module
# graph so only tests that import a changed file run.
function Tool([string]$Name) {
  $path = Join-Path $root "node_modules\.bin\$Name.cmd"
  if (-not (Test-Path -LiteralPath $path)) {
    Deny "verify-gate: node_modules\.bin\$Name.cmd is missing. Run 'npm ci' and try again. Do not skip this step: an environment that cannot run the checks cannot declare the code clean."
  }
  return $path
}

$problems = @()

$out = (& (Tool 'tsc') --noEmit 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { $problems += "[tsc --noEmit] FAIL`n$out" }

if ($changed.Count -gt 0) {
  $out = (& (Tool 'eslint') @changed 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) { $problems += "[eslint] FAIL`n$out" }

  $out = (& (Tool 'vitest') related --run @changed 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) { $problems += "[vitest related] FAIL`n$out" }
}

if ($problems.Count -gt 0) {
  Deny (@(
    '=== VERIFY GATE: this turn cannot end ==='
    ($problems -join "`n`n")
    'Fix the code. Do not edit a test to make it pass.'
    'If the UI changed: rebuild, click through it, and paste the runtime evidence.'
  ) -join "`n`n")
}

exit 0
