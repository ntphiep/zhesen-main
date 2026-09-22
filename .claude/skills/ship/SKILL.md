---
name: ship
description: Push the current work, watch CI to green, and check the deployed site. Use when asked to push, deploy, ship or release, and as the last step of a piece of work that is meant to reach production.
disable-model-invocation: true
---

# Ship what is committed

Pushing to `master` deploys to production. Do not run this to "see if it works".

## 1. The tree has to be clean and checked

```bash
git status --porcelain
npm run verify
```

`git status --porcelain` must print nothing. A scratch file, a `*.png` or a stray log at the
root is not shippable. `npm run verify` must exit 0; its result is what "checked" means here.

Confirm the identity before the first push of a session:

```bash
git log -1 --format='%an <%ae>'
```

It must be `Harry Nguyen <ng.hiep0822@gmail.com>`. Another name is a stop, not a warning.

## 2. Push

```bash
git push origin master
```

Never force push. The project's own deny rules block it, and a blocked command is the rule
working, not an obstacle to route around.

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

## 5. Report

One report, at the end, covering: what shipped, the CI verdict, the deployment state, what
you exercised on the live site and what it returned. Name anything you could not check.

A migration in the push needs its own line: what it changed, and the count that proves it
landed.
