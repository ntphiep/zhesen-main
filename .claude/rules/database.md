---
description: Postgres, PGroonga and migration rules for the lex schema
paths:
  - "supabase/**"
  - "lib/dictionary/**"
  - "lib/grammar/**"
---

# Database rules

Every claim here was measured on this project's Postgres. Re-measure before contradicting
one.

Production runs on the self-hosted Supabase in `infra/` since 2026-09-23: Vercel's
`NEXT_PUBLIC_SUPABASE_URL` is the CloudFront domain and the anon key is the legacy JWT.
The Cloud project `cvltsyoweddhpkomuevz` is a frozen copy kept until 2026-10-23, and
composio's `SUPABASE_RUN_READ_ONLY_QUERY` against that ref reads that copy, not production.
Measure production through `aws ssm send-command` or a Session Manager shell on the
instance: `docker exec supabase-db psql -U supabase_admin -d postgres`. There is no `psql`
on this machine.

## Writing SQL in the `lex` schema

- Pin `search_path` on every function in `lex`; do not qualify operators one at a time.
  `%`, `&@` and `&@~` live in the `extensions` schema, so whether a function answers or
  raises depends on the caller's `search_path`. `anon` and `authenticated` have
  `extensions`, so the application never sees it, but any other role gets
  `SQLSTATE 42883`. Qualifying operators individually was tried three times (`0034`,
  `0039`, `0042`) and each fix only moved the failure to the next operator. `0043` pins
  `search_path = lex, extensions, public` on all eight functions. The five functions in
  `public` have done the same since `0032`.
  https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
- `unaccent()` is STABLE, not IMMUTABLE, so it cannot appear directly in a generated column
  or an index (`ERROR 42P17`). Two routes exist: the text search configurations
  `lex.zhesen_en` and `lex.zhesen_es`, which carry `unaccent` in their dictionary chain, and
  the wrapper `extensions.immutable_unaccent()` for anything not going through a tsvector.
- Postgres only uses an index for a chain of `OR` when every branch is a condition on the
  table being scanned. One branch reaching another table loses the bitmap and scans the
  whole table. A new match source for `lex.search` belongs in its own `UNION` branch inside
  the `cand` CTE, not appended with `or`.
- Rank first, enrich second. The subqueries that fetch senses, pronunciation and audio run
  after `limit`, not for every candidate. `lex.search` and `lex.search_vi` both follow this;
  keep it.
- The candidate cap goes after the language filter, not before. Capping first serves a
  single-language query out of a pool drawn from all three.
- `= any (subquery)` is read as the `IN` form, not the array form. Comparing against an
  array returned by a CTE needs a cast: `e.id = any ((select ids from t)::text[])`.
- Before `alter function ... set pg_trgm.*`, run `select extensions.similarity('a','b')`
  in the same session. pg_trgm is not preloaded, so until something touches it the GUC is
  still a placeholder and the `alter` fails with `42501 permission denied to set parameter`.
  Never set a pg_trgm threshold on the role or the database, only on the function that
  needs it. `lex.search_vi` carried `pg_trgm.similarity_threshold = 0.45` from `0044` until
  `0048` removed trigram matching from it; `lex.suggest` is the remaining trigram caller.
- Match a Vietnamese query against `lex.gloss_terms`, never against the gloss string. The
  table holds one row per comma-separated term plus its classifier-stripped and unaccented
  forms, and two `text_pattern_ops` btree indexes answer prefix ranges over it. Two rules
  came out of measuring it. Write the range as `~>=~` and `~<~` rather than `like 'x%'`,
  because Postgres derives the bounds from `like` only when the pattern is a constant at
  plan time and inside a function it never is; `0049` cut 13,820 ms to 395 ms on that alone.
  And match the classifier-stripped form only for equality, never as a prefix: stripping
  "con cá" to "cá" and prefix-searching that pulled 5,921 candidate rows and 1,771 heap
  blocks, against 24 and 24 without it (`0052`).
- A data-modifying CTE and its main statement run on one snapshot, so a delete in the CTE
  never sees what the insert wrote, and the insert never sees what the delete removed.
  `lex.gloss_terms_reload` kept its delete in such a
  CTE from `0048` to `0067`, so the insert skipped every existing term through ON CONFLICT
  and the delete then removed it: en:cat went 47, 0, 47 on three calls. Put the delete in
  its own statement first.
  https://www.postgresql.org/docs/17/queries-with.html#QUERIES-WITH-MODIFYING
