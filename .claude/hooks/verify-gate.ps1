# Stop hook: verify gate cho chesen. Chi chay khi working tree co file .ts/.tsx thay doi.
# Chay tsc --noEmit (toan project) + eslint (file da doi) + vitest (test lien quan).
# BLOCKING: neu bat ky buoc nao fail thi exit 2 va day loi ra stderr, buoc Claude sua
# truoc khi ket thuc luot. Neu khong co code thay doi thi exit 0 (bo qua, nhanh).
$ErrorActionPreference = 'Continue'
$root = 'C:\Users\Hiep\Desktop\chesen'
try {
  Set-Location $root
  $porcelain = (git status --porcelain 2>$null)
  $paths = @()
  foreach ($line in ($porcelain -split "`r?`n")) {
    if ($line.Length -lt 4) { continue }
    $p = $line.Substring(3).Trim()
    if ($p -match ' -> ') { $p = ($p -split ' -> ')[-1] }
    $p = $p.Trim('"')
    # Bo qua file da xoa hoac da doi ten di noi khac: git status van liet ke chung,
    # nhung eslint se bao loi "No files matching the pattern" va chan nham.
    if ($p -match '\.(ts|tsx)$' -and (Test-Path -LiteralPath $p)) { $paths += $p }
  }
  if ($paths.Count -eq 0) { exit 0 }

  $problems = @()

  # 1. tsc --noEmit toan project (bat loi type, ranh gioi server/client)
  $tsc = Join-Path $root 'node_modules\.bin\tsc.cmd'
  if (Test-Path $tsc) {
    $o = (& $tsc --noEmit 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { $problems += "[tsc --noEmit] FAIL:`n$o" }
  }

  # 2. eslint cac file da doi
  $eslint = Join-Path $root 'node_modules\.bin\eslint.cmd'
  if (Test-Path $eslint) {
    $o = (& $eslint @paths 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { $problems += "[eslint] FAIL:`n$o" }
  }

  # 3. vitest cho test lien quan (map basename cua file doi sang test file)
  $vitest = Join-Path $root 'node_modules\.bin\vitest.cmd'
  if (Test-Path $vitest) {
    $testFiles = @()
    foreach ($p in $paths) {
      $base = [System.IO.Path]::GetFileNameWithoutExtension($p)
      $base = $base -replace '\.test$', ''
      if (-not $base) { continue }
      $found = Get-ChildItem -Path (Join-Path $root 'test') -Recurse -Filter "*$base*.test.*" -ErrorAction SilentlyContinue
      foreach ($m in $found) { $testFiles += $m.FullName }
    }
    $testFiles = $testFiles | Sort-Object -Unique
    if ($testFiles.Count -gt 0) {
      $o = (& $vitest run @testFiles 2>&1 | Out-String)
      if ($LASTEXITCODE -ne 0) { $problems += "[vitest test lien quan] FAIL:`n$o" }
    }
  }

  if ($problems.Count -gt 0) {
    $msg = "=== VERIFY GATE chesen: co loi, phai sua truoc khi ket thuc luot ===`n" + ($problems -join "`n`n")
    $msg += "`n`nNhac: tinh nang UI phai mo app that va bam thu; doi du lieu phai COUNT/query dan so lieu."
    [Console]::Error.WriteLine($msg)
    exit 2
  }
  exit 0
} catch {
  [Console]::Error.WriteLine("verify-gate hook loi noi bo (khong chan): $_")
  exit 0
}
