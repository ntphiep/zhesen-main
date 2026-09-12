# Zhesen Phase 2 (Supabase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. For ANY Supabase-specific code (@supabase/ssr clients, middleware, auth, RLS), the implementer MUST invoke the `supabase:supabase` skill and verify current API against it / `search_docs` rather than trusting memory.

**Goal:** Move Zhesen's content and progress from local (JSON + localStorage) to the hosted Supabase project `cvltsyoweddhpkomuevz`, with cookie-based anonymous auth and RLS, behind the unchanged `ContentSource`/`ProgressStore` interfaces.

**Architecture:** PostgreSQL schema with RLS (content readable by `authenticated`, progress scoped to `auth.uid()`). `@supabase/ssr` provides a browser client, a server client, and a Next.js middleware that bootstraps an anonymous session into cookies so server components can read content. New `SupabaseContentSource` (server-capable) and `SupabaseProgressStore` (client) implement the existing interfaces; the local implementations are removed. The pure SRS function is reused inside the progress store.

**Tech Stack:** Next.js 16 (App Router), `@supabase/supabase-js`, `@supabase/ssr`, Supabase (Postgres 17, project `cvltsyoweddhpkomuevz`, region ap-northeast-2), zod, Vitest.

## Global Constraints

- Supabase project id: `cvltsyoweddhpkomuevz`. Apply schema/seed via the Supabase MCP `apply_migration`, AND save the SQL under `supabase/migrations/` in the repo for version control.
- Content is readable only by role `authenticated` (Supabase anonymous users HAVE this role — verified in docs). Progress rows are scoped to `auth.uid()`. Enable RLS on all six tables.
- Anonymous sign-ins must be enabled in the project dashboard (`Authentication → Providers → Anonymous`); the MCP cannot toggle it. This is a manual setup step (Task 7).
- `getProgressStore()` (browser session) is used ONLY in client components; `getContentSource()` may be used in server components (it reads via the cookie-bound server client).
- Never commit secrets. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` live in `.env.local` (gitignored); the controller supplies their exact values in the Task 3 dispatch.
- TypeScript strict, no `any`. Vietnamese for all user-visible copy. Conventional commits. TDD for pure logic; Supabase impls tested with a mocked client.
- Reuse the existing pure modules unchanged: `lib/progress/srs.ts`, `lib/quiz/buildQuiz.ts`, `lib/content/types.ts`, `lib/content/schema.ts`, the `ContentSource`/`ProgressStore` interfaces, `lib/progress/types.ts`.

## Dependency / Parallelism Map

- **Task 1 (schema)** → **Task 2 (seed)** : strictly sequential (both mutate the shared remote DB).
- **Task 3 (Supabase clients + middleware + env)** : code-only, touches `lib/supabase/*`, `middleware.ts`, `.env.local`, `package.json` — DISJOINT from Tasks 1–2. May run in parallel with the Task 1→2 chain.
- **Task 4 (SupabaseContentSource)** and **Task 5 (SupabaseProgressStore)** : both depend on Task 3, touch DISJOINT files — may run in parallel with each other (use worktree isolation if dispatched concurrently to avoid a shared-index commit race).
- **Task 6 (swap singletons + remove local + zod boundary)** : depends on Tasks 4 & 5; sequential.
- **Task 7 (enable anon sign-ins + browser verification)** : depends on everything; controller-run, with one manual dashboard step by the user.

---

## File Structure

```
zhesen/
  middleware.ts                         # NEW: refresh session + anonymous bootstrap
  lib/supabase/
    client.ts                           # NEW: createBrowserClient
    server.ts                           # NEW: createServerClient (cookies)
  lib/content/
    SupabaseContentSource.ts            # NEW
    rows.ts                             # NEW: zod schemas for DB rows -> domain types
    index.ts                            # MODIFY: return SupabaseContentSource
    LocalContentSource.ts               # DELETE
  lib/progress/
    SupabaseProgressStore.ts            # NEW
    rows.ts                             # NEW: zod schemas for srs_state/lesson_progress rows
    index.ts                            # MODIFY: return SupabaseProgressStore
    LocalProgressStore.ts               # DELETE
    kv.ts                               # DELETE
  supabase/migrations/
    0001_schema.sql                     # NEW (also applied via MCP)
    0002_seed.sql                       # NEW (also applied via MCP)
  test/
    content/LocalContentSource.test.ts  # DELETE
    progress/LocalProgressStore.test.ts # DELETE
    progress/SupabaseProgressStore.test.ts  # NEW (mocked client)
    content/rows.test.ts                # NEW (zod row schemas)
  .env.local                            # NEW (gitignored)
```

---

### Task 1: Database schema + RLS

**Files:**
- Create: `supabase/migrations/0001_schema.sql`
- Apply via MCP: `apply_migration(project_id="cvltsyoweddhpkomuevz", name="0001_schema", query=<the SQL>)`

**Interfaces:**
- Consumes: nothing
- Produces: six tables (`languages`, `vocab_items`, `lessons`, `lesson_vocab`, `srs_state`, `lesson_progress`) with RLS enabled and policies.

- [ ] **Step 1: Write the migration SQL to `supabase/migrations/0001_schema.sql`**

```sql
-- Content tables
create table public.languages (
  code text primary key check (code in ('zh','es','en')),
  name text not null,
  native_name text not null,
  script text not null check (script in ('han','latin'))
);
create table public.vocab_items (
  id text primary key,
  lang text not null references public.languages(code),
  term text not null,
  reading text,
  translation jsonb not null,
  part_of_speech text,
  level text,
  examples jsonb,
  audio text
);
create table public.lessons (
  id text primary key,
  lang text not null references public.languages(code),
  title text not null,
  description text not null default '',
  position int not null check (position > 0)
);
create table public.lesson_vocab (
  lesson_id text not null references public.lessons(id),
  vocab_id text not null references public.vocab_items(id),
  position int not null,
  primary key (lesson_id, vocab_id)
);
-- Progress tables
create table public.srs_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  vocab_id text not null references public.vocab_items(id),
  lang text not null,
  interval_days int not null default 0,
  ease real not null default 2.5,
  reps int not null default 0,
  lapses int not null default 0,
  due_at timestamptz not null,
  last_reviewed_at timestamptz,
  primary key (user_id, vocab_id)
);
create table public.lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null references public.lessons(id),
  status text not null check (status in ('not_started','in_progress','completed')),
  completed_at timestamptz,
  primary key (user_id, lesson_id)
);

-- RLS
alter table public.languages enable row level security;
alter table public.vocab_items enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_vocab enable row level security;
alter table public.srs_state enable row level security;
alter table public.lesson_progress enable row level security;

-- Content: readable by any authenticated user (incl. anonymous)
create policy "content_read_languages"   on public.languages    for select to authenticated using (true);
create policy "content_read_vocab"        on public.vocab_items  for select to authenticated using (true);
create policy "content_read_lessons"      on public.lessons      for select to authenticated using (true);
create policy "content_read_lesson_vocab" on public.lesson_vocab for select to authenticated using (true);

-- Progress: each user sees/writes only their own rows
create policy "srs_select" on public.srs_state for select to authenticated using (auth.uid() = user_id);
create policy "srs_insert" on public.srs_state for insert to authenticated with check (auth.uid() = user_id);
create policy "srs_update" on public.srs_state for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lp_select" on public.lesson_progress for select to authenticated using (auth.uid() = user_id);
create policy "lp_insert" on public.lesson_progress for insert to authenticated with check (auth.uid() = user_id);
create policy "lp_update" on public.lesson_progress for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Apply the migration via MCP**

Call `apply_migration` with `project_id="cvltsyoweddhpkomuevz"`, `name="0001_schema"`, `query=<the SQL above>`.

- [ ] **Step 3: Verify schema + RLS**

- `list_tables(project_id, schemas=["public"])` → expect the 6 tables.
- `get_advisors(project_id, type="security")` → expect NO "RLS disabled in public" warnings for these tables.
Record the advisor output in the report.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_schema.sql
git commit -m "feat(db): add Supabase schema and RLS for content and progress"
```

---

### Task 2: Seed content into Supabase

**Files:**
- Create: `supabase/migrations/0002_seed.sql`
- Apply via MCP: `apply_migration(project_id="cvltsyoweddhpkomuevz", name="0002_seed", query=<seed SQL>)`

**Interfaces:**
- Consumes: Task 1 tables. Source data: `content/languages.json`, `content/zh.json`, `content/es.json`, `content/en.json`.
- Produces: 3 languages, 15 vocab_items, 3 lessons, 15 lesson_vocab rows.

- [ ] **Step 1: Write `supabase/migrations/0002_seed.sql`** (idempotent; values copied EXACTLY from the JSON, including pinyin and Vietnamese lesson copy)

```sql
insert into public.languages (code, name, native_name, script) values
  ('zh','Tiếng Trung','中文','han'),
  ('es','Tiếng Tây Ban Nha','Español','latin'),
  ('en','Tiếng Anh','English','latin')
on conflict (code) do nothing;

insert into public.vocab_items (id, lang, term, reading, translation, level) values
  ('zh-1','zh','你好','nǐ hǎo','{"vi":"xin chào"}','HSK1'),
  ('zh-2','zh','谢谢','xiè xie','{"vi":"cảm ơn"}','HSK1'),
  ('zh-3','zh','再见','zài jiàn','{"vi":"tạm biệt"}','HSK1'),
  ('zh-4','zh','对不起','duì bu qǐ','{"vi":"xin lỗi"}','HSK1'),
  ('zh-5','zh','请','qǐng','{"vi":"làm ơn / mời"}','HSK1'),
  ('es-1','es','hola',null,'{"vi":"xin chào"}','A1'),
  ('es-2','es','gracias',null,'{"vi":"cảm ơn"}','A1'),
  ('es-3','es','adiós',null,'{"vi":"tạm biệt"}','A1'),
  ('es-4','es','perdón',null,'{"vi":"xin lỗi"}','A1'),
  ('es-5','es','por favor',null,'{"vi":"làm ơn"}','A1'),
  ('en-1','en','hello',null,'{"vi":"xin chào"}','A1'),
  ('en-2','en','thank you',null,'{"vi":"cảm ơn"}','A1'),
  ('en-3','en','goodbye',null,'{"vi":"tạm biệt"}','A1'),
  ('en-4','en','sorry',null,'{"vi":"xin lỗi"}','A1'),
  ('en-5','en','please',null,'{"vi":"làm ơn"}','A1')
on conflict (id) do nothing;

insert into public.lessons (id, lang, title, description, position) values
  ('zh-l1','zh','Chào hỏi cơ bản','Những câu chào thông dụng.',1),
  ('es-l1','es','Chào hỏi cơ bản','Những câu chào thông dụng.',1),
  ('en-l1','en','Chào hỏi cơ bản','Những câu chào thông dụng.',1)
on conflict (id) do nothing;

insert into public.lesson_vocab (lesson_id, vocab_id, position) values
  ('zh-l1','zh-1',1),('zh-l1','zh-2',2),('zh-l1','zh-3',3),('zh-l1','zh-4',4),('zh-l1','zh-5',5),
  ('es-l1','es-1',1),('es-l1','es-2',2),('es-l1','es-3',3),('es-l1','es-4',4),('es-l1','es-5',5),
  ('en-l1','en-1',1),('en-l1','en-2',2),('en-l1','en-3',3),('en-l1','en-4',4),('en-l1','en-5',5)
on conflict (lesson_id, vocab_id) do nothing;
```

- [ ] **Step 2: Apply via MCP** `apply_migration(project_id, name="0002_seed", query=<seed SQL>)`.

- [ ] **Step 3: Verify counts**

Run via `execute_sql`: `select (select count(*) from languages) langs, (select count(*) from vocab_items) vocab, (select count(*) from lessons) lessons, (select count(*) from lesson_vocab) lv;`
Expected: `langs=3, vocab=15, lessons=3, lv=15`. Record in report.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_seed.sql
git commit -m "feat(db): seed initial content into Supabase"
```

---

### Task 3: Supabase clients, middleware (anon bootstrap), env

**Files:**
- Modify: `package.json` (add deps)
- Create: `.env.local`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, `middleware.ts`

**Interfaces:**
- Consumes: env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Produces: `createClient()` (browser) from `lib/supabase/client.ts`; `createClient()` (async, server) from `lib/supabase/server.ts`; a `middleware.ts` that refreshes the session and signs in anonymously when there is no user.

> **REQUIRED:** invoke the `supabase:supabase` skill and follow its current `@supabase/ssr` Next.js App Router guidance for `client.ts`, `server.ts`, and the middleware `updateSession` pattern. The code below is the expected shape; reconcile it with the skill's current API before committing.

- [ ] **Step 1: Install dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Create `.env.local`** (controller supplies the exact values in the dispatch; do NOT commit this file — confirm it is gitignored)

```
NEXT_PUBLIC_SUPABASE_URL=<supplied>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supplied>
```

- [ ] **Step 3: `lib/supabase/client.ts`** (browser client)

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

- [ ] **Step 4: `lib/supabase/server.ts`** (server client, cookie-bound — use the skill's current `cookies()` pattern for Next 16)

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch { /* called from a Server Component; middleware refreshes the session */ }
        },
      },
    },
  )
}
```

- [ ] **Step 5: `middleware.ts`** (refresh session + anonymous bootstrap)

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    await supabase.auth.signInAnonymously() // sets session cookies via setAll
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 6: Verify build**

Run `npm run build` (it must succeed with the env vars present) and `npm test` (existing suite still green — no test changes here yet). Note: anon sign-in actually firing is verified in Task 7.

- [ ] **Step 7: Commit** (do NOT add `.env.local`)

```bash
git add package.json package-lock.json lib/supabase/ middleware.ts
git commit -m "feat(supabase): add SSR clients and anonymous-session middleware"
```

---

### Task 4: SupabaseContentSource  *(parallelizable with Task 5)*

**Files:**
- Create: `lib/content/rows.ts`, `lib/content/SupabaseContentSource.ts`
- Test: `test/content/rows.test.ts`

**Interfaces:**
- Consumes: `createClient` from `lib/supabase/server.ts` (Task 3); `Language`, `Lesson`, `VocabItem`, `LangCode`, `LanguageContent` from `lib/content/types.ts`; `ContentSource` from `lib/content/ContentSource.ts`.
- Produces: `class SupabaseContentSource implements ContentSource`; zod row schemas `languageRow`, `vocabRow`, `lessonRow` and parsers in `rows.ts`.

- [ ] **Step 1: Write failing test `test/content/rows.test.ts`** (the row→domain zod mapping is the testable pure part)

```ts
import { describe, it, expect } from 'vitest'
import { parseVocabRow, parseLanguageRow, parseLessonRow } from '@/lib/content/rows'

