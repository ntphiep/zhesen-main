<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# zhesen

Vietnamese-first dictionary and vocabulary trainer for Chinese, Spanish and English.
Product overview and setup are in `README.md`.

This file holds only what cannot be derived by reading the code: commands, conventions
that differ from tool defaults, and traps that have already cost time here. SQL and
testing rules live in `.claude/rules/` and load when a matching file is opened.

This repository holds code. Documents live in the
[wiki](https://github.com/ntphiep/zhesen-main/wiki) and work lives in
[issues](https://github.com/ntphiep/zhesen-main/issues), tracked on the
[ZHESEN board](https://github.com/users/ntphiep/projects/2). Do not add a status file, a
plan file or a backlog file to the tree.

Six subagents in `.claude/agents/` cover planning, implementation, tests, review, runtime
QA and the backlog. Delegate a step to the one that owns it rather than doing every step
in one context.

One identity owns this repository: `Harry Nguyen <ng.hiep0822@gmail.com>`, GitHub `ntphiep`.
Never commit, push or open an issue under another account.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run verify` | lint, then `tsc --noEmit`, then the full test suite. This is the definition of "checked". |
| `npm run dev` | Development server on port 3000. |
| `npm run build` then `npm run start` | Required before clicking through any UI change. |
| `npx vitest related --run <file>` | Only the tests that import that file. |

## Definition of done

1. `npm run verify` exits 0. A green test run does not prove the types are clean, so do
   not skip the middle step.
2. UI change: rebuild, serve, click through it, and paste the runtime evidence.
   `next start` serves the last build, so an unrebuilt change is untested. Use the
   `verify-ui` skill.
3. Data change: run the real `COUNT` or query and paste the number.
4. `git status` is clean. No scratch files, `*.log`, `*.png` or temporary JSONL at the root.

A failing test is a finding, not an obstacle. Report it with its output. Never edit,
loosen or delete a test to make it pass.

`.claude/hooks/verify-gate.ps1` enforces step 1 at the end of every turn that touches
`.ts` or `.tsx`. A missing tool makes it block, not skip.

## Code style

- Minimal diff, inside the requested scope. Read the surrounding file first and copy its
  shape rather than introducing a second way of doing the same thing.
- No `any` and no silent casts. Data from Supabase or any API passes through a Zod
  `.parse()`. Implicit casts are the most common source of runtime errors here.
- Comments state a constraint or a measured fact in one or two lines. No narration, no
  history, no rationale essays. If the comment is longer than the code, delete it.
- Source, comments, commit messages and documentation are English. UI labels are
  Vietnamese, because the product is written for Vietnamese learners.
- `app/` holds routes, layouts and `globals.css` only. Components live in
  `components/<group>/`; React hooks live in `lib/hooks/`.
- camelCase for modules, PascalCase for components, tests in `test/` named `*.test.ts(x)`.
- Route paths are English and singular (`/wordlist`, `/learn`). Never a Vietnamese route.
- The database is snake_case and TypeScript is camelCase. Convert explicitly in the parser
  layer (`lib/dictionary/`, `lib/wordlist/store.ts`) and nowhere else.

## Framework traps

- Components are Server Components by default. `window`, `localStorage` and `document` are
  only reachable after `'use client'`, and never at module top level, or SSR throws
  `ReferenceError: window is not defined`.
- `params` and `searchParams` in a dynamic route are Promises. Await them.
- Supabase through `@supabase/ssr`: server components use `await createClient()` from
  `lib/supabase/server`; client components use `useMemo(() => createClient(), [])` from
  `lib/supabase/client`. Do not create a client per render.
- Tailwind 4 is configured in `app/globals.css`. There is no `tailwind.config.js`.
- Tailwind 4 preflight sets `margin: 0` on every element including `<dialog>`, which removes
  the UA stylesheet's `margin: auto` that centres a modal. `components/ui/Modal.tsx` must
  keep its `m-auto` class. jsdom applies no UA stylesheet, so a test can only assert the
  class itself.
- A dynamic route segment does not enter the route cache without `generateStaticParams`.
  Returning an empty array is enough; `dynamicParams` defaults to `true`. Measured on
  production: without it every visit to `/dictionary/en/hello` was a cache MISS at 258 to
  314 ms, and 4,513 ms on a cold function; with it plus `revalidate` the page is a HIT at
  128 to 144 ms. Declare both on any new route that reads cached data without touching the
  request.
- `proxy.ts` must only match routes that actually read the session. A broad matcher catches
  files in `public/` (measured: `/robots.txt` cost 178 ms when matched against 115 ms when
  excluded) and can attach `Set-Cookie` to an otherwise cacheable response, which Vercel
  then refuses to cache.
- `Link` prefetches as soon as it enters the viewport. The header is on every page, so a
  link to a dynamic route that reads the session needs `prefetch={false}`.
- In the browser use `auth.getSession()`; on the server use `auth.getUser()`. `getUser` is a
  round trip to the auth server on every call, and `useAccount` only decides which link to
  draw. Authorisation stays with `requirePermanentAccount` on the server and with RLS.
- The search route and `lib/dictionary/cached.ts` use `unstable_cache` with the tag
  `['lex']`. Nothing calls `POST /api/revalidate` automatically, so the `revalidate: 3600`
  window is the only freshness guarantee: newly loaded data can take an hour to appear. Call
  `/api/revalidate` with `REVALIDATE_SECRET` by hand to see it sooner, and do not set
  `revalidate: false` while no caller exists.
- `react-hooks/purity` in React 19 forbids `Date.now()` in a component body. The chosen
  pattern is a data-layer function taking `now: number = Date.now()` and a caller that omits
  the argument. Do not silence the rule with `eslint-disable`.
- `showModal()` races React Strict Mode, whose effects run twice. Guard with
  `if (open && !el.open)`.

## Product invariants

- Every practice mode must write to the FSRS schedule: call `gradeForMode`
  (`lib/practice/grading.ts`) then `gradeWordById` (`lib/wordlist/review.ts`). Speaking
  practice deliberately never reports a failure, because speech recognition misfires on
  noise and microphones and recording `again` would erase real progress over a hardware
  fault.
- An anonymous account lives in one browser's cookie. Clearing browsing data loses it: 407
  saved words once ended up in an account with no way back. `lib/auth/account.ts` is the way
  out. `attachEmail` attaches an email to the account already in hand, keeping the user id
  and every row under it. `signInByEmail` is only for a browser holding no words, and
  refuses when the current session has data, because signing in swaps accounts and would
  abandon exactly what needed rescuing.
- Middleware does not create anonymous sessions. Lookup needs no account, so an account is
  created at the first write through `ensureSession` (`lib/supabase/session.ts`). The earlier
  behaviour created an `auth.users` row per cookieless request: 122 accounts of which 1 held
  data, and hitting Supabase's sign-in ceiling cost real users their sessions. Any new write
  path must call `ensureSession`.
- The lookup has one box per direction and detects nothing. Vietnamese cannot be told from
  English or Spanish by its text: "an", "ban" and "con" are real headwords in both and
  score 4.01 to 4.12 in `lex.search`, above any threshold, so a single box answered "cá"
  with ca, can and called. `LookupPanel` (`components/search/LookupPanel.tsx`) takes a
  `direction`, the route reads `dir=vi`, and `searchOneDirection` runs exactly one RPC. Do
  not reintroduce a detector; `looksVietnamese` and `looksHan` were deleted for this.
- `lex.gloss_terms` is derived from `lex.senses`, never written by hand. Three
  statement-level triggers rebuild an entry's rows through `lex.gloss_terms_reload`
  whenever its senses change. A gloss over 80 characters is a definition, not a list of
  terms, and contributes none: splitting one made taco answer "cơm" as strongly as 饭.
- `azureTranslatorConfig()` returning null is a valid state, like `aiConfig()`.
  `POST /dictionary/translate` then answers `{"enabled": false}` and the passage block
  disappears instead of failing. One Azure request carries every target language; never
  loop over them. Azure spells Chinese `zh-Hans` and this project spells it `zh`.
- Wiktionary audio does not always pronounce its own headword: `En-uk-a_cat.ogg` says "a cat"
  and sits on the entry for "cat". Every read of `audio_url` goes through
  `audioMatchesHeadword` (`lib/dictionary/pronunciation.ts`). Measured over 699 records, 631
  match.
- Never speak with a voice for the wrong language. `speechSynthesis` accepts an utterance
  even with no matching voice installed and plays silence. Chinese has no recordings at all
  (0 of 4,042), so `AudioButton` checks the voice list first and falls back to a muted icon
  with a reason.
- `s-maxage` says nothing to a browser. Set alone, the browser invents its own freshness and
  holds a stale copy that `revalidateTag` cannot reach. A cached API route sets
  `Cache-Control` for the browser and `CDN-Cache-Control` for the CDN separately.
- Check a licence before loading data, and read all of it. AllSet Learning's Chinese Grammar
  Wiki is CC BY-NC-SA 3.0 and its copyright page bars sites carrying advertising. CEFR-J is
  the same shape: the main A1-B2 list is not CC-BY-SA, only the Octanove C1/C2 part is.

## AI assistant

- The model key is server-side only. Every call goes through `POST /api/ai` (`lib/ai/`).
  Never expose it through a `NEXT_PUBLIC_` variable.
- `aiConfig()` returning null is a valid state, not an error. The router the project points
  at sits on a private network, so a deployment that cannot reach it returns
  `{"enabled": false}` and the assistant buttons disappear instead of breaking.
- The same `/v1/messages` endpoint returns two response shapes: an OpenAI-style
  `chat.completion` body with `stream: false`, and Anthropic-style events when streaming.
  `lib/ai/client.ts` reads both. Do not reduce it to one.
- A new task is declared in `lib/ai/tasks.ts` (input schema, output schema, prompt) plus one
  line in `ERASED_TASKS`. The route needs no change.

## Removed, do not rebuild

Verified to have no remaining callers before deletion on 2026-09-21: `components/search/SearchBox.tsx`
and `components/search/TextLookup.tsx` (both replaced by `LookupPanel`), the
`/dictionary/text` page (the passage lookup lives inside each lookup box now, and the
`POST /dictionary/text/lookup` route under it stays), `looksVietnamese` and `looksHan` in
`lib/dictionary/detect.ts`, `bestScore` in `lib/dictionary/response.ts`, and the assistant's
`translate` task in `lib/ai/tasks.ts`, which Azure AI Translator replaces.

Verified to have no remaining callers before deletion on 2026-09-12: `lib/content/` (the
ContentSource abstraction, replaced by constants in `lib/languages.ts`), `lib/quiz/`
(duplicated `lib/practice/quiz.ts`), `lib/progress/ProgressStore.ts` and
`SupabaseProgressStore.ts` (the previous SRS storage layer), `components/Flashcard.tsx`,
`components/Quiz.tsx`, `lib/sanity.ts`. The `/reader` page is out of scope, but
`components/reader/` is still used by lookup and grammar; do not delete it by association.

## Commits

Conventional Commits. The subject is `type(scope): imperative summary`, at most 72
characters, no trailing period. The body states what changed and why in at most three short
paragraphs, and carries the measurement when the claim is a number. No storytelling, no
process narration. Types in use: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`,
`ci`, `chore`.