- A `language sql` function's body is not planned through the plan cache, so
  `plan_cache_mode = 'force_custom_plan'` does nothing on one; `0050` set it on
  `lex.search_vi` and changed no timing until `0051` rewrote the body in plpgsql. Both
  `SET` clauses have to be restated on every `create or replace`, which drops the ones it
  omits.

## PGroonga

- Never run `VACUUM FULL` on `lex.entries`. It rebuilds the indexes, and PGroonga creates a
  new Groonga file set keyed on the new `relfilenode` while the old set stays behind:
  measured, the database grew from 425 MB to 486 MB. A plain `vacuum lex.entries` is the way
  to reclaim space, because PGroonga hooks into it to drop surplus objects; one run returned
  105 MB. Check for surplus objects with
  `select extensions.pgroonga_command('object_list')`: each `Sources<relfilenode>` key must
  match the `relfilenode` of a live index in `pg_class`.
  https://pgroonga.github.io/reference/functions/pgroonga-vacuum.html
- PGroonga keeps index data in files Postgres cannot see. `pg_relation_size` returns 0 for
  both PGroonga indexes, so the gap between `pg_database_size` and the sum of
  `pg_total_relation_size` is PGroonga, not free space inside tables.
- PGroonga index size does not scale with row count, so a partial index saves nothing.
  `lex.entries.traditional` has a value in 2,358 rows of 36,361, so a partial index on
  `where traditional is not null` looks ten times smaller. Built and measured with
  `pgroonga_command('object_inspect', array['name', 'Sources<relfilenode>'])`: the partial
  index reported `n_records` 2,358 instead of 36,361 but identical `disk_usage`, all four
  objects totalling 39,227,392 bytes, and `pg_database_size` rose by exactly 38 MB and
  returned to 383 MB after dropping it. Each PGroonga index costs a fixed 37 to 42 MB
  regardless of data. The only way down is to drop the index.
- `idx_scan` cannot be used to judge a PGroonga index. Both report `idx_scan` = 0 in
  `pg_stat_user_indexes` while `idx_tup_read` rises, and
  `explain (analyze) select * from lex.search('習', array['zh'], 8)` shows
  `Index Scan using idx_lex_entries_headword_pgroonga`. These two indexes were nearly dropped
  once on the strength of that counter. Read the execution plan, not the counter.

## Migrations

- Every `update` in a migration must be idempotent against the TARGET state, not the source
  state. Migration `0017` filtered on the old `srs_*` columns, which froze after the move to
  FSRS, so replaying it would have overwritten real review progress.
- A migration applied directly as SQL must write its own row into
  `supabase_migrations.schema_migrations`.
- Migration numbers must be unique; CI fails the build on a duplicate.
- A `drop table`, `drop column`, `drop schema`, `truncate` or `delete from` needs a
  `-- reviewed-destructive: <who approved it, and why>` line in the same file, or CI fails.

## Operational limits

- The `anon` role is capped at `statement_timeout = 3s` and `authenticated` at 8 s. A cold
  query over 3 s returns `SQLSTATE 57014` rather than merely running slowly, and it takes the
  build with it because `/theory/[lang]/vocabulary` is prerendered: it has failed with
  `canceling statement due to statement timeout` and passed on a rerun. The Free plan runs
  compute Nano with `shared_buffers` at 224 MB against 455 MB of data measured 2026-09-23, so
  the long tail is disk reads rather than query shape. The EC2 target sets `shared_buffers`
  to 1 GB and `effective_cache_size` to 2560 MB (`infra/supabase/docker-compose.yml:315`),
  which is the gain the cutover buys.
- `supabase_admin` has no statement timeout, and the instance's 3.8 GB of RAM is shared with
  the model routers. On 2026-10-04 an ad hoc query that split every Vietnamese gloss inside a
  correlated subquery reached 2.3 GB, the kernel killed it, and Postgres restarted every
  connection, twice in four minutes. Open an ad hoc session with
  `set statement_timeout = '60s'` and `set default_transaction_read_only = on`, and measure
  one search call per statement.
- A crash restart empties the cumulative statistics: `n_live_tup` reads 0 and
  `n_mod_since_analyze` starts again from 0, so the changes made before the crash never
  trigger an autoanalyze. Run `analyze` on `lex` and `public` after one.
- `VACUUM` without `FULL` does not return disk space; it marks space for reuse.
- `vercel.json` pins functions to `icn1` because the database is in `ap-northeast-2`.
  Vercel's default is `iad1` in Washington, which routes every cache miss through the United
  States to Seoul. Moving the database means changing `regions` with it.
  https://vercel.com/docs/regions