describe('content row schemas', () => {
  it('parses a vocab row (translation jsonb -> object)', () => {
    const v = parseVocabRow({ id: 'zh-1', lang: 'zh', term: '你好', reading: 'nǐ hǎo', translation: { vi: 'xin chào' }, part_of_speech: null, level: 'HSK1', examples: null, audio: null })
    expect(v).toMatchObject({ id: 'zh-1', lang: 'zh', term: '你好', reading: 'nǐ hǎo', translation: { vi: 'xin chào' }, level: 'HSK1' })
  })
  it('maps lesson row position and defaults', () => {
    expect(parseLessonRow({ id: 'zh-l1', lang: 'zh', title: 'Chào hỏi cơ bản', description: '', position: 1 }).position).toBe(1)
  })
  it('rejects a row missing translation.vi', () => {
    expect(() => parseVocabRow({ id: 'x', lang: 'zh', term: 'a', translation: {}, reading: null, part_of_speech: null, level: null, examples: null, audio: null })).toThrow()
  })
  it('rejects an unknown lang code', () => {
    expect(() => parseLanguageRow({ code: 'fr', name: 'x', native_name: 'y', script: 'latin' })).toThrow()
  })
})
```

- [ ] **Step 2: Run test, verify it fails** — `npx vitest run test/content/rows.test.ts` (module not found).

- [ ] **Step 3: Implement `lib/content/rows.ts`**

```ts
import { z } from 'zod'
import type { Language, Lesson, VocabItem } from './types'

