# Dictionary Lookup (`/dictionary`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A hanzii-style word lookup: a search page (`/dictionary`) and a rich detail page (`/dictionary/[lang]/[id]`) showing pronunciation, meanings by part of speech, Chinese character breakdown, related words, the same word in other languages, and examples.

**Architecture:** Reuse the existing `lib/dictionary` data layer (`searchEntries`, `getEntryDetail`) and add `getCrossLanguage` + `getCharacters`. The detail page is a Server Component that reads through the cookieless cached content client (`createContentClient` + `unstable_cache`), so it caches. The search box is a client component reusing `searchEntries`. Sections self-hide when data is missing (graceful degrade), so the page is fully usable for English now and lights up for zh/es as the crawl backfills.

**Tech Stack:** Next.js 16.2.9 (App Router, Server Components first), React 19.2, Supabase (`.schema('lex')`), Tailwind 4, Vitest + Testing Library.

## Global Constraints

- This is NOT the Next.js in training data. Dynamic route params and `searchParams` are **Promises** — type them `Promise<{...}>` and `await` them (confirmed pattern in `app/learn/[lang]/page.tsx`). Use `notFound()` from `next/navigation`. Before touching caching, read `node_modules/next/dist/docs/`.
- Route paths are **English** (`/dictionary`, matching `/learn`, `/wordlist`); UI labels are **Vietnamese** ("Tra cứu"). Never create a Vietnamese route path.
- Public dictionary data is read through the cookieless content client (role `anon`) so pages cache. NEVER call `cookies()` inside an `unstable_cache` scope. Cache options: `{ revalidate: 3600, tags: ['lex'] }`.
- Verified data reality (live 2026-06-20): Vietnamese glosses exist only for **en (101/101)**; **es (0/100)** and **zh (0/30)** have none yet. Related words are **text-only** (`related_text`; `related_entry_id` always null). Cross-language is **very sparse**: most words (incl. `en:dog`) resolve to **0** siblings because the linked target entries don't exist yet. Chinese character data lives in table **`lex.characters`** keyed by glyph (`char`), NOT in `attributes`.
- TS strict, no `any` (mock-builder casts via `as unknown as SupabaseClient` are the established exception — see `test/dictionary.test.ts`). TDD. DRY: reuse `AudioButton`, `searchEntries`, `getEntryDetail`, `draftFromDictEntry`, `addWord`. `LangCode = 'zh' | 'es' | 'en'`.
- Tests live in `test/`. Keep all existing tests (51) green; `npx tsc --noEmit` exit 0; `npm run build` OK.

---

### Task 1: Migration — anon read for `lex.characters` and `lex.cross_language_links`

**Files:**
- Create: `supabase/migrations/0007_lex_lookup_anon.sql`

**Context:** Migration 0006 already added `anon SELECT` policies for `lex.entries/senses/pronunciations/examples/lex_relations`. The cross-language and character panels need two more tables readable by the cookieless `anon` client; today they only have `authenticated` policies, so the cached content client would silently get empty results.

**Interfaces:**
- Produces: anon may `SELECT` from `lex.characters` and `lex.cross_language_links`.

- [ ] **Step 1: Write the migration file**

```sql
-- 0007_lex_lookup_anon.sql
-- Allow anonymous (cookieless) read of character + cross-language data so the
-- dictionary detail page can be served by the cached content client (role anon).
-- Mirrors the anon SELECT policies added in 0006 for entries/senses/etc.

drop policy if exists "lex_characters_select_anon" on lex.characters;
create policy "lex_characters_select_anon"
  on lex.characters for select to anon using (true);

drop policy if exists "lex_cross_language_links_select_anon" on lex.cross_language_links;
create policy "lex_cross_language_links_select_anon"
  on lex.cross_language_links for select to anon using (true);
```

- [ ] **Step 2: Apply the migration**

The controller applies it via the Supabase MCP `apply_migration` tool (name `lex_lookup_anon`, project `cvltsyoweddhpkomuevz`). Subagent: leave applied=false in your report; the controller handles apply + verification.

- [ ] **Step 3: Verify (controller)**

Run via MCP `execute_sql`:
```sql
select tablename, policyname, roles from pg_policies
where schemaname='lex' and policyname like '%_select_anon'
order by tablename;
```
Expected: rows for `characters` and `cross_language_links` with `roles = {anon}`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0007_lex_lookup_anon.sql
git commit -m "feat(lex): anon SELECT for characters + cross_language_links"
```

---

### Task 2: Types, entry-id helpers, and labels

**Files:**
- Modify: `lib/dictionary/types.ts`
- Create: `lib/dictionary/entryId.ts`
- Create: `lib/dictionary/labels.ts`
- Test: `test/dictionary-entryid.test.ts`

**Interfaces:**
- Produces:
  - `CrossLangSibling { id: string; lang: LangCode; headword: string; glossVi: string | null }`
  - `CharInfo { char: string; radical: string | null; strokeCount: number | null; hanViet: string[]; pinyin: string[]; gloss: string | null }`
  - `splitEntryId(id: string): { lang: string; key: string }`
  - `buildEntryId(lang: LangCode, key: string): string`
  - `entryPath(id: string): string` — detail page URL, e.g. `/dictionary/zh/%E7%8B%97`
  - `searchPath(lang: LangCode, q: string): string` — re-search URL, e.g. `/dictionary?q=hound&lang=en`
  - `LANG_LABELS`, `LANG_FLAGS: Record<LangCode, string>`; `relationLabel(type: string): string`

- [ ] **Step 1: Write the failing test**

```ts
// test/dictionary-entryid.test.ts
import { describe, it, expect } from 'vitest'
import { splitEntryId, buildEntryId, entryPath, searchPath } from '@/lib/dictionary/entryId'
import { relationLabel, LANG_LABELS, LANG_FLAGS } from '@/lib/dictionary/labels'

