# Upstream

Source: [supabase/supabase](https://github.com/supabase/supabase), `docker/`, commit
`7ce4ee53ae13c8e71e78580abef0a18059006d49`.

## Copied verbatim

Checked with `md5sum` against the upstream tree.

| File |
| --- |
| `volumes/api/envoy/envoy.yaml` |
| `volumes/api/envoy/docker-entrypoint.sh` |
| `volumes/db/_supabase.sql` |
| `volumes/db/jwt.sql` |
| `volumes/db/logs.sql` |
| `volumes/db/pooler.sql` |
| `volumes/db/realtime.sql` |
| `volumes/db/roles.sql` |
| `volumes/db/webhooks.sql` |

`cds.yaml` and `lds.template.yaml` are upstream plus two blocks each, marked
`Not upstream`: the `ai-router` and `omniroute` clusters, and the `/ai/v1/` route to
9router and the `/omni/v1/` route to OmniRoute. An upstream bump is a copy followed by
re-adding those four blocks.

`cds.yaml` still declares `realtime`, `storage` and `functions` clusters, and
`lds.template.yaml` still routes to them. Those hostnames do not resolve here, so
a request to one of those prefixes gets a 503 from Envoy. The CloudFront function
answers 403 to everything outside `/auth/v1/`, `/rest/v1/`, `/ai/v1/` and `/omni/v1/` before it
reaches the origin, so no client can produce that 503. It also refuses a dot segment or an
encoded slash inside those prefixes, because Envoy's `normalize_path` would resolve
`/omni/v1/../../` to a path outside them.

## Deviations in `docker-compose.yml`

| Change | Reason |
| --- | --- |
| Services removed: `realtime`, `storage`, `imgproxy`, `functions`, `supavisor` | None of them is used. The app reads PostgREST and GoTrue only. Dropping them takes roughly 1 GB of RSS off a 4 GB host. |
| `deno-cache` named volume removed | Only `functions` mounted it. |
| Service added: `sampler`, container `zhesen-sampler`, `python:3.13.15-alpine3.24`, 64m, `init: true` | Writes host and container counters to `admin.host_samples` every 5 s for `/admin/infra` (migration 0072). It mounts the Docker socket, `/proc` and `/` read-only. The socket is root on the host, as the SSM command it replaces is; `sampler.py` only sends GETs to it. |
| Service added: `ai-router`, container `zhesen-9router`, `decolua/9router:0.5.91`, 512m | The model router behind the assistant. Envoy serves its `/v1/` API at `/ai/v1/`, where 9router checks its own API key. Port 20128 is bound on every interface for the 9router CloudFront distribution, which 9router's own login guards; the security group admits that port from the CloudFront VPC origin only. `INITIAL_PASSWORD` comes from SSM `router_password`, and the entrypoint drops any password hash 9router stored itself before the image's own entrypoint runs. Its data, provider logins included, lives in `/opt/zhesen/9router`, outside the synced folder. |
| Service added: `omniroute`, container `zhesen-omniroute`, `diegosouzapw/omniroute:3.8.50`, 1400m | The assistant's second router, asked when 9router fails. Envoy serves its `/v1/` API at `/omni/v1/`, where OmniRoute checks its own API key (`REQUIRE_API_KEY`). Port 20130 is bound for the OmniRoute CloudFront distribution, which OmniRoute's login guards; the security group admits it from the CloudFront VPC origin only. The password is handled as for `ai-router`, from SSM `omniroute_password`. The limit is 1400m because OmniRoute sheds requests with 503 once its cgroup passes 92% of the limit, which happened at 900m, and once its V8 heap passes 93% of `OMNIROUTE_MEMORY_MB`, which happened at 512 MB; the heap is 768 MB. `STORAGE_ENCRYPTION_KEY` decrypts the provider logins in `/opt/zhesen/omniroute/data`. |
| `db` `shm_size: 256m` | Docker's default 64 MB `/dev/shm` failed a parallel hash join with `could not resize shared memory segment ... No space left on device`. |
| `auth` image `supabase/gotrue:v2.197.0` | Upstream pins v2.196.0. The Cloud project runs v2.197.0 with auth schema migration `20260831180000`; an older binary refuses a newer schema. |
| `api-gw` has no `depends_on: studio` | Upstream starts the gateway only after Studio is healthy. The API does not need Studio, so a Studio that fails its healthcheck no longer blocks `/auth/v1/` and `/rest/v1/`. |
| `api-gw` `ports: ["80:8000"]` | Upstream binds `${API_GW_HTTP_PORT:-8000}`. CloudFront reaches the origin on port 80. The security group admits only the CloudFront VPC origin's service-managed security group, so binding every interface exposes nothing further. |
| `db` `command` gains `shared_buffers=1GB`, `effective_cache_size=2560MB`, `maintenance_work_mem=256MB`, `work_mem=8MB`, `max_connections=100`, `random_page_cost=1.1`, `wal_compression=on`, `log_min_duration_statement=1000ms` | Upstream ships defaults sized for a laptop. These are sized for t4g.medium, 2 vCPU and 4 GB, on a gp3 volume. |
| `db` `log_min_messages=warning` replaces upstream's `fatal` | Upstream silences the log to hide Realtime's polling queries. Realtime is not run here. |
| `auth` gains twelve `GOTRUE_*` variables | Mirrors the Cloud project's auth settings, which are otherwise lost in the move. Each name is cited with its `CONFIG.md` line in the compose file. `GOTRUE_RATE_LIMIT_EMAIL_SENT` is set to the documented default of 30; Cloud had 2, which is issue #6. |
| `auth` has no `GOTRUE_SMTP_*` variables, and `env.template` sets `ENABLE_EMAIL_AUTOCONFIRM=true` | No mail is sent: sign-up and attaching an email to an anonymous account confirm at once, and the app offers no magic link or password reset. Revisit with real users. |
| `deploy.resources.limits.memory` on `studio` and `ai-router` (512m each), `meta`, `auth`, `rest`, `api-gw` (256m each) | Leaves the remainder of the 4 GB to Postgres. `db` has no limit, because a cgroup ceiling below what its own settings allocate means the OOM killer rather than a slower query. |
| `.env` is not committed | Rendered on the instance by `bin/render-env.sh` from SSM Parameter Store, mode 0600. `env.template` is the committed shape. |

## Deviations from `.env.example`

`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `ANON_KEY_ASYMMETRIC`,
`SERVICE_ROLE_KEY_ASYMMETRIC`, `JWT_KEYS` and `JWT_JWKS` are all empty, which puts
Envoy in legacy API key mode. The browser holds the Cloud anon JWT; swapping to
`sb_publishable_` keys would invalidate every session in flight, including the
anonymous account that holds 410 of the 444 saved words.

`PGRST_DB_SCHEMAS` is `public,graphql_public,lex,admin` and `PGRST_DB_EXTRA_SEARCH_PATH`
is `public,extensions`. The Cloud project had no `admin`; migration 0056 added it. The `authenticator` role also
carries `pgrst.db_schemas`; `bin/migrate.sh` replays it and the two must agree.
