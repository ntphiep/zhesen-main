---
name: verify-ui
description: Build, serve and click through this app to prove a UI change works. Use whenever a change touches app/ or components/ and before reporting any user-visible work as done, or when asked to run, screenshot or click through the site.
---

# Verify a UI change against the running app

`next start` serves the last build. Editing code without rebuilding means clicking through
the previous version, which is the most repeated mistake in this project's history.

## Procedure

1. Free the port first, so Next does not silently move to 3001 and leave you testing an old
   process:

   ```powershell
   Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
     ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
   ```

2. `npm run build`. A build failure is the answer; stop and report it with its output.
3. `npm run start` in the background on port 3000.
4. Drive the browser with the chrome-devtools MCP tools. Walk the flow the change actually
   touches, and the flow nearest it that could have broken.
5. Collect, every time:
   - console errors and warnings (`list_console_messages`)
   - failed or slow requests with URL and duration (`list_network_requests`)
   - a screenshot of the changed screen, written outside the repository
6. Repeat the same flow at 390x844. Every change that renders gets this; phone breakage
   counts as breakage, and the header overflow that broke every phone was found this way.
7. Stop the server and confirm port 3000 is free and `git status` is clean.

## Reporting

Paste the evidence, not a summary of it: the console output, the request URL with its
milliseconds, the screenshot path. "It works" without evidence is not a result.

If the change could not be exercised (no data, no account, unreachable service), say which
step blocked it rather than reporting the rest as success.
