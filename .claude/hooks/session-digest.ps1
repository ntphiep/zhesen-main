#Requires -Version 7
<#
SessionStart hook (startup, resume, clear). Plain stdout on exit 0 becomes context the session
reads before its first prompt (https://code.claude.com/docs/en/hooks).

It fast-forwards the main checkout, then prints what a session cannot see from the tree it
starts in: the open work on the ZHESEN board, which session runs in which worktree with what
uncommitted, and what landed since the previous session started. A section that fails prints
one line and the rest carry on; this hook never stops a session from starting.
#>

$ErrorActionPreference = 'Continue'
# Git prints UTF-8, and the digest carries issue titles and commit subjects through as-is.
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$in = try { [Console]::In.ReadToEnd() | ConvertFrom-Json } catch { $null }

$common = git -C ($in.cwd ?? $PSScriptRoot) rev-parse --path-format=absolute --git-common-dir 2>$null
if (-not $common) { exit 0 }
$main = [IO.Path]::GetFullPath((Split-Path $common -Parent))

# Shared by every worktree, so "previous session" means the previous start of any session.
$stateFile = Join-Path $common 'claude-session-digest.json'
$last = try { Get-Content -LiteralPath $stateFile -Raw -ErrorAction Stop | ConvertFrom-Json } catch { $null }
$since = if ($last.at) { [DateTimeOffset]::FromUnixTimeSeconds($last.at) } else { [DateTimeOffset]::UtcNow.AddDays(-7) }
$sinceIso = $since.UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ssZ')

# The three network calls run as jobs against one deadline, so a stalled connection costs a
# section, never the hook's 30 s timeout. A call still running then is skipped and killed.
$deadline = [DateTime]::UtcNow.AddSeconds(18)
function Wait-Deadline($Jobs) {
  $null = Wait-Job $Jobs -Timeout ([Math]::Max(1, [int]($deadline - [DateTime]::UtcNow).TotalSeconds))
}
$query = @'
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
'@
$boardJob = Start-ThreadJob { gh api graphql -f query=$using:query -f since=$using:sinceIso 2>&1 | Out-String }
$wikiDir = Join-Path $common 'claude-wiki.git'
$wikiJob = Start-ThreadJob {
  $dir = $using:wikiDir
  if (Test-Path -LiteralPath $dir) { git -C $dir fetch --quiet --prune origin 2>&1 | Out-Null }
  else { git clone --quiet --mirror https://github.com/ntphiep/zhesen-main.wiki.git $dir 2>&1 | Out-Null }
  git -C $dir log --since=$using:sinceIso --format='@%s' --name-only master 2>$null
}

$fetchJob = Start-ThreadJob { git -C $using:main fetch --quiet origin 2>$null }

Wait-Deadline $fetchJob
$tip = git -C $main rev-parse --short origin/master 2>$null
$out = [Collections.Generic.List[string]]::new()
$out.Add("# Project state at session start (.claude/hooks/session-digest.ps1)")
if ($fetchJob.State -ne 'Completed') { $out.Add('git fetch did not finish in time, so origin/master below may be behind GitHub.') }

# The main checkout is what CLAUDE_PROJECT_DIR hooks and new sessions read, and no session
# edits it, so it only moves forward here.
$branch = git -C $main symbolic-ref --quiet --short HEAD 2>$null
$head = git -C $main rev-parse --short HEAD 2>$null
if ($branch -eq 'master' -and $tip -and $head -ne $tip) {
  git -C $main merge-base --is-ancestor HEAD origin/master 2>$null
  if ($LASTEXITCODE -ne 0) {
    $out.Add("Main checkout: master holds commits not on origin/master, so it was not fast-forwarded.")
  } else {
    $err = git -C $main merge --ff-only --quiet origin/master 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0) {
      $moved = git -C $main diff --name-only $head $tip -- AGENTS.md CLAUDE.md .claude
      $out.Add("Main checkout: fast-forwarded $head..$tip.")
      if ($moved) {
        $out.Add("Instruction files changed in that range; a session started in the main checkout loaded the old copy, so re-read: $($moved -join ', ').")
      }
    } else {
      $out.Add("Main checkout: fast-forward refused: $(($err -split "`n")[0].Trim())")
    }
  }
}

# Worktrees, and the sessions whose working directory is inside each one. The session files
# are Claude Code's own and undocumented; when their shape changes this part goes quiet.
$trees = [Collections.Generic.List[hashtable]]::new()
foreach ($line in (git -C $main worktree list --porcelain 2>$null)) {
  if ($line -like 'worktree *') { $trees.Add(@{ path = [IO.Path]::GetFullPath($line.Substring(9)); branch = 'detached'; sessions = @() }) }
  elseif ($line -like 'branch *') { $trees[-1].branch = $line.Substring(7) -replace '^refs/heads/', '' }
  elseif ($line -like 'prunable*') { $trees[-1].prunable = $true }
}
function Find-Tree([string]$Path) {
  $dir = [IO.Path]::GetFullPath($Path).TrimEnd('\') + '\'
  $trees | Where-Object { $dir.StartsWith($_.path.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) } |
    Sort-Object { $_.path.Length } -Descending | Select-Object -First 1
}
$sessionDir = Join-Path ($env:CLAUDE_CONFIG_DIR ?? (Join-Path $HOME '.claude')) 'sessions'
foreach ($file in (Get-ChildItem -LiteralPath $sessionDir -Filter *.json -ErrorAction SilentlyContinue)) {
  $s = try { Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json } catch { $null }
  if (-not $s.cwd -or -not (Get-Process -Id $s.pid -ErrorAction SilentlyContinue)) { continue }
  $owner = Find-Tree $s.cwd
  if (-not $owner) { continue }
  $owner.sessions += if ($s.sessionId -eq $in.session_id) { "$($s.name) (this session)" } else { "$($s.name) $($s.status)" }
}
$out.Add('')
$out.Add('## Worktrees and sessions')
foreach ($t in $trees) {
  $name = if ($t.path -eq $main) { 'main checkout' }
          elseif ($t.path.StartsWith("$main\", [StringComparison]::OrdinalIgnoreCase)) { $t.path.Substring($main.Length + 1) }
          else { $t.path }
  if ($t.prunable) { $out.Add("- $name ($($t.branch)): directory missing, clear it with ``git worktree prune``"); continue }
  $counts = (git -C $t.path rev-list --left-right --count origin/master...HEAD 2>$null) -split '\s+'
  $drift = if ($counts.Count -eq 2) { "$($counts[1]) ahead, $($counts[0]) behind origin/master" } else { 'no origin/master' }
  $dirty = @(git -C $t.path status --porcelain 2>$null | ForEach-Object { $_.Substring(3) })
  $files = if ($dirty.Count -eq 0) { 'clean' } else {
    "$($dirty.Count) uncommitted: $(($dirty | Select-Object -First 4) -join ', ')$(if ($dirty.Count -gt 4) { ', ...' })"
  }
  $who = if ($t.sessions) { "sessions: $($t.sessions -join ', ')" } else { 'no session' }
  $out.Add("- $name ($($t.branch), $drift): $who; $files")
}
$here = Find-Tree ($in.cwd ?? $main)
$out.Add('')
if (-not $here -or $here.path -eq $main) {
  $out.Add('This session is in the main checkout. Before the first edit, call EnterWorktree with a short task name and run `npm ci` there (AGENTS.md, "One session, one worktree").')
} else {
  $out.Add("This session is in the worktree $($here.path) on $($here.branch). Edit here, ship with /ship, and leave the main checkout alone.")
}

# Board: what is open, what is in hand, what comes first.
$out.Add('')
Wait-Deadline @($boardJob, $wikiJob)
$raw = if ($boardJob.State -eq 'Completed') { Receive-Job $boardJob | Out-String } else { 'the GitHub call did not finish in time' }
$data = try { ($raw | ConvertFrom-Json).data } catch { $null }
if (-not $data.user) {
  $reason = (($raw ?? '') -split "`n")[0].Trim()
  $out.Add("## Board: unavailable ($($reason.Substring(0, [Math]::Min(120, $reason.Length))))")
} else {
  $items = $data.user.projectV2.items
  $open = @($items.nodes | Where-Object { $_.content.state -eq 'OPEN' })
  $out.Add("## Board ZHESEN (https://github.com/users/ntphiep/projects/2): $($open.Count) open")
  $inHand = @($open | Where-Object { $_.status.name -in 'In Progress', 'In Review' })
  if ($inHand) { $inHand | ForEach-Object { $out.Add("- $($_.status.name): #$($_.content.number) $($_.content.title)") } }
  else { $out.Add('- Nothing is In Progress or In Review.') }
  $open | Where-Object { $_.status.name -eq 'Todo' -and $_.priority.name -match '^P[01]' } |
    Sort-Object { $_.priority.name }, { $_.content.number } |
    ForEach-Object { $out.Add("- $(($_.priority.name -split ':')[0]) #$($_.content.number) $($_.content.title)") }
  $byPriority = $open | Group-Object { if ($_.priority.name) { ($_.priority.name -split ':')[0] } else { 'no priority' } } |
    Sort-Object { $_.Name -notlike 'P*' }, Name | ForEach-Object { "$($_.Name) $($_.Count)" }
  $out.Add("- Open by priority: $($byPriority -join ', ').")
  $stale = @($items.nodes | Where-Object { $_.content.state -eq 'CLOSED' -and $_.status.name -ne 'Done' })
  if ($stale) { $out.Add("- $($stale.Count) closed issues are not in Done: $(($stale | ForEach-Object { "#$($_.content.number)" }) -join ', ').") }
  if ($items.totalCount -gt 100) { $out.Add("- The board holds $($items.totalCount) items; only the first 100 were read.") }
}

# What changed since the previous session started.
$out.Add('')
$out.Add("## Since the previous session started ($($since.ToLocalTime().ToString('yyyy-MM-dd HH:mm')))")
$known = $false
if ($last.master) { git -C $main cat-file -e "$($last.master)^{commit}" 2>$null; $known = $LASTEXITCODE -eq 0 }
$log = @(if ($known) { git -C $main log --format='%h %s' "$($last.master)..origin/master" 2>$null }
         else { git -C $main log --format='%h %s' --since=$sinceIso origin/master 2>$null })
if ($log) {
  $out.Add("Commits on origin/master ($($log.Count)):")
  $log | Select-Object -First 15 | ForEach-Object { $out.Add("- $_") }
  if ($log.Count -gt 15) { $out.Add("- ... $($log.Count - 15) more: git log $(if ($known) { "$($last.master)..origin/master" } else { "--since=$sinceIso origin/master" })") }
} else { $out.Add('No new commits on origin/master.') }
if ($data.repository) {
  foreach ($kind in 'opened', 'closed') {
    $field = if ($kind -eq 'opened') { 'createdAt' } else { 'closedAt' }
    $hits = @($data.repository.$kind.nodes | Where-Object { [DateTimeOffset]$_.$field -gt $since })
    if (-not $hits) { continue }
    $label = if ($kind -eq 'opened') { 'Issues opened and still open' } else { 'Issues closed' }
    $out.Add("$label ($($hits.Count)): $(($hits | Select-Object -First 10 | ForEach-Object { "#$($_.number) $($_.title)" }) -join '; ')$(if ($hits.Count -gt 10) { '; ...' })")
  }
}
$wikiLog = if ($wikiJob.State -eq 'Completed') { Receive-Job $wikiJob }
$pages = [ordered]@{}
$subject = $null
foreach ($line in $wikiLog) {
  if ($line -like '@*') { $subject = $line.Substring(1) }
  # Pages only: images/ and dotfiles are not something a session reads.
  elseif ($line -match '^[^./][^/]*\.md$' -and -not $pages.Contains($line)) { $pages[$line] = $subject }
}
if ($pages.Count) {
  $out.Add('Wiki pages changed (https://github.com/ntphiep/zhesen-main/wiki), read the ones that bear on the task:')
  foreach ($p in $pages.Keys) { $out.Add("- $($p -replace '\.md$', ''): $($pages[$p])") }
}

# Without the issue lists this run reported nothing about issues, so the window stays open.
if ($data.repository) {
  @{ at = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds(); master = (git -C $main rev-parse origin/master 2>$null) } |
    ConvertTo-Json -Compress | Set-Content -LiteralPath $stateFile -Encoding utf8
}

$out -join "`n"

# A git or gh still running inherited this hook's stdout and holds it open. Measured against a
# proxy that never answers: 21.4 s with this cleanup, still waiting after 60 s without it.
if (@($fetchJob, $boardJob, $wikiJob).State -contains 'Running') {
  Get-CimInstance Win32_Process -Filter "ParentProcessId = $PID" -ErrorAction SilentlyContinue |
    ForEach-Object { taskkill /T /F /PID $_.ProcessId 2>&1 | Out-Null }
}
exit 0
