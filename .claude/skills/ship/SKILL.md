---
name: ship
description: Push the current work, watch CI to green, and check the deployed site. Use when asked to push, deploy, ship or release, and as the last step of a piece of work that is meant to reach production.
disable-model-invocation: true
---

# Ship what is committed

Pushing to `master` deploys to production. Do not run this to "see if it works".

Run it from the session's worktree, never from the main checkout (`AGENTS.md`, "One session,
one worktree").

## 1. The tree has to be current, clean and checked

```bash
git status --porcelain
git fetch origin
git rebase origin/master
npm run verify
```

`git status --porcelain` must print nothing. A scratch file, a `*.png` or a stray log at the
root is not shippable. Other sessions push to `master` too, so rebase before verifying; a
conflict is theirs and yours to reconcile, never a reason to force anything. `npm run verify`
must exit 0 on the rebased tree; its result is what "checked" means here.

Confirm the identity before the first push of a session:

```bash
git log -1 --format='%an <%ae>'
```

It must be `Harry Nguyen <ng.hiep0822@gmail.com>`. Another name is a stop, not a warning.

## 2. Push

```bash
git push origin HEAD:master
```

A rejected push means `master` moved again: repeat step 1. Never force push. The project's
own deny rules block it, and a blocked command is the rule working, not an obstacle to route
around.

## 3. Watch CI to a verdict

```bash
gh run watch --repo ntphiep/zhesen-main --exit-status
```

Four jobs: lint, types and tests; migration hygiene; production build; deploy. `deploy` runs
only when the other three are green. A red job is the result; report it with the failing
step's log and stop.

## 4. Check what actually shipped

Read the deployment rather than assuming it. Use composio's Vercel toolkit, not
`mcp__vercel__*`, which is not authorised for this team and answers 403:

- `VERCEL_GET_DEPLOYMENTS` for the state of the newest one.
- `VERCEL_GET_DEPLOYMENT_EVENTS` when the build state is not `READY`.

Find the exact slugs with `COMPOSIO_SEARCH_TOOLS` first; do not guess them.

Then exercise the live site for the flow this change touched. `/verify-ui` has the
procedure; point it at `https://zhesen-main.vercel.app` instead of a local build.

## 5. Leave the worktree

Once the deployment checks out, call `ExitWorktree` with `remove`. Every tracked file is on
`master` by now; subagent notes are not. `.worktreeinclude` copies `.claude/agent-memory/`
in when the worktree is created and subagents write new notes to that copy, so first carry
them back from PowerShell in the worktree:

```powershell
$main = Split-Path (git rev-parse --path-format=absolute --git-common-dir) -Parent
git diff --no-index --stat -- "$main\.claude\agent-memory" .claude\agent-memory
```

On macOS and Linux, from bash in the worktree:

```bash
main=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
git diff --no-index --stat -- "$main/.claude/agent-memory" .claude/agent-memory
```

Copy each new note across with `Copy-Item` or `cp`. A changed `MEMORY.md` gets only its new
lines, appended to the main copy with `Add-Content` or `>>`, since another session may have
added its own.

## 6. Report

One report, at the end, covering: what shipped, the CI verdict, the deployment state, what
you exercised on the live site and what it returned. Name anything you could not check.

A migration in the push needs its own line: what it changed, and the count that proves it
landed.