const langCode = z.enum(['zh', 'es', 'en'])
const translation = z.object({ vi: z.string().min(1) })

const languageRow = z.object({ code: langCode, name: z.string().min(1), native_name: z.string().min(1), script: z.enum(['han', 'latin']) })
const vocabRow = z.object({
  id: z.string().min(1), lang: langCode, term: z.string().min(1),
  reading: z.string().nullable(), translation, part_of_speech: z.string().nullable(),
  level: z.string().nullable(), examples: z.array(z.any()).nullable(), audio: z.string().nullable(),
})
const lessonRow = z.object({ id: z.string().min(1), lang: langCode, title: z.string().min(1), description: z.string(), position: z.number().int().positive() })

export function parseLanguageRow(r: unknown): Language {
  const x = languageRow.parse(r)
  return { code: x.code, name: x.name, nativeName: x.native_name, script: x.script }
}
export function parseVocabRow(r: unknown): VocabItem {
  const x = vocabRow.parse(r)
  return {
    id: x.id, lang: x.lang, term: x.term,
    reading: x.reading ?? undefined, translation: x.translation,
    partOfSpeech: x.part_of_speech ?? undefined, level: x.level ?? undefined,
    examples: (x.examples ?? undefined) as VocabItem['examples'], audio: x.audio ?? undefined,
  }
}
export function parseLessonRow(r: unknown): Omit<Lesson, 'vocabIds'> {
  const x = lessonRow.parse(r)
  return { id: x.id, lang: x.lang, title: x.title, description: x.description, position: x.position }
}
```

- [ ] **Step 4: Run test, verify it passes** — `npx vitest run test/content/rows.test.ts`.

- [ ] **Step 5: Implement `lib/content/SupabaseContentSource.ts`** (uses the server client; `getLesson`/`getLessons` join `lesson_vocab` to populate `vocabIds` in order)

```ts
import type { ContentSource } from './ContentSource'
import type { Language, Lesson, VocabItem, LangCode } from './types'
import { parseLanguageRow, parseVocabRow, parseLessonRow } from './rows'
import { createClient } from '@/lib/supabase/server'