describe('entryId helpers', () => {
  it('splits at the first colon only', () => {
    expect(splitEntryId('en:dog')).toEqual({ lang: 'en', key: 'dog' })
    expect(splitEntryId('es:Internet Movie Database')).toEqual({ lang: 'es', key: 'Internet Movie Database' })
    expect(splitEntryId('zh:狗')).toEqual({ lang: 'zh', key: '狗' })
  })
  it('builds an entry id', () => {
    expect(buildEntryId('zh', '狗')).toBe('zh:狗')
  })
  it('encodes the detail path', () => {
    expect(entryPath('en:dog')).toBe('/dictionary/en/dog')
    expect(entryPath('zh:狗')).toBe('/dictionary/zh/%E7%8B%97')
    expect(entryPath('es:Internet Movie Database')).toBe('/dictionary/es/Internet%20Movie%20Database')
  })
  it('builds a re-search path', () => {
    expect(searchPath('en', 'hound')).toBe('/dictionary?q=hound&lang=en')
    expect(searchPath('zh', '小狗')).toBe('/dictionary?q=%E5%B0%8F%E7%8B%97&lang=zh')
  })
})

describe('labels', () => {
  it('maps relation types to Vietnamese, falls back to raw', () => {
    expect(relationLabel('synonym')).toBe('Cận nghĩa')
    expect(relationLabel('antonym')).toBe('Trái nghĩa')
    expect(relationLabel('derived')).toBe('Phái sinh')
    expect(relationLabel('related')).toBe('Liên quan')
    expect(relationLabel('weird')).toBe('weird')
  })
  it('has a label and flag for every lang', () => {
    expect(LANG_LABELS.zh).toBe('Tiếng Trung')
    expect(LANG_FLAGS.es).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/dictionary-entryid.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Add the types**

Append to `lib/dictionary/types.ts`:
```ts
export interface CrossLangSibling {
  id: string
  lang: LangCode
  headword: string
  glossVi: string | null
}
export interface CharInfo {
  char: string
  radical: string | null
  strokeCount: number | null
  hanViet: string[]
  pinyin: string[]
  gloss: string | null
}
```

- [ ] **Step 4: Create `lib/dictionary/entryId.ts`**

```ts
import type { LangCode } from '@/lib/content/types'

export function splitEntryId(id: string): { lang: string; key: string } {
  const i = id.indexOf(':')
  if (i === -1) return { lang: '', key: id }
  return { lang: id.slice(0, i), key: id.slice(i + 1) }
}

export function buildEntryId(lang: LangCode, key: string): string {
  return `${lang}:${key}`
}

export function entryPath(id: string): string {
  const { lang, key } = splitEntryId(id)
  return `/dictionary/${lang}/${encodeURIComponent(key)}`
}

export function searchPath(lang: LangCode, q: string): string {
  return `/dictionary?q=${encodeURIComponent(q)}&lang=${lang}`
}
```

- [ ] **Step 5: Create `lib/dictionary/labels.ts`**

```ts
import type { LangCode } from '@/lib/content/types'

export const LANG_LABELS: Record<LangCode, string> = {
  en: 'Tiếng Anh',
  zh: 'Tiếng Trung',
  es: 'Tiếng Tây Ban Nha',
}

export const LANG_FLAGS: Record<LangCode, string> = {
  en: '🇬🇧',
  zh: '🇨🇳',
  es: '🇪🇸',
}

const RELATION_LABELS_VI: Record<string, string> = {
  synonym: 'Cận nghĩa',
  antonym: 'Trái nghĩa',
  derived: 'Phái sinh',
  related: 'Liên quan',
}

export function relationLabel(type: string): string {
  return RELATION_LABELS_VI[type] ?? type
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run test/dictionary-entryid.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/dictionary/types.ts lib/dictionary/entryId.ts lib/dictionary/labels.ts test/dictionary-entryid.test.ts
git commit -m "feat(dictionary): add cross-lang/char types, entry-id + label helpers"
```

---

### Task 3: Data functions `getCrossLanguage`, `getCharacters`, and cached wrappers

**Files:**
- Modify: `lib/dictionary/search.ts`
- Create: `lib/dictionary/cached.ts`
- Test: `test/dictionary.test.ts` (extend), `test/dictionary-cached.test.ts` (create)

**Interfaces:**
- Consumes: `CrossLangSibling`, `CharInfo` (Task 2); `createContentClient` (`lib/supabase/content.ts`); `getEntryDetail` (existing).
- Produces:
  - `getCrossLanguage(supabase: SupabaseClient, entryId: string): Promise<CrossLangSibling[]>`
  - `getCharacters(supabase: SupabaseClient, headword: string): Promise<CharInfo[]>`
  - `getCachedEntryDetail(entryId: string): Promise<DictEntryDetail | null>`
  - `getCachedCrossLanguage(entryId: string): Promise<CrossLangSibling[]>`
  - `getCachedCharacters(headword: string): Promise<CharInfo[]>`

**Notes for the implementer:**
- `getCrossLanguage` uses TWO `.eq` queries (`from_entry_id`, `to_entry_id`) to collect this entry's `concept_id`s — NOT a `.or(...)` string, which can break when a headword contains reserved characters. Then one `.in('concept_id', ...)` to gather all sibling entry ids, then one `.in('id', ...)` to keep only ids that actually exist in `lex.entries` (the source of graceful degrade). `glossVi` comes from the lowest-`sense_order` sense.
- `getCharacters` splits the headword into individual Han glyphs (preserving order, including repeats), queries `lex.characters` by `char`, and maps each glyph back. Non-Han input returns `[]` without a query.

- [ ] **Step 1: Write the failing tests (extend `test/dictionary.test.ts`)**

Add a queue-based mock and new describe blocks at the end of `test/dictionary.test.ts`:
```ts
import { getCrossLanguage, getCharacters } from '@/lib/dictionary/search'

// Returns queued results in call order; `.eq` and `.in` are terminal (awaited).
function queueClient(results: { data: unknown; error: null }[]) {
  let i = 0
  const next = () => Promise.resolve(results[i++] ?? { data: [], error: null })
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    select: vi.fn(() => builder),
    eq: vi.fn(() => next()),
    in: vi.fn(() => next()),
  })
  return {
    schema: vi.fn(() => ({ from: vi.fn(() => builder) })),
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

describe('getCrossLanguage', () => {
  it('returns only siblings that exist as entries', async () => {
    const client = queueClient([
      { data: [{ concept_id: 'Q144' }], error: null },               // eq from_entry_id
      { data: [], error: null },                                      // eq to_entry_id
      { data: [                                                       // in concept_id
        { from_entry_id: 'en:dog', to_entry_id: 'es:perro' },
        { from_entry_id: 'en:dog', to_entry_id: 'zh:狗' },
      ], error: null },
      { data: [                                                       // in id (only perro exists)
        { id: 'es:perro', lang: 'es', headword: 'perro', senses: [{ gloss_vi: 'con chó', sense_order: 1 }] },
      ], error: null },
    ])
    const res = await getCrossLanguage(client, 'en:dog')
    expect(res).toEqual([{ id: 'es:perro', lang: 'es', headword: 'perro', glossVi: 'con chó' }])
  })

  it('returns [] when the entry has no concepts', async () => {
    const client = queueClient([{ data: [], error: null }, { data: [], error: null }])
    expect(await getCrossLanguage(client, 'en:nope')).toEqual([])
  })
})

describe('getCharacters', () => {
  it('maps each Han glyph in order, repeats included', async () => {
    const client = queueClient([
      { data: [{ char: '人', radical: '人', stroke_count: 2, han_viet: ['nhân'], pinyin: ['rén'], gloss: 'person' }], error: null },
    ])
    const res = await getCharacters(client, '人人')
    expect(res).toHaveLength(2)
    expect(res[0]).toEqual({ char: '人', radical: '人', strokeCount: 2, hanViet: ['nhân'], pinyin: ['rén'], gloss: 'person' })
  })

  it('returns [] for non-Han input without querying', async () => {
    const client = queueClient([])
    expect(await getCharacters(client, 'dog')).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/dictionary.test.ts`
Expected: FAIL (`getCrossLanguage`/`getCharacters` not exported).

- [ ] **Step 3: Implement in `lib/dictionary/search.ts`**

Add imports at the top (extend the existing type import):
```ts
import type {
  DictEntryPreview, DictEntryDetail, DictSense, DictPron, DictExample, DictRelation,
  CrossLangSibling, CharInfo,
} from './types'
```
Append at the end of the file:
```ts
interface ConceptRow { concept_id: string | null }
interface LinkRow { from_entry_id: string | null; to_entry_id: string | null }
interface SiblingRow {
  id: string; lang: LangCode; headword: string
  senses: { gloss_vi: string | null; sense_order: number }[] | null
}

export async function getCrossLanguage(
  supabase: SupabaseClient, entryId: string,
): Promise<CrossLangSibling[]> {
  const links = supabase.schema('lex').from('cross_language_links')
  const [from, to] = await Promise.all([
    links.select('concept_id').eq('from_entry_id', entryId),
    supabase.schema('lex').from('cross_language_links').select('concept_id').eq('to_entry_id', entryId),
  ])
  if (from.error) throw from.error
  if (to.error) throw to.error
  const conceptIds = [...new Set(
    [...(from.data ?? []), ...(to.data ?? [])]
      .map((r) => (r as ConceptRow).concept_id)
      .filter((c): c is string => Boolean(c)),
  )]
  if (conceptIds.length === 0) return []

  const sib = await supabase.schema('lex').from('cross_language_links')
    .select('from_entry_id, to_entry_id').in('concept_id', conceptIds)
  if (sib.error) throw sib.error
  const candidateIds = [...new Set(
    ((sib.data ?? []) as LinkRow[])
      .flatMap((r) => [r.from_entry_id, r.to_entry_id])
      .filter((id): id is string => Boolean(id)),
  )].filter((id) => id !== entryId)
  if (candidateIds.length === 0) return []

  const entries = await supabase.schema('lex').from('entries')
    .select('id, lang, headword, senses(gloss_vi, sense_order)').in('id', candidateIds)
  if (entries.error) throw entries.error
  return ((entries.data ?? []) as unknown as SiblingRow[]).map((r) => {
    const primary = [...(r.senses ?? [])].sort((a, b) => a.sense_order - b.sense_order)[0]
    return { id: r.id, lang: r.lang, headword: r.headword, glossVi: primary?.gloss_vi ?? null }
  })
}

interface CharRow {
  char: string; radical: string | null; stroke_count: number | null
  han_viet: string[] | null; pinyin: string[] | null; gloss: string | null
}

export async function getCharacters(
  supabase: SupabaseClient, headword: string,
): Promise<CharInfo[]> {
  const glyphs = [...headword].filter((c) => /\p{Script=Han}/u.test(c))
  if (glyphs.length === 0) return []
  const unique = [...new Set(glyphs)]
  const { data, error } = await supabase.schema('lex').from('characters')
    .select('char, radical, stroke_count, han_viet, pinyin, gloss').in('char', unique)
  if (error) throw error
  const byChar = new Map(((data ?? []) as CharRow[]).map((r) => [r.char, r]))
  return glyphs.map((c) => {
    const r = byChar.get(c)
    return {
      char: c,
      radical: r?.radical ?? null,
      strokeCount: r?.stroke_count ?? null,
      hanViet: r?.han_viet ?? [],
      pinyin: r?.pinyin ?? [],
      gloss: r?.gloss ?? null,
    }
  })
}
```

- [ ] **Step 4: Run the dictionary test to verify it passes**

Run: `npx vitest run test/dictionary.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for cached wrappers**

```ts
// test/dictionary-cached.test.ts
import { describe, it, expect, vi } from 'vitest'

const MOCK = { _mock: true }
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock('@/lib/supabase/content', () => ({ createContentClient: () => MOCK }))
vi.mock('@/lib/dictionary/search', () => ({
  getEntryDetail: vi.fn(async () => ({ id: 'en:dog' })),
  getCrossLanguage: vi.fn(async () => ([{ id: 'es:perro' }])),
  getCharacters: vi.fn(async () => ([{ char: '人' }])),
}))

import { getCachedEntryDetail, getCachedCrossLanguage, getCachedCharacters } from '@/lib/dictionary/cached'
import { getEntryDetail, getCrossLanguage, getCharacters } from '@/lib/dictionary/search'

describe('cached dictionary wrappers', () => {
  it('call the underlying fns with the content client', async () => {
    await getCachedEntryDetail('en:dog')
    expect(getEntryDetail).toHaveBeenCalledWith(MOCK, 'en:dog')
    await getCachedCrossLanguage('en:dog')
    expect(getCrossLanguage).toHaveBeenCalledWith(MOCK, 'en:dog')
    await getCachedCharacters('狗')
    expect(getCharacters).toHaveBeenCalledWith(MOCK, '狗')
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run test/dictionary-cached.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 7: Create `lib/dictionary/cached.ts`**

```ts
import { unstable_cache } from 'next/cache'
import { createContentClient } from '@/lib/supabase/content'
import { getEntryDetail, getCrossLanguage, getCharacters } from './search'
import type { DictEntryDetail, CrossLangSibling, CharInfo } from './types'

export const getCachedEntryDetail = unstable_cache(
  (entryId: string): Promise<DictEntryDetail | null> => getEntryDetail(createContentClient(), entryId),
  ['dict-entry-detail'],
  { revalidate: 3600, tags: ['lex'] },
)

export const getCachedCrossLanguage = unstable_cache(
  (entryId: string): Promise<CrossLangSibling[]> => getCrossLanguage(createContentClient(), entryId),
  ['dict-cross-language'],
  { revalidate: 3600, tags: ['lex'] },
)

export const getCachedCharacters = unstable_cache(
  (headword: string): Promise<CharInfo[]> => getCharacters(createContentClient(), headword),
  ['dict-characters'],
  { revalidate: 3600, tags: ['lex'] },
)
```

- [ ] **Step 8: Run the cached test to verify it passes**

Run: `npx vitest run test/dictionary-cached.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/dictionary/search.ts lib/dictionary/cached.ts test/dictionary.test.ts test/dictionary-cached.test.ts
git commit -m "feat(dictionary): getCrossLanguage + getCharacters + cached content reads"
```

---

### Task 4: Universal detail sections — AddToWordlistButton, LookupHero, SenseList, ExampleList

**Files:**
- Create: `components/lookup/AddToWordlistButton.tsx`
- Create: `components/lookup/LookupHero.tsx`
- Create: `components/lookup/SenseList.tsx`
- Create: `components/lookup/ExampleList.tsx`
- Test: `test/lookup-sections.test.tsx`

**Interfaces:**
- Consumes: `DictEntryDetail`, `DictSense`, `DictExample`, `DictEntryPreview` (types); `AudioButton`, `speechLang` (existing); `addWord`, `draftFromDictEntry` (`lib/wordlist/store`); `createClient` (`lib/supabase/client`).
- Produces:
  - `AddToWordlistButton({ entry: DictEntryPreview })`
  - `LookupHero({ detail: DictEntryDetail; hanViet?: string | null })`
  - `SenseList({ senses: DictSense[] })` — returns `null` when empty
  - `ExampleList({ examples: DictExample[]; lang: LangCode })` — returns `null` when empty

- [ ] **Step 1: Write the failing test**

```tsx
// test/lookup-sections.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LookupHero } from '@/components/lookup/LookupHero'
import { SenseList } from '@/components/lookup/SenseList'
import { ExampleList } from '@/components/lookup/ExampleList'
import { AddToWordlistButton } from '@/components/lookup/AddToWordlistButton'
import { addWord } from '@/lib/wordlist/store'
import type { DictEntryDetail } from '@/lib/dictionary/types'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/wordlist/store', () => ({
  addWord: vi.fn(async () => ({})),
  draftFromDictEntry: (e: { headword: string }) => ({ headword: e.headword }),
}))

const detail: DictEntryDetail = {
  id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1', ipa: '/dɔːɡ/', pos: 'noun',
  glossVi: 'con chó', glossEn: 'dog', audioUrl: null,
  senses: [
    { pos: 'noun', glossVi: 'con chó', glossEn: 'a dog', senseOrder: 1 },
    { pos: 'verb', glossVi: 'theo dõi', glossEn: null, senseOrder: 2 },
  ],
  pronunciations: [], examples: [], relations: [], attributes: {},
}

describe('LookupHero', () => {
  it('shows headword, ipa and level', () => {
    render(<LookupHero detail={detail} />)
    expect(screen.getByRole('heading', { name: 'dog' })).toBeInTheDocument()
    expect(screen.getByText('/dɔːɡ/')).toBeInTheDocument()
    expect(screen.getByText('A1')).toBeInTheDocument()
  })
  it('shows Hán-Việt when provided', () => {
    render(<LookupHero detail={{ ...detail, lang: 'zh' }} hanViet="khuyển" />)
    expect(screen.getByText(/khuyển/)).toBeInTheDocument()
  })
})

describe('SenseList', () => {
  it('groups senses by part of speech', () => {
    render(<SenseList senses={detail.senses} />)
    expect(screen.getByText('con chó')).toBeInTheDocument()
    expect(screen.getByText('theo dõi')).toBeInTheDocument()
  })
  it('renders nothing when empty', () => {
    const { container } = render(<SenseList senses={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ExampleList', () => {
  it('renders nothing when empty', () => {
    const { container } = render(<ExampleList examples={[]} lang="en" />)
    expect(container).toBeEmptyDOMElement()
  })
  it('shows example text and translation', () => {
    render(<ExampleList lang="en" examples={[{ text: 'The dog barked.', reading: null, translationVi: 'Con chó sủa.', translationEn: null }]} />)
    expect(screen.getByText('The dog barked.')).toBeInTheDocument()
    expect(screen.getByText('Con chó sủa.')).toBeInTheDocument()
  })
})

describe('AddToWordlistButton', () => {
  it('adds the entry and shows confirmation', async () => {
    render(<AddToWordlistButton entry={detail} />)
    await userEvent.click(screen.getByRole('button', { name: /Thêm vào sổ tay/i }))
    expect(addWord).toHaveBeenCalled()
    expect(await screen.findByText(/Đã thêm/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/lookup-sections.test.tsx`
Expected: FAIL (components not found).

- [ ] **Step 3: Create `components/lookup/AddToWordlistButton.tsx`**

```tsx
'use client'
import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addWord, draftFromDictEntry } from '@/lib/wordlist/store'
import type { DictEntryPreview } from '@/lib/dictionary/types'

type State = 'idle' | 'saving' | 'added' | 'error'

export function AddToWordlistButton({ entry }: { entry: DictEntryPreview }) {
  const supabase = useMemo(() => createClient(), [])
  const [state, setState] = useState<State>('idle')

  async function onClick() {
    setState('saving')
    try {
      await addWord(supabase, draftFromDictEntry(entry))
      setState('added')
    } catch {
      setState('error')
    }
  }

  const label = state === 'added' ? '✓ Đã thêm'
    : state === 'saving' ? 'Đang thêm...'
    : state === 'error' ? 'Lỗi, thử lại'
    : '+ Thêm vào sổ tay'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === 'saving' || state === 'added'}
      className="rounded-lg bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
    >
      {label}
    </button>
  )
}
```

- [ ] **Step 4: Create `components/lookup/LookupHero.tsx`**

```tsx
import { AudioButton } from '@/components/AudioButton'
import { AddToWordlistButton } from './AddToWordlistButton'
import type { DictEntryDetail } from '@/lib/dictionary/types'

export function LookupHero({ detail, hanViet }: { detail: DictEntryDetail; hanViet?: string | null }) {
  const pinyin = typeof detail.attributes.pinyin === 'string' ? detail.attributes.pinyin : null
  return (
    <header className="flex flex-col gap-2 border-b border-black/10 pb-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-4xl font-bold">{detail.headword}</h1>
        {detail.traditional && detail.traditional !== detail.headword && (
          <span className="text-2xl text-black/40">{detail.traditional}</span>
        )}
        <AudioButton text={detail.headword} lang={detail.lang} audioUrl={detail.audioUrl} />
        {detail.level && (
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium text-black/60">{detail.level}</span>
        )}
        <div className="ml-auto"><AddToWordlistButton entry={detail} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-black/60">
        {pinyin && <span className="font-medium">{pinyin}</span>}
        {detail.ipa && <span className="font-mono">{detail.ipa}</span>}
        {hanViet && <span className="italic">Hán-Việt: {hanViet}</span>}
      </div>
    </header>
  )
}
```

- [ ] **Step 5: Create `components/lookup/SenseList.tsx`**

```tsx
import type { DictSense } from '@/lib/dictionary/types'

export function SenseList({ senses }: { senses: DictSense[] }) {
  if (senses.length === 0) return null
  const groups: { pos: string | null; items: DictSense[] }[] = []
  for (const s of [...senses].sort((a, b) => a.senseOrder - b.senseOrder)) {
    let g = groups.find((x) => x.pos === s.pos)
    if (!g) { g = { pos: s.pos, items: [] }; groups.push(g) }
    g.items.push(s)
  }
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Nghĩa</h2>
      {groups.map((g, gi) => (
        <div key={gi} className="flex flex-col gap-1.5">
          {g.pos && <span className="text-xs font-semibold uppercase tracking-wide text-black/40">{g.pos}</span>}
          <ol className="flex list-inside list-decimal flex-col gap-1">
            {g.items.map((s, i) => (
              <li key={i}>
                {s.glossVi && <span className="text-black/80">{s.glossVi}</span>}
                {s.glossEn && <span className="ml-2 text-sm text-black/50">{s.glossEn}</span>}
                {!s.glossVi && !s.glossEn && <span className="italic text-black/30">(chưa có nghĩa)</span>}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  )
}
```

- [ ] **Step 6: Create `components/lookup/ExampleList.tsx`**

```tsx
import { AudioButton } from '@/components/AudioButton'
import type { DictExample } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/content/types'

export function ExampleList({ examples, lang }: { examples: DictExample[]; lang: LangCode }) {
  if (examples.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Ví dụ</h2>
      <ul className="flex flex-col gap-2">
        {examples.map((e, i) => (
          <li key={i} className="flex flex-col gap-0.5 border-l-2 border-black/10 pl-3">
            <div className="flex items-center gap-2">
              <p className="text-black/80">{e.text}</p>
              <AudioButton text={e.text} lang={lang} />
            </div>
            {e.translationVi && <p className="text-sm text-black/50">{e.translationVi}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run test/lookup-sections.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add components/lookup/AddToWordlistButton.tsx components/lookup/LookupHero.tsx components/lookup/SenseList.tsx components/lookup/ExampleList.tsx test/lookup-sections.test.tsx
git commit -m "feat(lookup): hero, sense list, example list, add-to-wordlist button"
```

---

### Task 5: Conditional sections — CharacterPanel, RelatedWords, CrossLanguagePanel

**Files:**
- Create: `components/lookup/CharacterPanel.tsx`
- Create: `components/lookup/RelatedWords.tsx`
- Create: `components/lookup/CrossLanguagePanel.tsx`
- Test: `test/lookup-relations.test.tsx`

**Interfaces:**
- Consumes: `CharInfo`, `DictRelation`, `CrossLangSibling` (types); `relationLabel`, `LANG_FLAGS`, `LANG_LABELS` (`lib/dictionary/labels`); `entryPath`, `searchPath` (`lib/dictionary/entryId`); `next/link`.
- Produces:
  - `CharacterPanel({ characters: CharInfo[] })` — returns `null` when empty
  - `RelatedWords({ relations: DictRelation[]; lang: LangCode })` — returns `null` when no text relations; chips link to `searchPath`
  - `CrossLanguagePanel({ siblings: CrossLangSibling[] })` — returns `null` when empty; cards link to `entryPath`

- [ ] **Step 1: Write the failing test**

```tsx
// test/lookup-relations.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CharacterPanel } from '@/components/lookup/CharacterPanel'
import { RelatedWords } from '@/components/lookup/RelatedWords'
import { CrossLanguagePanel } from '@/components/lookup/CrossLanguagePanel'

describe('CharacterPanel', () => {
  it('renders nothing when empty', () => {
    const { container } = render(<CharacterPanel characters={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('shows glyph, radical, strokes and Hán-Việt', () => {
    render(<CharacterPanel characters={[{ char: '狗', radical: '犬', strokeCount: 8, hanViet: ['cẩu'], pinyin: ['gǒu'], gloss: 'dog' }]} />)
    expect(screen.getByText('狗')).toBeInTheDocument()
    expect(screen.getByText(/犬/)).toBeInTheDocument()
    expect(screen.getByText(/cẩu/)).toBeInTheDocument()
    expect(screen.getByText(/8 nét/)).toBeInTheDocument()
  })
})

describe('RelatedWords', () => {
  it('renders nothing when there are no text relations', () => {
    const { container } = render(<RelatedWords lang="en" relations={[{ relationType: 'synonym', relatedText: null, relatedEntryId: null }]} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('groups chips by type and links to a re-search', () => {
    render(<RelatedWords lang="en" relations={[{ relationType: 'synonym', relatedText: 'hound', relatedEntryId: null }]} />)
    expect(screen.getByText('Cận nghĩa')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'hound' })
    expect(link).toHaveAttribute('href', '/dictionary?q=hound&lang=en')
  })
})

describe('CrossLanguagePanel', () => {
  it('renders nothing when empty', () => {
    const { container } = render(<CrossLanguagePanel siblings={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('links each sibling to its detail page', () => {
    render(<CrossLanguagePanel siblings={[{ id: 'es:perro', lang: 'es', headword: 'perro', glossVi: 'con chó' }]} />)
    const link = screen.getByRole('link', { name: /perro/ })
    expect(link).toHaveAttribute('href', '/dictionary/es/perro')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/lookup-relations.test.tsx`
Expected: FAIL (components not found).

- [ ] **Step 3: Create `components/lookup/CharacterPanel.tsx`**

```tsx
import type { CharInfo } from '@/lib/dictionary/types'

export function CharacterPanel({ characters }: { characters: CharInfo[] }) {
  if (characters.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Chữ và bộ thủ</h2>
      <div className="flex flex-col gap-2">
        {characters.map((c, i) => (
          <div key={i} className="flex items-center gap-4 rounded-lg bg-black/5 px-4 py-3">
            <span className="text-3xl font-bold">{c.char}</span>
            <div className="flex flex-col gap-0.5 text-sm">
              <div className="flex gap-3 text-black/70">
                {c.pinyin.length > 0 && <span className="font-medium">{c.pinyin.join(', ')}</span>}
                {c.hanViet.length > 0 && <span className="italic">{c.hanViet.join(', ')}</span>}
              </div>
              <div className="flex gap-3 text-xs text-black/50">
                {c.radical && <span>Bộ: {c.radical}</span>}
                {c.strokeCount != null && <span>{c.strokeCount} nét</span>}
              </div>
              {c.gloss && <span className="text-xs text-black/50">{c.gloss}</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Create `components/lookup/RelatedWords.tsx`**

```tsx
import Link from 'next/link'
import { relationLabel } from '@/lib/dictionary/labels'
import { searchPath } from '@/lib/dictionary/entryId'
import type { DictRelation } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/content/types'

const ORDER = ['synonym', 'antonym', 'derived', 'related']

export function RelatedWords({ relations, lang }: { relations: DictRelation[]; lang: LangCode }) {
  const groups: Record<string, string[]> = {}
  for (const r of relations) {
    if (!r.relatedText) continue
    ;(groups[r.relationType] ??= []).push(r.relatedText)
  }
  const keys = Object.keys(groups).sort((a, b) => {
    const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
  if (keys.length === 0) return null
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Từ liên quan</h2>
      {keys.map((type) => (
        <div key={type} className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-black/40">{relationLabel(type)}</span>
          <div className="flex flex-wrap gap-2">
            {groups[type].map((text, i) => (
              <Link
                key={i}
                href={searchPath(lang, text)}
                className="rounded-full bg-black/5 px-3 py-1 text-sm text-black/70 hover:bg-black/10"
              >
                {text}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
```

- [ ] **Step 5: Create `components/lookup/CrossLanguagePanel.tsx`**

```tsx
import Link from 'next/link'
import { entryPath } from '@/lib/dictionary/entryId'
import { LANG_FLAGS, LANG_LABELS } from '@/lib/dictionary/labels'
import type { CrossLangSibling } from '@/lib/dictionary/types'

export function CrossLanguagePanel({ siblings }: { siblings: CrossLangSibling[] }) {
  if (siblings.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Từ này ở ngôn ngữ khác</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {siblings.map((s) => (
          <Link
            key={s.id}
            href={entryPath(s.id)}
            className="flex items-center gap-3 rounded-lg border border-black/10 px-4 py-3 hover:bg-black/5"
          >
            <span className="text-xl">{LANG_FLAGS[s.lang]}</span>
            <div className="flex flex-col">
              <span className="font-medium">{s.headword}</span>
              {s.glossVi && <span className="text-sm text-black/50">{s.glossVi}</span>}
              <span className="text-xs text-black/30">{LANG_LABELS[s.lang]}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run test/lookup-relations.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/lookup/CharacterPanel.tsx components/lookup/RelatedWords.tsx components/lookup/CrossLanguagePanel.tsx test/lookup-relations.test.tsx
git commit -m "feat(lookup): character panel, related words, cross-language panel"
```

---

### Task 6: LookupView composition + detail route `/dictionary/[lang]/[id]`

**Files:**
- Create: `components/lookup/LookupView.tsx`
- Create: `app/dictionary/[lang]/[id]/page.tsx`
- Test: `test/lookup-view.test.tsx`, `test/dictionary-detail-page.test.tsx`

**Interfaces:**
- Consumes: all section components (Tasks 4-5); `getCachedEntryDetail`, `getCachedCrossLanguage`, `getCachedCharacters` (Task 3); `buildEntryId` (Task 2); `notFound` (`next/navigation`).
- Produces:
  - `LookupView({ detail: DictEntryDetail; characters: CharInfo[]; siblings: CrossLangSibling[] })`
  - Default async page component for the detail route.

**Notes:**
- `LookupView` derives the hero Hán-Việt for zh only: `characters.map((c) => c.hanViet[0]).filter(Boolean).join(' ') || null`.
- The page reconstructs `entryId` from `lang` + decoded `id`, guards `lang` against `['en','zh','es']` (→ `notFound()`), fetches detail, and on `null` calls `notFound()`. Characters fetch only for zh; characters + cross-language run via `Promise.all`.

- [ ] **Step 1: Write the failing test for LookupView**

```tsx
// test/lookup-view.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LookupView } from '@/components/lookup/LookupView'
import type { DictEntryDetail } from '@/lib/dictionary/types'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/wordlist/store', () => ({
  addWord: vi.fn(async () => ({})),
  draftFromDictEntry: (e: { headword: string }) => ({ headword: e.headword }),
}))

const base: DictEntryDetail = {
  id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1', ipa: '/dɔːɡ/', pos: 'noun',
  glossVi: 'con chó', glossEn: 'dog', audioUrl: null,
  senses: [{ pos: 'noun', glossVi: 'con chó', glossEn: 'dog', senseOrder: 1 }],
  pronunciations: [], examples: [], relations: [], attributes: {},
}

describe('LookupView', () => {
  it('hides the character panel for non-zh entries', () => {
    render(<LookupView detail={base} characters={[]} siblings={[]} />)
    expect(screen.getByRole('heading', { name: 'dog' })).toBeInTheDocument()
    expect(screen.queryByText('Chữ và bộ thủ')).not.toBeInTheDocument()
  })
  it('shows the character panel for zh entries', () => {
    render(
      <LookupView
        detail={{ ...base, id: 'zh:狗', lang: 'zh', headword: '狗', attributes: { pinyin: 'gǒu' } }}
        characters={[{ char: '狗', radical: '犬', strokeCount: 8, hanViet: ['cẩu'], pinyin: ['gǒu'], gloss: 'dog' }]}
        siblings={[]}
      />,
    )
    expect(screen.getByText('Chữ và bộ thủ')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/lookup-view.test.tsx`
Expected: FAIL (LookupView not found).

- [ ] **Step 3: Create `components/lookup/LookupView.tsx`**

```tsx
import Link from 'next/link'
import { LookupHero } from './LookupHero'
import { SenseList } from './SenseList'
import { CharacterPanel } from './CharacterPanel'
import { RelatedWords } from './RelatedWords'
import { CrossLanguagePanel } from './CrossLanguagePanel'
import { ExampleList } from './ExampleList'
import type { DictEntryDetail, CharInfo, CrossLangSibling } from '@/lib/dictionary/types'

export function LookupView({ detail, characters, siblings }: {
  detail: DictEntryDetail
  characters: CharInfo[]
  siblings: CrossLangSibling[]
}) {
  const hanViet = characters.map((c) => c.hanViet[0]).filter(Boolean).join(' ') || null
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <Link href="/dictionary" className="text-sm text-black/50 hover:underline">← Tra cứu</Link>
      <LookupHero detail={detail} hanViet={detail.lang === 'zh' ? hanViet : null} />
      <SenseList senses={detail.senses} />
      {detail.lang === 'zh' && <CharacterPanel characters={characters} />}
      <RelatedWords relations={detail.relations} lang={detail.lang} />
      <CrossLanguagePanel siblings={siblings} />
      <ExampleList examples={detail.examples} lang={detail.lang} />
    </main>
  )
}
```

- [ ] **Step 4: Run the LookupView test to verify it passes**

Run: `npx vitest run test/lookup-view.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the detail page**

```tsx
// test/dictionary-detail-page.test.tsx
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
vi.mock('@/lib/dictionary/cached', () => ({
  getCachedEntryDetail: vi.fn(),
  getCachedCrossLanguage: vi.fn(async () => []),
  getCachedCharacters: vi.fn(async () => []),
}))
vi.mock('@/components/lookup/LookupView', () => ({
  LookupView: ({ detail }: { detail: { headword: string } }) => <div>view:{detail.headword}</div>,
}))

import Page from '@/app/dictionary/[lang]/[id]/page'
import { getCachedEntryDetail } from '@/lib/dictionary/cached'

describe('dictionary detail page', () => {
  it('calls notFound for an unknown lang', async () => {
    await expect(Page({ params: Promise.resolve({ lang: 'fr', id: 'chien' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('calls notFound when the entry is missing', async () => {
    vi.mocked(getCachedEntryDetail).mockResolvedValueOnce(null)
    await expect(Page({ params: Promise.resolve({ lang: 'en', id: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('reconstructs the entry id from decoded params', async () => {
    vi.mocked(getCachedEntryDetail).mockResolvedValueOnce({
      id: 'zh:狗', lang: 'zh', headword: '狗', traditional: null, level: null, ipa: null, pos: null,
      glossVi: null, glossEn: null, audioUrl: null, senses: [], pronunciations: [], examples: [],
      relations: [], attributes: {},
    })
    await Page({ params: Promise.resolve({ lang: 'zh', id: '%E7%8B%97' }) })
    expect(getCachedEntryDetail).toHaveBeenCalledWith('zh:狗')
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run test/dictionary-detail-page.test.tsx`
Expected: FAIL (page not found).

- [ ] **Step 7: Create `app/dictionary/[lang]/[id]/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { getCachedEntryDetail, getCachedCrossLanguage, getCachedCharacters } from '@/lib/dictionary/cached'
import { buildEntryId } from '@/lib/dictionary/entryId'
import { LookupView } from '@/components/lookup/LookupView'
import type { LangCode } from '@/lib/content/types'

const VALID: LangCode[] = ['zh', 'es', 'en']

export default async function Page({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const { lang, id } = await params
  if (!VALID.includes(lang as LangCode)) notFound()
  const langCode = lang as LangCode
  const entryId = buildEntryId(langCode, decodeURIComponent(id))

  const detail = await getCachedEntryDetail(entryId)
  if (!detail) notFound()

  const [characters, siblings] = await Promise.all([
    detail.lang === 'zh' ? getCachedCharacters(detail.headword) : Promise.resolve([]),
    getCachedCrossLanguage(entryId),
  ])

  return <LookupView detail={detail} characters={characters} siblings={siblings} />
}
```

- [ ] **Step 8: Run the page test to verify it passes**

Run: `npx vitest run test/dictionary-detail-page.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add components/lookup/LookupView.tsx "app/dictionary/[lang]/[id]/page.tsx" test/lookup-view.test.tsx test/dictionary-detail-page.test.tsx
git commit -m "feat(lookup): LookupView + cached detail route /dictionary/[lang]/[id]"
```

---

### Task 7: Search page `/dictionary` + home nav link

**Files:**
- Create: `app/dictionary/page.tsx`
- Create: `app/dictionary/DictionarySearch.tsx`
- Modify: `app/page.tsx`
- Test: `test/dictionary-search.test.tsx`

**Interfaces:**
- Consumes: `searchEntries` (existing); `entryPath` (Task 2); `LANG_LABELS` (Task 2); `createClient` (`lib/supabase/client`).
- Produces:
  - `DictionarySearch({ initialQuery: string; initialLang: LangCode })` — debounced client search, results link to `entryPath`.
  - Default async page reading `searchParams: Promise<{ q?: string; lang?: string }>`, guarding `lang` against valid codes.
  - Home page gains a "Tra cứu" link.

- [ ] **Step 1: Write the failing test**

```tsx
// test/dictionary-search.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DictionarySearch } from '@/app/dictionary/DictionarySearch'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/dictionary/search', () => ({
  searchEntries: vi.fn(async () => ([
    { id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1', ipa: '/dɔːɡ/', pos: 'noun', glossVi: 'con chó', glossEn: 'dog', audioUrl: null },
  ])),
}))

describe('DictionarySearch', () => {
  it('searches and links each result to its detail page', async () => {
    render(<DictionarySearch initialQuery="" initialLang="en" />)
    await userEvent.type(screen.getByPlaceholderText(/Nhập từ/i), 'dog')
    const link = await screen.findByRole('link', { name: /dog/ })
    expect(link).toHaveAttribute('href', '/dictionary/en/dog')
    expect(screen.getByText('con chó')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/dictionary-search.test.tsx`
Expected: FAIL (component not found).

- [ ] **Step 3: Create `app/dictionary/DictionarySearch.tsx`**

```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { searchEntries } from '@/lib/dictionary/search'
import { entryPath } from '@/lib/dictionary/entryId'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/content/types'

const LANGS: LangCode[] = ['en', 'zh', 'es']

export function DictionarySearch({ initialQuery, initialLang }: { initialQuery: string; initialLang: LangCode }) {
  const supabase = useMemo(() => createClient(), [])
  const [lang, setLang] = useState<LangCode>(initialLang)
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<DictEntryPreview[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!query.trim()) { setResults([]); setLoading(false); return }
    setLoading(true)
    const id = setTimeout(async () => {
      try {
        setResults(await searchEntries(supabase, lang, query))
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(id)
  }, [query, lang, supabase])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as LangCode)}
          className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm"
        >
          {LANGS.map((l) => <option key={l} value={l}>{LANG_LABELS[l]}</option>)}
        </select>
        <input
          type="text"
          autoFocus
          placeholder="Nhập từ cần tra..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-lg border border-black/15 px-4 py-2"
        />
      </div>
      {loading && <p className="text-sm text-black/40">Đang tìm...</p>}
      {!loading && query.trim() && results.length === 0 && (
        <p className="text-sm text-black/40">Không tìm thấy kết quả.</p>
      )}
      <ul className="flex flex-col gap-1">
        {results.map((e) => (
          <li key={e.id}>
            <Link href={entryPath(e.id)} className="flex items-baseline gap-2 rounded-lg px-3 py-2 hover:bg-black/5">
              <span className="font-medium">{e.headword}</span>
              {e.ipa && <span className="font-mono text-xs text-black/40">{e.ipa}</span>}
              {e.glossVi && <span className="text-sm text-black/60">{e.glossVi}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Create `app/dictionary/page.tsx`**

```tsx
import Link from 'next/link'
import { DictionarySearch } from './DictionarySearch'
import type { LangCode } from '@/lib/content/types'

const VALID: LangCode[] = ['en', 'zh', 'es']

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; lang?: string }> }) {
  const sp = await searchParams
  const lang: LangCode = VALID.includes(sp.lang as LangCode) ? (sp.lang as LangCode) : 'en'
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="text-sm text-black/50 hover:underline">← Trang chủ</Link>
      <h1 className="mt-3 text-3xl font-bold">Tra cứu</h1>
      <p className="mt-1 text-sm text-black/60">Tra từ để xem nghĩa, phát âm, ví dụ và từ liên quan.</p>
      <div className="mt-6">
        <DictionarySearch initialQuery={sp.q ?? ''} initialLang={lang} />
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Add the home nav link**

In `app/page.tsx`, replace the existing single-link block:
```tsx
      <div className="mt-10">
        <Link href="/wordlist" className="inline-block rounded-lg bg-black px-4 py-2 text-white">
          Danh sách từ của tôi
        </Link>
      </div>
```
with:
```tsx
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/dictionary" className="inline-block rounded-lg border border-black/15 px-4 py-2 hover:bg-black/5">
          Tra cứu
        </Link>
        <Link href="/wordlist" className="inline-block rounded-lg bg-black px-4 py-2 text-white">
          Danh sách từ của tôi
        </Link>
      </div>
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run test/dictionary-search.test.tsx`
Expected: PASS.

- [ ] **Step 7: Full verification**

Run: `npx vitest run` → all tests green (51 existing + new).
Run: `npx tsc --noEmit` → exit 0.
Run: `npm run build` → success; `/dictionary` listed, `/dictionary/[lang]/[id]` dynamic.

- [ ] **Step 8: Commit**

```bash
git add app/dictionary/page.tsx app/dictionary/DictionarySearch.tsx app/page.tsx test/dictionary-search.test.tsx
git commit -m "feat(lookup): /dictionary search page + home nav link"
```

---

## Self-Review

- **Spec coverage:** §2 routes → Tasks 6-7; §3 data layer (`getCrossLanguage`, `getCharacters`, character mapping corrected to `lex.characters`) → Task 3; §4 six detail sections → Tasks 4-6; §5 caching (cookieless + `unstable_cache`) → Task 3 + page; §6 tests → every task; RLS prerequisite (newly discovered) → Task 1. Covered.
- **Placeholder scan:** none — every step has complete code or an exact command.
- **Type consistency:** `CrossLangSibling`/`CharInfo` defined in Task 2, consumed unchanged in Tasks 3-6. `entryPath`/`searchPath`/`buildEntryId`/`relationLabel`/`LANG_LABELS`/`LANG_FLAGS` signatures match every call site. `getCached*` names identical between Task 3 definitions and Task 6 imports. Page signatures use `Promise`-wrapped params per Next 16.
- **Known non-blockers (for the final review to triage, not fixed here):** search still uses `ilike('headword', 'q%')` over ~231 rows — fine now, revisit when data scales. `getCrossLanguage`'s `.in('id', ...)` relies on supabase-js quoting ids that contain reserved chars; current ids only contain colons/spaces/CJK (safe). Stroke-order, multi-pinyin tabs, conjugation tables, sentence translation, character decomposition remain out of v1 per spec.
