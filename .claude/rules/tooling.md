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

Production still runs on Supabase Cloud project `cvltsyoweddhpkomuevz`. The self-hosted
stack in `infra/` is built but not cut over: on 2026-09-23 the Vercel project's
`NEXT_PUBLIC_SUPABASE_URL` is still `https://cvltsyoweddhpkomuevz.supabase.co` and the anon
key is still the `sb_publishable_` one, and `infra/README.md` names changing both as the
cutover step. Check those two variables before claiming either database is live.

Measure the Cloud project through composio: `SUPABASE_RUN_READ_ONLY_QUERY` with
`ref: cvltsyoweddhpkomuevz`. There is no `psql` and no `supabase` CLI on this machine. The
EC2 instance is reachable through `aws ssm start-session` or the Studio tunnel in
`infra/README.md`.