async function lessonVocabIds(supabase: Awaited<ReturnType<typeof createClient>>, lessonIds: string[]) {
  const { data, error } = await supabase.from('lesson_vocab').select('lesson_id, vocab_id, position').in('lesson_id', lessonIds).order('position')
  if (error) throw error
  const map = new Map<string, string[]>()
  for (const r of data ?? []) {
    const arr = map.get(r.lesson_id) ?? []
    arr.push(r.vocab_id)
    map.set(r.lesson_id, arr)
  }
  return map
}

export class SupabaseContentSource implements ContentSource {
  async getLanguages(): Promise<Language[]> {
    const supabase = await createClient()
    const { data, error } = await supabase.from('languages').select('*')
    if (error) throw error
    return (data ?? []).map(parseLanguageRow)
  }
  async getLessons(lang: LangCode): Promise<Lesson[]> {
    const supabase = await createClient()
    const { data, error } = await supabase.from('lessons').select('*').eq('lang', lang).order('position')
    if (error) throw error
    const base = (data ?? []).map(parseLessonRow)
    const ids = await lessonVocabIds(supabase, base.map((l) => l.id))
    return base.map((l) => ({ ...l, vocabIds: ids.get(l.id) ?? [] }))
  }
  async getLesson(lessonId: string): Promise<Lesson | null> {
    const supabase = await createClient()
    const { data, error } = await supabase.from('lessons').select('*').eq('id', lessonId).maybeSingle()
    if (error) throw error
    if (!data) return null
    const base = parseLessonRow(data)
    const ids = await lessonVocabIds(supabase, [base.id])
    return { ...base, vocabIds: ids.get(base.id) ?? [] }
  }
  async getVocab(ids: string[]): Promise<VocabItem[]> {
    if (ids.length === 0) return []
    const supabase = await createClient()
    const { data, error } = await supabase.from('vocab_items').select('*').in('id', ids)
    if (error) throw error
    const byId = new Map((data ?? []).map((r) => [r.id, parseVocabRow(r)]))
    return ids.map((id) => byId.get(id)).filter((v): v is VocabItem => Boolean(v))
  }
  async getVocabByLang(lang: LangCode): Promise<VocabItem[]> {
    const supabase = await createClient()
    const { data, error } = await supabase.from('vocab_items').select('*').eq('lang', lang)
    if (error) throw error
    return (data ?? []).map(parseVocabRow)
  }
}
```

- [ ] **Step 6: Run full suite** — `npm test` (rows test passes; nothing else broken). Commit.

```bash
git add lib/content/rows.ts lib/content/SupabaseContentSource.ts test/content/rows.test.ts
git commit -m "feat(content): add SupabaseContentSource with zod row validation"
```

---

### Task 5: SupabaseProgressStore  *(parallelizable with Task 4)*

**Files:**
- Create: `lib/progress/rows.ts`, `lib/progress/SupabaseProgressStore.ts`
- Test: `test/progress/SupabaseProgressStore.test.ts`

**Interfaces:**
- Consumes: `createClient` from `lib/supabase/client.ts` (Task 3); `ProgressStore` from `lib/progress/ProgressStore.ts`; `CardRecord`, `Grade`, `LessonProgress`, `LessonStatus` from `lib/progress/types.ts`; `initialSrsState`, `review` from `lib/progress/srs.ts`; `LangCode`.
- Produces: `class SupabaseProgressStore implements ProgressStore`; the constructor takes a Supabase client (so tests can inject a mock): `new SupabaseProgressStore(client)`. The `index.ts` singleton constructs it with the real browser client.

- [ ] **Step 1: Write failing test `test/progress/SupabaseProgressStore.test.ts`** (mock the Supabase client; assert the read-modify-write reuses `review()` and that `recordReview` of a `good` card pushes `due_at` one day out)

```ts
import { describe, it, expect, vi } from 'vitest'
import { SupabaseProgressStore } from '@/lib/progress/SupabaseProgressStore'
import { initialSrsState, DAY_MS } from '@/lib/progress/srs'

