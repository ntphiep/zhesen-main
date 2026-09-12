# PostToolUse hook (Write|Edit): chay eslint tren dung file vua sua, day loi vao context.
# Non-blocking: luon exit 0. Chi bao loi qua additionalContext de Claude sua ngay.
$ErrorActionPreference = 'Continue'
$root = 'C:\Users\Hiep\Desktop\chesen'
try {
  $raw = [Console]::In.ReadToEnd()
  if (-not $raw) { exit 0 }
  $j = $raw | ConvertFrom-Json
  $f = $j.tool_input.file_path
  if (-not $f) { exit 0 }
  if ($f -notmatch '\.(ts|tsx)$') { exit 0 }
  if ($f -notlike "$root*") { exit 0 }
  if (-not (Test-Path $f)) { exit 0 }
  $eslint = Join-Path $root 'node_modules\.bin\eslint.cmd'
  if (-not (Test-Path $eslint)) { exit 0 }
  Set-Location $root
  $out = (& $eslint $f 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) {
    $ctx = "eslint bao loi o file vua sua ($f):`n$out`nSua ngay truoc khi lam tiep."
    $payload = @{ hookSpecificOutput = @{ hookEventName = 'PostToolUse'; additionalContext = $ctx } } | ConvertTo-Json -Depth 6 -Compress
    Write-Output $payload
  }
  exit 0
} catch {
  exit 0
}
