# ZHESEN

A dictionary and vocabulary notebook for Vietnamese speakers learning Chinese, Spanish and
English. The name is the three language codes: **zh**, **es**, **en**.

Look a word up in any of the three languages, or type Vietnamese to search in reverse. Save
words to a notebook, tag them, export to Anki, and review them on an FSRS-6 schedule.

The interface is in Vietnamese; the source, comments and documentation are in English.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in the Supabase URL and anon key
npm run dev                  # http://localhost:3000
```

Node must satisfy the `engines` range in `package.json`. Every environment variable is
documented in `.env.example`; only the two Supabase values are required.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` then `npm run start` | Production build, served locally |
| `npm run verify` | Lint, typecheck and the full test suite |

## Layout

```
app/          routes and layouts
components/   UI, grouped by feature
infra/        Terraform and the self-hosted Supabase stack
lib/          logic with no UI dependency
supabase/     migrations
test/         Vitest suites
```

## Deployment

Deployed to Vercel from `master` by `.github/workflows/ci.yml` after lint, types, tests,
production build and migration checks all pass. Functions are pinned to the `icn1` region to
sit beside the database in `ap-northeast-2`.

The database is a self-hosted Supabase on EC2 behind CloudFront, built and described by
[`infra/`](infra/README.md).

## Further reading

This repository holds code. Documents live in the wiki and work lives in issues.

- [`AGENTS.md`](AGENTS.md) — conventions and traps for anyone, human or agent, changing this
  code.
- [Wiki](https://github.com/ntphiep/zhesen-main/wiki) — current status and the decision
  records still in force.
- [ZHESEN board](https://github.com/users/ntphiep/projects/2) — open defects and outstanding
  work, prioritised.
- [`zhesen-pipeline`](https://github.com/ntphiep/zhesen-pipeline) — the ETL repository that
  loads the dictionary data.