const T0 = 1_000_000_000_000

// Minimal fake: holds one srs_state row, supports the calls the store makes.
function fakeClient(initialRow: any) {
  let row = initialRow
  return {
    _row: () => row,
    from() {
      return {
        select() { return this },
        eq() { return this },
        maybeSingle: async () => ({ data: row, error: null }),
        upsert: async (vals: any) => { row = Array.isArray(vals) ? vals[0] : vals; return { error: null } },
      }
    },
  } as any
}

describe('SupabaseProgressStore.recordReview', () => {
  it('reads the card, applies review(), and upserts the new state', async () => {
    const existing = { user_id: 'u1', vocab_id: 'zh-1', lang: 'zh', interval_days: 0, ease: 2.5, reps: 0, lapses: 0, due_at: new Date(T0).toISOString(), last_reviewed_at: null }
    const client = fakeClient(existing)
    const store = new SupabaseProgressStore(client)
    const card = await store.recordReview('zh-1', 'good', T0)
    expect(card.reps).toBe(1)
    expect(card.intervalDays).toBe(1)
    expect(card.dueAt).toBe(T0 + DAY_MS)
    expect(client._row().interval_days).toBe(1) // persisted
  })
})
```

- [ ] **Step 2: Run test, verify it fails** — `npx vitest run test/progress/SupabaseProgressStore.test.ts`.

- [ ] **Step 3: Implement `lib/progress/rows.ts`** (row ⇄ domain, timestamp ⇄ epoch ms)

```ts
import { z } from 'zod'
import type { CardRecord, LessonProgress, LessonStatus } from './types'
import type { LangCode } from '@/lib/content/types'

