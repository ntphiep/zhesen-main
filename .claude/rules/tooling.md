# Tooling available on this machine

This file has no `paths`, so it loads in every session. It exists because sessions kept
rediscovering, or failing to discover, what is already connected.

## On PATH

`gh` 2.94, authenticated as `ntphiep` with the `repo`, `workflow` and `project` scopes, so
issues, the board and CI runs all work from the shell. `node` 24, `npm` 11.

Not installed: `supabase`, `vercel`, `psql`, and `terraform` (which lives at the WinGet path
in `infra/README.md`). Do not write a command around them without checking first.

## MCP servers

| Reach for | Tool prefix | Use it for |
| --- | --- | --- |
| Playwright | `mcp__plugin_playwright_playwright__browser_*` | Clicking through the app. Launches its own browser. |
| Chrome DevTools | `mcp__plugin_chrome-devtools-mcp_chrome-devtools__*` | Performance traces, Lighthouse, network timing. Launches its own browser. |
| Vercel | composio `VERCEL_*` | Deployments, env vars, build logs. |
| Composio | `mcp__composio__*` | Everything else. See below. |

`mcp__chrome-devtools__*` without the `plugin_` prefix is a second, user-level server
configured with `--browserUrl http://127.0.0.1:9222`. It fails unless a Chrome is already
listening on that port. Use the plugin one.

Both browser servers hold one shared profile per machine, so a second agent running at the
same time locks the first out. Playwright then answers `Browser is already in use for
...mcp-chrome-<hash>, use --isolated`, and chrome-devtools answers the same for
`...chrome-profile`. Do not retry a call that returned it. Try Playwright, then
chrome-devtools with `new_page` and a named `isolatedContext`, which also gives a clean
cookie jar per context.

MCP tools are deferred: only their names are in context. Call `ToolSearch` with
`select:<name>` to load a schema before calling it.

## Composio

One HTTP server at `connect.composio.dev` fronting many products. Call
`COMPOSIO_SEARCH_TOOLS` with the use case first; it returns the tool slugs and a plan. Then
run them through `COMPOSIO_MULTI_EXECUTE_TOOL`. Never invent a slug.

Connected and active: `github`, `supabase`, `vercel`, `firecrawl`, `gmail`, `slack`,
`googlesheets`, `googledocs`, `googledrive`, `airtable`, `excel`, `databricks`, `linkedin`,
`twitter`, `telegram`, `instagram`, `facebook`, `youtube`, `news_api`, `notebook_lm`,
`xero`.

Order of preference: `gh` for anything GitHub, because it is the most context-efficient and
already authenticated; composio for everything else.

`mcp__vercel__*` is connected but not authorised for the team that owns this project. It
answers `403 Forbidden: Not authorized: Trying to access resource under scope "zhesen"`.
Composio's `vercel` toolkit reaches the same project and works, so use it instead until that
scope is re-authenticated.

`firecrawl` is the scraper worth knowing about when `WebFetch` is blocked or a page needs
JavaScript.

## Reading the database

Production runs on the self-hosted Supabase in `infra/` since 2026-09-23. The Vercel
project's `NEXT_PUBLIC_SUPABASE_URL` is `https://dzt4vtlz9hm79.cloudfront.net` and the anon
key is the legacy JWT. Check those two variables before claiming which database is live.

Measure production on the instance: `aws ssm start-session` or `aws ssm send-command`
against the `instance_id` output of `infra/terraform`, then
`docker exec supabase-db psql -U supabase_admin -d postgres`. The Studio tunnel in
`infra/README.md` gives the same data with a UI. There is no `psql` and no `supabase` CLI on
this machine.

The Cloud project `cvltsyoweddhpkomuevz` is a frozen copy kept until 2026-10-23 for
rollback. Composio's `SUPABASE_RUN_READ_ONLY_QUERY` with `ref: cvltsyoweddhpkomuevz` reads
that copy, not production.

## Which plugin skill to reach for

Around 200 skills are installed, most of them for other projects. These are the ones that
earn their context here. Invoke by the exact name; the rest are noise, so do not go
shopping through the list.

| Doing this | Invoke |
| --- | --- |
| Shaping a vague request before planning | `superpowers:brainstorming` |
| Writing a plan or a spec | `superpowers:writing-plans`, `agent-skills:planning-and-task-breakdown` |
| Carrying out an agreed plan | `superpowers:executing-plans`, `agent-skills:incremental-implementation` |
| A bug whose cause is not obvious | `superpowers:systematic-debugging` |
| Writing tests, or a failing test first | `superpowers:test-driven-development` |
| Reviewing a diff | `agent-skills:code-review-and-quality` |
| Anything touching auth, RLS or a token | `agent-skills:security-and-hardening` |
| Writing SQL or a migration | `supabase:supabase-postgres-best-practices` |
| A slow page or a Core Web Vitals question | `chrome-devtools-mcp:debug-optimize-lcp`, `agent-skills:performance-optimization` |
| Keyboard, focus or contrast work | `chrome-devtools-mcp:a11y-debugging` |
| Cutting code rather than adding it | `agent-skills:code-simplification` |
| Before calling anything done | `superpowers:verification-before-completion` |

ponytail arrives on its own through a `SubagentStart` hook, in every subagent as well as the
main session. It is the house coding stance: reuse what is here, prefer the smallest change
that holds, and delete rather than add. Nothing has to invoke it.

Repository skills come first when both apply. `/verify-ui` outranks any general browser
skill, because it carries this project's build-then-click order and its phone-width step.
