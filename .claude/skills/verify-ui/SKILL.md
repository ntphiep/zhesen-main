---
name: verify-ui
description: Build, serve and click through this app to prove a UI change works. Use whenever a change touches app/ or components/ and before reporting any user-visible work as done, or when asked to run, screenshot or click through the site.
---

# Verify a UI change against the running app

`next start` serves the last build. Editing code without rebuilding means clicking through
the previous version, which is the most repeated mistake in this project's history.

## Procedure

1. Pick a port nothing listens on. Other sessions serve their own worktrees, so a process on
   3000 is someone else's server: never stop it, and never test against it.

   ```powershell
   $port = 3000..3020 | Where-Object {
     -not (Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue)
   } | Select-Object -First 1
   ```

   On macOS and Linux (`/dev/tcp` is bash's, so the probe runs in bash even from zsh):

   ```bash
   port=$(bash -c 'for p in $(seq 3000 3020); do (: </dev/tcp/127.0.0.1/$p) 2>/dev/null || { echo $p; break; }; done')
   ```

2. `npm run build`. A build failure is the answer; stop and report it with its output.
3. `npm run start -- -p $port` in the background, and browse `http://localhost:$port`.
4. Drive the browser with `mcp__plugin_playwright_playwright__browser_*`. It launches its
   own browser, so nothing has to be running first. Walk the flow the change actually
   touches, and the flow nearest it that could have broken.
5. Collect, every time:
   - console errors and warnings (`browser_console_messages`)
   - failed or slow requests with URL and duration (`browser_network_requests`)
   - a screenshot of the changed screen, written to `.playwright-mcp/`, which is gitignored.
     Playwright rejects a path outside the workspace, so do not try to write elsewhere.
6. Repeat the same flow at 390x844 (`browser_resize`). Every change that renders gets this;
   phone breakage counts as breakage, and the header overflow that broke every phone was
   found this way.
7. Stop the server you started, confirm `$port` is free, and confirm `git status` is clean.

## When the question is performance

Swap step 4 for `mcp__plugin_chrome-devtools-mcp_chrome-devtools__*`:
`performance_start_trace`, then the interaction, then `performance_stop_trace` and
`performance_analyze_insight`. `lighthouse_audit` answers a Core Web Vitals question in one
call. Use `mcp__chrome-devtools__*` without the `plugin_` prefix only when a Chrome is
already listening on port 9222; otherwise it fails to connect.

## Checking the deployed site instead of a local build

Skip steps 1 to 3 and point the browser at `https://zhesen-main.vercel.app`. For a
server-side failure, read the deployment's logs through composio's Vercel toolkit rather
than guessing from the status code; `mcp__vercel__*` is not authorised for this team.

## Reporting

Paste the evidence, not a summary of it: the console output, the request URL with its
milliseconds, the screenshot path. "It works" without evidence is not a result.

If the change could not be exercised (no data, no account, unreachable service), say which
step blocked it rather than reporting the rest as success.