const ms = (iso: string | null) => (iso ? Date.parse(iso) : null)
const iso = (n: number) => new Date(n).toISOString()

const srsRow = z.object({
  user_id: z.string(), vocab_id: z.string(), lang: z.enum(['zh', 'es', 'en']),
  interval_days: z.number().int(), ease: z.number(), reps: z.number().int(), lapses: z.number().int(),
  due_at: z.string(), last_reviewed_at: z.string().nullable(),
})

export function cardFromRow(r: unknown): CardRecord {
  const x = srsRow.parse(r)
  return {
    vocabId: x.vocab_id, lang: x.lang as LangCode,
    intervalDays: x.interval_days, ease: x.ease, reps: x.reps, lapses: x.lapses,
    dueAt: Date.parse(x.due_at), lastReviewedAt: ms(x.last_reviewed_at),
  }
}
export function cardToRow(userId: string, c: CardRecord) {
  return {
    user_id: userId, vocab_id: c.vocabId, lang: c.lang,
    interval_days: c.intervalDays, ease: c.ease, reps: c.reps, lapses: c.lapses,
    due_at: iso(c.dueAt), last_reviewed_at: c.lastReviewedAt ? iso(c.lastReviewedAt) : null,
  }
}
const lpRow = z.object({ lesson_id: z.string(), status: z.enum(['not_started', 'in_progress', 'completed']), completed_at: z.string().nullable() })
export function lessonProgressFromRow(r: unknown): LessonProgress {
  const x = lpRow.parse(r)
  return { lessonId: x.lesson_id, status: x.status as LessonStatus, completedAt: ms(x.completed_at) }
}
```

- [ ] **Step 4: Implement `lib/progress/SupabaseProgressStore.ts`**

```ts
import type { ProgressStore } from './ProgressStore'
import type { CardRecord, Grade, LessonProgress, LessonStatus } from './types'
import type { LangCode } from '@/lib/content/types'
import { initialSrsState, review } from './srs'
import { cardFromRow, cardToRow, lessonProgressFromRow } from './rows'

// Accepts the @supabase/ssr browser client (typed loosely so tests can inject a fake).
type Client = { from: (t: string) => any; auth?: any }

export class SupabaseProgressStore implements ProgressStore {
  constructor(private supabase: Client, private userIdOverride?: string) {}

  private async userId(): Promise<string> {
    if (this.userIdOverride) return this.userIdOverride
    const { data } = await this.supabase.auth.getUser()
    const id = data?.user?.id
    if (!id) throw new Error('No authenticated user')
    return id
  }

