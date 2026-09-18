#Requires -Version 7
<#
Stop hook: a turn that touched TypeScript does not end until types, lint and the related
tests agree.

Two constraints this script exists to hold, both learned the hard way:
  - It finds the repository from its own path. A hard-coded root went stale on a folder
    rename and the gate was dead for months.
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
try {
  $raw = [Console]::In.ReadToEnd()
  if ($raw) {
    $stdin = $raw | ConvertFrom-Json
    if ($stdin.stop_hook_active) { exit 0 }
  }
} catch {
  # Unparseable stdin is not evidence of a problem, and not a reason to pass unverified code.
}

# $PSScriptRoot is <repo>\.claude\hooks, independent of the working directory and of git.
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not (Test-Path (Join-Path $root 'package.json'))) {
  Deny "verify-gate: no package.json at '$root'. The hook is in the wrong place and cannot verify."
}
Set-Location $root

# A silently disabled gate cannot fake a fresh timestamp, so this is how to check it is alive.
Set-Content -LiteralPath (Join-Path $root '.claude\.verify-gate-last-run') `
            -Value (Get-Date -Format 'o') -Encoding utf8

# -z gives NUL-separated, unquoted paths. Without it git escapes non-ASCII names
# (core.quotepath) and Test-Path silently misses them.
$changed = @()
$fields = (git status --porcelain -z 2>$null) -split "`0" | Where-Object { $_ -ne '' }
for ($i = 0; $i -lt $fields.Count; $i++) {
  $entry = $fields[$i]
  if ($entry.Length -lt 4) { continue }
  $status = $entry.Substring(0, 2)
  $path = $entry.Substring(3)
  # A rename emits the old path as the next field. Consume it.
  if ($status -match '[RC]') { $i++ }
  if ($path -match '\.(ts|tsx|mts)$' -and (Test-Path -LiteralPath $path)) {
    $changed += $path
  }
}
if ($changed.Count -eq 0) { exit 0 }

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

$out = (& (Tool 'eslint') @changed 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { $problems += "[eslint] FAIL`n$out" }

$out = (& (Tool 'vitest') related --run @changed 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { $problems += "[vitest related] FAIL`n$out" }

if ($problems.Count -gt 0) {
  Deny (@(
    '=== VERIFY GATE: this turn cannot end ==='
    ($problems -join "`n`n")
    'Fix the code. Do not edit a test to make it pass.'
    'If the UI changed: rebuild, click through it, and paste the runtime evidence.'
  ) -join "`n`n")
}

exit 0
