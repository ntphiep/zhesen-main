#Requires -Version 7
<#
Stop hook. Holds the project's rule that a turn touching TypeScript is not over
until lint, types and the related tests agree.

Two failures this script exists to avoid, both of which actually happened here:

1. It locates the repository from its own path, never from a hard-coded one. The
   previous version pinned C:\Users\Hiep\Desktop\chesen; the folder was renamed
   to zhesen and the gate went dead for months without a word.
2. A tool it cannot find is a BLOCK, not a skip. The previous version wrapped
   each check in `if (Test-Path $tool)`, so a wrong root meant every check was
   skipped, $problems stayed empty, and the gate reported success having run
   nothing. A gate that cannot check must never claim the code is clean.

Contract (https://code.claude.com/docs/en/hooks):
  exit 0  the turn may end
  exit 2  the turn may not end; stderr becomes the reason Claude is given
  exit 1  does NOT block. Never use it to enforce anything.
#>

$ErrorActionPreference = 'Continue'

function Deny([string]$Message) {
  [Console]::Error.WriteLine($Message)
  exit 2
}

# --- Anti-loop -------------------------------------------------------------
# stop_hook_active is true when Claude is already continuing because of this
# hook. Blocking again on a condition the model cannot resolve would spin until
# Claude Code's own 8-block ceiling cuts it off.
try {
  $raw = [Console]::In.ReadToEnd()
  if ($raw) {
    $stdin = $raw | ConvertFrom-Json
    if ($stdin.stop_hook_active) { exit 0 }
  }
} catch {
  # Unparseable stdin is not a reason to let unverified code through, but it is
  # also not evidence of a problem. Carry on and let the checks decide.
}

# --- Locate the repository -------------------------------------------------
# $PSScriptRoot is <repo>\.claude\hooks, so the repo is two levels up. This is
# independent of the working directory, of $env:CLAUDE_PROJECT_DIR, and of git.
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not (Test-Path (Join-Path $root 'package.json'))) {
  Deny "verify-gate: khong tim thay package.json o '$root'. Hook nam sai cho, khong the verify."
}
Set-Location $root

# Heartbeat. The one thing a silently disabled gate cannot fake is a fresh
# timestamp here, so it is how you check the gate is alive.
Set-Content -LiteralPath (Join-Path $root '.claude\.verify-gate-last-run') `
            -Value (Get-Date -Format 'o') -Encoding utf8

# --- Which files changed ---------------------------------------------------
# -z gives NUL-separated, unquoted paths: without it git escapes non-ASCII names
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

# --- The checks ------------------------------------------------------------
# Mirrors `npm run verify` in package.json, minus the whole-suite test run:
# `vitest related` walks the module graph instead, so only tests that actually
# import a changed file run.
function Tool([string]$Name) {
  $path = Join-Path $root "node_modules\.bin\$Name.cmd"
  if (-not (Test-Path -LiteralPath $path)) {
    Deny "verify-gate: thieu node_modules\.bin\$Name.cmd. Chay 'npm ci' roi thu lai. KHONG bo qua buoc nay: mot moi truong khong chay duoc kiem tra thi khong the tuyen bo code sach."
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
    '=== VERIFY GATE: chua the ket thuc luot ==='
    ($problems -join "`n`n")
    'Sua cho hong, dung sua test cho qua.'
    'Neu vua doi giao dien: build lai roi mo app bam thu, va dan bang chung runtime.'
  ) -join "`n`n")
}

exit 0