  async ensureCards(items: { vocabId: string; lang: LangCode }[], now: number): Promise<void> {
    if (items.length === 0) return
    const userId = await this.userId()
    const rows = items.map((i) => cardToRow(userId, { ...initialSrsState(i.vocabId, now), lang: i.lang }))
    const { error } = await this.supabase.from('srs_state').upsert(rows, { onConflict: 'user_id,vocab_id', ignoreDuplicates: true })
    if (error) throw error
  }

  async getDueCards(lang: LangCode, now: number, limit?: number): Promise<CardRecord[]> {
    const userId = await this.userId()
    let q = this.supabase.from('srs_state').select('*').eq('user_id', userId).eq('lang', lang).lte('due_at', new Date(now).toISOString()).order('due_at')
    if (typeof limit === 'number') q = q.limit(limit)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(cardFromRow)
  }

  async countDue(lang: LangCode, now: number): Promise<number> {
    return (await this.getDueCards(lang, now)).length
  }

  async recordReview(vocabId: string, grade: Grade, now: number): Promise<CardRecord> {
    const userId = await this.userId()
    const { data, error } = await this.supabase.from('srs_state').select('*').eq('user_id', userId).eq('vocab_id', vocabId).maybeSingle()
    if (error) throw error
    if (!data) throw new Error(`No card for vocab ${vocabId}`)
    const current = cardFromRow(data)
    const updated: CardRecord = { ...review(current, grade, now), lang: current.lang }
    const { error: upErr } = await this.supabase.from('srs_state').upsert(cardToRow(userId, updated), { onConflict: 'user_id,vocab_id' })
    if (upErr) throw upErr
    return updated
  }

  async getLessonProgress(lessonId: string): Promise<LessonProgress | null> {
    const userId = await this.userId()
    const { data, error } = await this.supabase.from('lesson_progress').select('*').eq('user_id', userId).eq('lesson_id', lessonId).maybeSingle()
    if (error) throw error
    return data ? lessonProgressFromRow(data) : null
  }

  async setLessonProgress(lessonId: string, status: LessonStatus, now: number): Promise<void> {
    const userId = await this.userId()
    const { error } = await this.supabase.from('lesson_progress').upsert(
      { user_id: userId, lesson_id: lessonId, status, completed_at: status === 'completed' ? new Date(now).toISOString() : null },
      { onConflict: 'user_id,lesson_id' },
    )
    if (error) throw error
  }
}
```

- [ ] **Step 5: Run test, verify it passes** — `npx vitest run test/progress/SupabaseProgressStore.test.ts`. Then `npm test`. Commit.

```bash
git add lib/progress/rows.ts lib/progress/SupabaseProgressStore.ts test/progress/SupabaseProgressStore.test.ts
git commit -m "feat(progress): add SupabaseProgressStore reusing the pure SRS scheduler"
```

---

### Task 6: Swap singletons, remove local impls, wire client anon-session

**Files:**
- Modify: `lib/content/index.ts`, `lib/progress/index.ts`
- Delete: `lib/content/LocalContentSource.ts`, `lib/progress/LocalProgressStore.ts`, `lib/progress/kv.ts`, `test/content/LocalContentSource.test.ts`, `test/progress/LocalProgressStore.test.ts`

**Interfaces:**
- Consumes: `SupabaseContentSource` (Task 4), `SupabaseProgressStore` (Task 5), `createClient` (browser, Task 3).
- Produces: `getContentSource(): ContentSource` returning `SupabaseContentSource`; `getProgressStore(): ProgressStore` returning a `SupabaseProgressStore` built from the browser client.

- [ ] **Step 1: Replace `lib/content/index.ts`**

```ts
import type { ContentSource } from './ContentSource'
import { SupabaseContentSource } from './SupabaseContentSource'

export type { ContentSource } from './ContentSource'

let instance: ContentSource | null = null
export function getContentSource(): ContentSource {
  if (!instance) instance = new SupabaseContentSource()
  return instance
}
```

- [ ] **Step 2: Replace `lib/progress/index.ts`**

```ts
import type { ProgressStore } from './ProgressStore'
import { SupabaseProgressStore } from './SupabaseProgressStore'
import { createClient } from '@/lib/supabase/client'

