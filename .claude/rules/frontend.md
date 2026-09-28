---
paths:
  - "app/**"
  - "components/**"
  - "lib/hooks/**"
  - "lib/supabase/**"
  - "lib/dictionary/**"
  - "proxy.ts"
  - "next.config.ts"
---

# Next.js, React and Tailwind traps

Every item here cost time on this project once. Re-check before contradicting one.

## Rendering

- Components are Server Components by default. `window`, `localStorage` and `document` are
  only reachable after `'use client'`, and never at module top level, or SSR throws
  `ReferenceError: window is not defined`.
- `params` and `searchParams` in a dynamic route are Promises. Await them.
- `react-hooks/purity` in React 19 forbids `Date.now()` in a component body. The chosen
  pattern is a data-layer function taking `now: number = Date.now()` and a caller that omits
  the argument. Do not silence the rule with `eslint-disable`.
- `showModal()` races React Strict Mode, whose effects run twice. Guard with
  `if (open && !el.open)`.

## Tailwind 4

- Configured in `app/globals.css`. There is no `tailwind.config.js`.
- Preflight sets `margin: 0` on every element including `<dialog>`, which removes the UA
  stylesheet's `margin: auto` that centres a modal. `components/ui/Modal.tsx` must keep its
  `m-auto` class. jsdom applies no UA stylesheet, so a test can only assert the class itself.

## Supabase clients

- Through `@supabase/ssr`: server components use `await createClient()` from
  `lib/supabase/server`; client components use `useMemo(() => createClient(), [])` from
  `lib/supabase/client`. Do not create a client per render.
- In the browser use `auth.getSession()`; on the server use `auth.getUser()`. `getUser` is a
  round trip to the auth server on every call, and `useAccount` only decides which link to
  draw. Authorisation stays with `requirePermanentAccount` on the server and with RLS.
- The auth cookie name is pinned in `lib/supabase/env.ts`. `@supabase/ssr` otherwise derives
  it from the host, and renaming it drops every session, including the anonymous accounts
  that hold most of the saved words.

## Caching

- The search route and `lib/dictionary/cached.ts` use `unstable_cache` with the tag `['lex']`.
  Nothing calls `POST /api/revalidate` automatically, so the `revalidate` window is the only
  freshness guarantee, and it is a week: `LEX_REVALIDATE` is 604800 and every read in
  `cached.ts` carries it except `getCachedWordOfDay`, which keeps 3600 because the day index
  changes. `/dictionary/search` keeps 3600 of its own. Newly loaded data can therefore take a
  week to appear. Call `/api/revalidate` with `REVALIDATE_SECRET` by hand after a load; the
  secret goes in the `x-revalidate-secret` header, not the body. Do not set
  `revalidate: false` while no caller exists.
- `unstable_cache` keys on the source text of the function it wraps plus `keyParts`
  (`node_modules/next/dist/server/web/spec-extension/unstable-cache.js:58`), not on the
  parser that function calls. A change to what a cached parser returns needs a new key part,
  or the old shape is served until the tag is flushed or `LEX_REVALIDATE` runs out.
- The data cache in `.next/cache/fetch-cache` survives `next build`, so a local build made
  right after a data load still serves the old rows. Clear that folder before checking new
  data on a local build.
- `s-maxage` says nothing to a browser. Set alone, the browser invents its own freshness and
  holds a stale copy that `revalidateTag` cannot reach. A cached API route sets
  `Cache-Control` for the browser and `CDN-Cache-Control` for the CDN separately.
- `Link` prefetches as soon as it enters the viewport. The header is on every page, so a link
  to a dynamic route that reads the session needs `prefetch={false}`.