let instance: ProgressStore | null = null
export function getProgressStore(): ProgressStore {
  if (!instance) instance = new SupabaseProgressStore(createClient())
  return instance
}
```

- [ ] **Step 3: Delete the local implementations and their tests**

```bash
git rm lib/content/LocalContentSource.ts lib/progress/LocalProgressStore.ts lib/progress/kv.ts test/content/LocalContentSource.test.ts test/progress/LocalProgressStore.test.ts
```

- [ ] **Step 4: Verify nothing else imports the deleted modules**

Run: `grep -rEn "LocalContentSource|LocalProgressStore|progress/kv" app lib test` → expect NO matches. Fix any stragglers.

- [ ] **Step 5: Build + test**

Run `npm run build` (must pass) and `npm test` (the two deleted test files are gone; srs, buildQuiz, content schema, content rows, SupabaseProgressStore tests pass). Expected suite: the pure + row tests green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: swap content/progress singletons to Supabase and remove local impls"
```

---

### Task 7: Enable anonymous sign-ins + end-to-end browser verification

**Files:** none (configuration + verification).

**Interfaces:** Consumes the whole stack.

- [ ] **Step 1: Enable anonymous sign-ins (manual, user)**

The MCP cannot toggle Auth providers. Ask the user to open `Authentication → Sign In / Providers` in the dashboard for project `cvltsyoweddhpkomuevz` and enable **Allow anonymous sign-ins**, then confirm. (Controller: confirm before proceeding.)

- [ ] **Step 2: Run the app**

`npm run dev`, confirm it boots without errors.

- [ ] **Step 3: Browser smoke test (Playwright/Chrome DevTools MCP)** — verify the full loop against Supabase:
  1. Load `/` → three languages render (read from Supabase via the server client; middleware created an anon session).
  2. `/learn/zh` → lessons render, due = 0 (fresh user).
  3. Complete `/learn/zh/lesson/zh-l1` quiz → finish.
  4. `/learn/zh` → due = 5 (cards written to `srs_state`).
  5. `/learn/zh/review` → reveal, grade `Tốt` (count 5→4), grade `Lại` (count stays, re-queued).
  6. Reload → progress persists (now in Supabase, not localStorage).

- [ ] **Step 4: Verify persistence in the database**

Via `execute_sql`: `select count(*) from srs_state;` → expect ≥ 5 rows for the anon user. Confirms RLS-protected writes worked through the session.

- [ ] **Step 5: Security advisors check**

`get_advisors(project_id, type="security")` → confirm no new RLS/security warnings. Record output.

---

## Self-Review

**1. Spec coverage:**
- Schema + RLS (spec §4, §5) → Task 1. ✓
- Anonymous auth via @supabase/ssr + middleware bootstrap (spec §6) → Task 3 + Task 7 (enable). ✓
- Supabase clients (spec §7) → Task 3. ✓
- SupabaseContentSource / SupabaseProgressStore reusing pure SRS (spec §8) → Tasks 4, 5. ✓
- Seed (spec §9) → Task 2. ✓
- Env config (spec §10) → Task 3. ✓
- zod boundary validation (spec §11) → Tasks 4 (`content/rows.ts`), 5 (`progress/rows.ts`). ✓
- Testing (spec §13) → row tests + mocked SupabaseProgressStore test; local tests removed (Task 6); browser verify (Task 7). ✓
- Remove local impls (spec §14) → Task 6. ✓
- Content readable only by authenticated (decision) → Task 1 RLS `to authenticated`; server client reads via anon session. ✓
- Swap entirely (decision) → Task 6 deletes local, index returns Supabase only. ✓

**2. Placeholder scan:** No TBD/TODO. The `.env.local` values are deliberately supplied at dispatch (secret hygiene), not a placeholder gap. Supabase SSR boilerplate is provided and cross-checked against the `supabase:supabase` skill per the header directive.

**3. Type consistency:** `CardRecord`/`Grade`/`LessonProgress`/`LessonStatus` reused from `lib/progress/types.ts` unchanged; `cardFromRow`/`cardToRow` names consistent across Task 5 and consumers; `parseVocabRow`/`parseLessonRow`/`parseLanguageRow` consistent between Task 4 def and use; `getContentSource`/`getProgressStore` signatures unchanged from Phase 1 so UI consumers keep working.

**Notes for execution:** verify `auth.role()='authenticated'` covers anonymous users (docs confirm). Verify `@supabase/ssr` `cookies()` and middleware API against the `supabase:supabase` skill (Next 16). `recordReview` and `ensureCards` reuse the pure `review()`/`initialSrsState` — do not reimplement the algorithm.
