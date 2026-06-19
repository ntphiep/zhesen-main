# Wordlist cá nhân — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây trang `/wordlist` cho người dùng lưu/sửa/xóa các từ đã học với thông tin từ vựng đầy đủ + phát âm (tự điền từ kho từ điển `lex`), và sửa các nguyên nhân gốc khiến UI chậm.

**Architecture:** Bảng `public.user_words` lưu wordlist theo người dùng (RLS theo `auth.uid()`), mỗi dòng là snapshot có sửa được + giữ `entry_id` trỏ về `lex`. Trang render danh sách ban đầu phía server (cookie client) rồi giao Client Component xử lý CRUD optimistic qua browser client. Tìm từ khi thêm gọi `lex` (đã expose Data API). Phần hiệu năng: tách client đọc nội dung công khai không-cookie + `unstable_cache`, gộp waterfall, bỏ `useEffect` thừa.

**Tech Stack:** Next.js 16.2.9 (App Router), React 19.2, `@supabase/ssr` + `@supabase/supabase-js`, Tailwind CSS 4, Zod 4, Vitest + Testing Library.

## Global Constraints

- KHÔNG phải Next.js trong dữ liệu huấn luyện. Trước khi đụng caching/async request API/route conventions PHẢI đọc guide trong `node_modules/next/dist/docs/`. Quyết định đã chốt: dùng `unstable_cache` từ `next/cache` (KHÔNG bật `cacheComponents`); KHÔNG gọi `cookies()` bên trong hàm được `unstable_cache` bọc.
- Shell là PowerShell 7. Chạy test: `npm run test` (vitest). Chạy lệnh nối bằng `;`, không dùng `&&`.
- App dùng đăng nhập ẩn danh (`proxy.ts`): mọi request là role `authenticated`, `auth.uid()` luôn có. Browser client (`lib/supabase/client.ts`) đã authenticated nên đọc `lex` được ngay (policy `authenticated` đã tồn tại).
- `anon` có GRANT SELECT trên `lex.*` và bảng nội dung public nhưng CHƯA có RLS policy cho `anon` (chỉ có cho `authenticated`); cần thêm policy `anon` để client không-cookie đọc được.
- TypeScript strict, không dùng `any`. TDD. Commit nhỏ. KHÔNG push origin khi chưa được yêu cầu.
- UI tiếng Việt, theo phong cách Tailwind tối giản hiện có (`mx-auto max-w-*`, `rounded-xl bg-black/5`, `text-black/60`). Không thêm thư viện UI mới.
- `LangCode = 'zh' | 'es' | 'en'` (định nghĩa sẵn ở `lib/content/types.ts`).
- Số liệu dữ liệu (live 2026-06-19): en 101 (nghĩa VI/IPA/ví dụ 100%, audio 53%, level 15%); es 100 (nghĩa VI 0%); zh 30 (nghĩa VI 0%). English đủ dữ liệu để demo mọi cột.

---

## Cấu trúc file

**Tạo mới:**
- `supabase/migrations/0006_user_words.sql` — bảng `user_words` + RLS + trigger + index + policy `anon` đọc dữ liệu công khai + index tìm kiếm `lex`.
- `lib/dictionary/types.ts` — kiểu dữ liệu từ điển (preview + detail).
- `lib/dictionary/search.ts` — `searchEntries`, `getEntryDetail` đọc `lex`.
- `lib/wordlist/types.ts` — kiểu `UserWord`, `WordDraft`, `WordStatus` + Zod row schema.
- `lib/wordlist/store.ts` — CRUD `user_words`.
- `lib/supabase/content.ts` — client đọc nội dung công khai KHÔNG cookie (anon key).
- `components/AudioButton.tsx` — phát file thật + TTS fallback.
- `components/wordlist/AddWordDialog.tsx` — tìm từ điển + thêm thủ công.
- `components/wordlist/EditWordDialog.tsx` — sửa từ.
- `components/wordlist/WordDetail.tsx` — chi tiết một từ (lazy `getEntryDetail`).
- `app/wordlist/page.tsx` — Server Component, lấy wordlist ban đầu.
- `app/wordlist/WordlistClient.tsx` — bảng/thẻ tương tác, CRUD optimistic.
- Các file test tương ứng dưới `test/` hoặc cạnh file (theo `vitest.config.ts`).

**Sửa:**
- `lib/content/SupabaseContentSource.ts` — chuyển đọc nội dung công khai sang client không-cookie + cache; gộp waterfall `getLessons`/`getLesson`; `getVocabByLang` thêm limit; `countDue` đếm phía DB (thực ra ở `SupabaseProgressStore`).
- `lib/progress/SupabaseProgressStore.ts` — `countDue` dùng count head.
- `app/page.tsx` — thêm liên kết "Danh sách từ".
- `app/learn/[lang]/page.tsx` + `LangDashboard.tsx` — bỏ `useEffect` đếm thẻ (truyền từ server) nếu gọn; nếu không thì tối ưu tại chỗ.

---

## Task 1: Migration `user_words` + RLS + policy anon + index

**Files:**
- Create: `supabase/migrations/0006_user_words.sql`

**Interfaces:**
- Produces: bảng `public.user_words` với cột (id, user_id, lang, entry_id, headword, reading, ipa, pos, meaning_vi, meaning_en, level, example, example_translation, audio_url, notes, status, tags, created_at, updated_at); RLS 4 policy own-row cho `authenticated`; policy `anon` SELECT trên `lex.{entries,senses,pronunciations,examples,lex_relations}` và `public.{languages,lessons,lesson_vocab,vocab_items}`; index `lex.entries (lang, headword_normalized)`.

- [ ] **Step 1: Viết file migration**

```sql
-- supabase/migrations/0006_user_words.sql

-- 1) Personal wordlist
create table if not exists public.user_words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lang text not null check (lang in ('en','es','zh')),
  entry_id text references lex.entries(id) on delete set null,
  headword text not null,
  reading text,
  ipa text,
  pos text,
  meaning_vi text,
  meaning_en text,
  level text,
  example text,
  example_translation text,
  audio_url text,
  notes text,
  status text not null default 'new' check (status in ('new','learning','known')),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_words_user_created_idx on public.user_words (user_id, created_at desc);
create index if not exists user_words_user_lang_idx on public.user_words (user_id, lang);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_words_set_updated_at on public.user_words;
create trigger user_words_set_updated_at
  before update on public.user_words
  for each row execute function public.set_updated_at();

-- RLS: own rows only
alter table public.user_words enable row level security;

create policy user_words_select_own on public.user_words
  for select to authenticated using (user_id = auth.uid());
create policy user_words_insert_own on public.user_words
  for insert to authenticated with check (user_id = auth.uid());
create policy user_words_update_own on public.user_words
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_words_delete_own on public.user_words
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.user_words to authenticated;

-- 2) anon SELECT policies for public dictionary/content (cookieless cached reads)
create policy lex_entries_select_anon        on lex.entries        for select to anon using (true);
create policy lex_senses_select_anon         on lex.senses         for select to anon using (true);
create policy lex_pronunciations_select_anon on lex.pronunciations for select to anon using (true);
create policy lex_examples_select_anon       on lex.examples       for select to anon using (true);
create policy lex_relations_select_anon      on lex.lex_relations  for select to anon using (true);

create policy content_read_languages_anon    on public.languages    for select to anon using (true);
create policy content_read_lessons_anon      on public.lessons      for select to anon using (true);
create policy content_read_lesson_vocab_anon on public.lesson_vocab for select to anon using (true);
create policy content_read_vocab_anon        on public.vocab_items  for select to anon using (true);

-- 3) search index for dictionary "add word"
create index if not exists lex_entries_lang_headword_idx on lex.entries (lang, headword_normalized);
```

- [ ] **Step 2: Áp dụng migration**

Dùng tool MCP `mcp__plugin_supabase_supabase__apply_migration` với `project_id=cvltsyoweddhpkomuevz`, `name="user_words"`, `query=` nội dung file. (Đây là thay đổi cộng thêm, không phá hủy.)

- [ ] **Step 3: Xác minh**

Chạy `mcp__plugin_supabase_supabase__execute_sql`:
```sql
select count(*) from public.user_words;
select policyname, roles::text, cmd from pg_policies where schemaname='public' and tablename='user_words' order by policyname;
select count(*) as anon_policies from pg_policies where (schemaname='lex' or schemaname='public') and policyname like '%\_anon' escape '\';
```
Expected: `user_words` = 0 hàng; 4 policy own-row; `anon_policies` = 9.

- [ ] **Step 4: Commit**

```
git add supabase/migrations/0006_user_words.sql
git commit -m "feat(db): user_words table + RLS + anon read policies for dictionary"
```

---

## Task 2: Tầng đọc từ điển `lib/dictionary`

**Files:**
- Create: `lib/dictionary/types.ts`, `lib/dictionary/search.ts`
- Test: `test/dictionary.test.ts`

**Interfaces:**
- Consumes: một `SupabaseClient` (kiểu `import('@supabase/supabase-js').SupabaseClient`) truyền vào, để test mock được. `LangCode` từ `@/lib/content/types`.
- Produces:
  - `searchEntries(supabase, lang: LangCode, query: string, limit = 20): Promise<DictEntryPreview[]>`
  - `getEntryDetail(supabase, entryId: string): Promise<DictEntryDetail | null>`
  - `pickIpa(prons: {accent:string; ipa:string|null}[], lang: LangCode): string | null` (ưu tiên en-US, rồi en-UK, rồi bản đầu có ipa)
  - `pickPrimarySense(senses: DictSense[]): DictSense | null` (sense_order nhỏ nhất)
  - kiểu `DictEntryPreview`, `DictEntryDetail`, `DictSense`, `DictPron`, `DictExample`, `DictRelation`.

- [ ] **Step 1: Viết types**

```ts
// lib/dictionary/types.ts
import type { LangCode } from '@/lib/content/types'

export interface DictSense {
  pos: string | null
  glossVi: string | null
  glossEn: string | null
  senseOrder: number
}
export interface DictPron {
  accent: string
  ipa: string | null
  audioUrl: string | null
}
export interface DictExample {
  text: string
  reading: string | null
  translationVi: string | null
  translationEn: string | null
}
export interface DictRelation {
  relationType: string
  relatedText: string | null
  relatedEntryId: string | null
}
export interface DictEntryPreview {
  id: string
  lang: LangCode
  headword: string
  traditional: string | null
  level: string | null
  ipa: string | null
  pos: string | null
  glossVi: string | null
  glossEn: string | null
  audioUrl: string | null
}
export interface DictEntryDetail extends DictEntryPreview {
  senses: DictSense[]
  pronunciations: DictPron[]
  examples: DictExample[]
  relations: DictRelation[]
  attributes: Record<string, unknown>
}
```

- [ ] **Step 2: Viết test (FAIL)**

```ts
// test/dictionary.test.ts
import { describe, it, expect, vi } from 'vitest'
import { pickIpa, pickPrimarySense, searchEntries, getEntryDetail } from '@/lib/dictionary/search'

describe('pickIpa', () => {
  it('prefers en-US, then en-UK', () => {
    expect(pickIpa([{ accent: 'en-UK', ipa: '/uk/' }, { accent: 'en-US', ipa: '/us/' }], 'en')).toBe('/us/')
    expect(pickIpa([{ accent: 'en-UK', ipa: '/uk/' }], 'en')).toBe('/uk/')
    expect(pickIpa([{ accent: 'zh-pinyin', ipa: 'nǐ' }], 'zh')).toBe('nǐ')
    expect(pickIpa([], 'en')).toBeNull()
  })
})

describe('pickPrimarySense', () => {
  it('returns the lowest sense_order', () => {
    const s = pickPrimarySense([
      { pos: 'noun', glossVi: 'b', glossEn: null, senseOrder: 2 },
      { pos: 'verb', glossVi: 'a', glossEn: null, senseOrder: 1 },
    ])
    expect(s?.glossVi).toBe('a')
    expect(pickPrimarySense([])).toBeNull()
  })
})

// Mock supabase query builder
function mockClient(returnData: unknown) {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  Object.assign(builder, {
    select: vi.fn(chain),
    eq: vi.fn(chain),
    ilike: vi.fn(chain),
    order: vi.fn(chain),
    limit: vi.fn(() => Promise.resolve({ data: returnData, error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: returnData, error: null })),
  })
  return {
    schema: vi.fn(() => ({ from: vi.fn(() => builder) })),
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

describe('searchEntries', () => {
  it('maps rows to previews with chosen ipa and primary sense', async () => {
    const client = mockClient([
      {
        id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1', attributes: {},
        senses: [{ pos: 'noun', gloss_vi: 'con chó', gloss_en: 'dog', sense_order: 1 }],
        pronunciations: [{ accent: 'en-US', ipa: '/dɔːɡ/', audio_url: 'x.ogg' }],
      },
    ])
    const res = await searchEntries(client, 'en', 'dog')
    expect(res[0]).toMatchObject({ id: 'en:dog', headword: 'dog', ipa: '/dɔːɡ/', glossVi: 'con chó', pos: 'noun', audioUrl: 'x.ogg', level: 'A1' })
  })
})

describe('getEntryDetail', () => {
  it('returns null when not found', async () => {
    const client = mockClient(null)
    expect(await getEntryDetail(client, 'en:nope')).toBeNull()
  })
})
```

Run: `npm run test -- dictionary` — Expected: FAIL (module not found).

- [ ] **Step 3: Viết implementation**

```ts
// lib/dictionary/search.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LangCode } from '@/lib/content/types'
import type {
  DictEntryPreview, DictEntryDetail, DictSense, DictPron, DictExample, DictRelation,
} from './types'

export function pickIpa(prons: { accent: string; ipa: string | null }[], lang: LangCode): string | null {
  if (prons.length === 0) return null
  const byAccent = (needle: string) => prons.find((p) => p.accent.toLowerCase().includes(needle) && p.ipa)?.ipa ?? null
  if (lang === 'en') return byAccent('us') ?? byAccent('uk') ?? prons.find((p) => p.ipa)?.ipa ?? null
  return prons.find((p) => p.ipa)?.ipa ?? null
}

export function pickPrimarySense(senses: DictSense[]): DictSense | null {
  if (senses.length === 0) return null
  return [...senses].sort((a, b) => a.senseOrder - b.senseOrder)[0]
}

interface SenseRow { pos: string | null; gloss_vi: string | null; gloss_en: string | null; sense_order: number }
interface PronRow { accent: string; ipa: string | null; audio_url: string | null }

function toSenses(rows: SenseRow[] | null): DictSense[] {
  return (rows ?? []).map((r) => ({ pos: r.pos, glossVi: r.gloss_vi, glossEn: r.gloss_en, senseOrder: r.sense_order }))
}
function toProns(rows: PronRow[] | null): DictPron[] {
  return (rows ?? []).map((r) => ({ accent: r.accent, ipa: r.ipa, audioUrl: r.audio_url }))
}

interface EntryPreviewRow {
  id: string; lang: LangCode; headword: string; traditional: string | null; level: string | null
  attributes: Record<string, unknown> | null
  senses: SenseRow[] | null
  pronunciations: PronRow[] | null
}

function toPreview(r: EntryPreviewRow): DictEntryPreview {
  const senses = toSenses(r.senses)
  const prons = toProns(r.pronunciations)
  const primary = pickPrimarySense(senses)
  return {
    id: r.id, lang: r.lang, headword: r.headword, traditional: r.traditional, level: r.level,
    ipa: pickIpa(prons, r.lang),
    pos: primary?.pos ?? null,
    glossVi: primary?.glossVi ?? null,
    glossEn: primary?.glossEn ?? null,
    audioUrl: prons.find((p) => p.audioUrl)?.audioUrl ?? null,
  }
}

export async function searchEntries(
  supabase: SupabaseClient, lang: LangCode, query: string, limit = 20,
): Promise<DictEntryPreview[]> {
  const q = query.trim()
  if (!q) return []
  const { data, error } = await supabase
    .schema('lex')
    .from('entries')
    .select('id, lang, headword, traditional, level, attributes, senses(pos, gloss_vi, gloss_en, sense_order), pronunciations(accent, ipa, audio_url)')
    .eq('lang', lang)
    .ilike('headword', `${q}%`)
    .order('frequency_rank', { ascending: true, nullsFirst: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as unknown as EntryPreviewRow[]).map(toPreview)
}

interface ExampleRow { text: string; reading: string | null; translation_vi: string | null; translation_en: string | null }
interface RelationRow { relation_type: string; related_text: string | null; related_entry_id: string | null }
interface EntryDetailRow extends EntryPreviewRow {
  examples: ExampleRow[] | null
  lex_relations: RelationRow[] | null
}

export async function getEntryDetail(supabase: SupabaseClient, entryId: string): Promise<DictEntryDetail | null> {
  const { data, error } = await supabase
    .schema('lex')
    .from('entries')
    .select('id, lang, headword, traditional, level, attributes, senses(pos, gloss_vi, gloss_en, sense_order), pronunciations(accent, ipa, audio_url), examples!examples_entry_id_fkey(text, reading, translation_vi, translation_en), lex_relations!lex_relations_entry_id_fkey(relation_type, related_text, related_entry_id)')
    .eq('id', entryId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const r = data as unknown as EntryDetailRow
  const preview = toPreview(r)
  const examples: DictExample[] = (r.examples ?? []).map((e) => ({
    text: e.text, reading: e.reading, translationVi: e.translation_vi, translationEn: e.translation_en,
  }))
  const relations: DictRelation[] = (r.lex_relations ?? []).map((x) => ({
    relationType: x.relation_type, relatedText: x.related_text, relatedEntryId: x.related_entry_id,
  }))
  return {
    ...preview,
    senses: toSenses(r.senses),
    pronunciations: toProns(r.pronunciations),
    examples, relations,
    attributes: r.attributes ?? {},
  }
}
```

- [ ] **Step 4: Run test** — `npm run test -- dictionary` — Expected: PASS.

- [ ] **Step 5: Commit**

```
git add lib/dictionary test/dictionary.test.ts
git commit -m "feat(dictionary): lex search + entry detail access layer"
```

---

## Task 3: Wordlist store `lib/wordlist`

**Files:**
- Create: `lib/wordlist/types.ts`, `lib/wordlist/store.ts`
- Test: `test/wordlist-store.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient`. `LangCode`. `DictEntryPreview` từ `@/lib/dictionary/types`.
- Produces:
  - kiểu `UserWord`, `WordStatus = 'new'|'learning'|'known'`, `WordDraft` (các trường có thể nhập/sửa).
  - `parseUserWordRow(row: unknown): UserWord` (snake→camel, Zod-validated).
  - `draftFromDictEntry(e: DictEntryPreview): WordDraft` (ánh xạ preview → draft điền sẵn).
  - `listWords(supabase): Promise<UserWord[]>` (order created_at desc)
  - `addWord(supabase, draft: WordDraft): Promise<UserWord>`
  - `updateWord(supabase, id: string, patch: Partial<WordDraft>): Promise<UserWord>`
  - `deleteWord(supabase, id: string): Promise<void>`
  - `deleteWords(supabase, ids: string[]): Promise<void>`

- [ ] **Step 1: Viết types**

```ts
// lib/wordlist/types.ts
import { z } from 'zod'
import type { LangCode } from '@/lib/content/types'

export type WordStatus = 'new' | 'learning' | 'known'

export interface UserWord {
  id: string
  lang: LangCode
  entryId: string | null
  headword: string
  reading: string | null
  ipa: string | null
  pos: string | null
  meaningVi: string | null
  meaningEn: string | null
  level: string | null
  example: string | null
  exampleTranslation: string | null
  audioUrl: string | null
  notes: string | null
  status: WordStatus
  tags: string[]
  createdAt: string
  updatedAt: string
}

// Trường người dùng tạo/sửa (không gồm id/timestamps/user_id)
export interface WordDraft {
  lang: LangCode
  entryId: string | null
  headword: string
  reading: string | null
  ipa: string | null
  pos: string | null
  meaningVi: string | null
  meaningEn: string | null
  level: string | null
  example: string | null
  exampleTranslation: string | null
  audioUrl: string | null
  notes: string | null
  status: WordStatus
  tags: string[]
}

export const userWordRow = z.object({
  id: z.string().uuid(),
  lang: z.enum(['zh', 'es', 'en']),
  entry_id: z.string().nullable(),
  headword: z.string().min(1),
  reading: z.string().nullable(),
  ipa: z.string().nullable(),
  pos: z.string().nullable(),
  meaning_vi: z.string().nullable(),
  meaning_en: z.string().nullable(),
  level: z.string().nullable(),
  example: z.string().nullable(),
  example_translation: z.string().nullable(),
  audio_url: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.enum(['new', 'learning', 'known']),
  tags: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
})
```

- [ ] **Step 2: Viết test (FAIL)**

```ts
// test/wordlist-store.test.ts
import { describe, it, expect, vi } from 'vitest'
import { parseUserWordRow, draftFromDictEntry, addWord, listWords } from '@/lib/wordlist/store'
import type { DictEntryPreview } from '@/lib/dictionary/types'

const row = {
  id: '11111111-1111-1111-1111-111111111111', lang: 'en', entry_id: 'en:dog', headword: 'dog',
  reading: null, ipa: '/dɔːɡ/', pos: 'noun', meaning_vi: 'con chó', meaning_en: 'dog', level: 'A1',
  example: 'The dog barked.', example_translation: 'Con chó sủa.', audio_url: 'x.ogg', notes: null,
  status: 'new', tags: [], created_at: '2026-06-19T00:00:00Z', updated_at: '2026-06-19T00:00:00Z',
}

describe('parseUserWordRow', () => {
  it('maps snake_case row to camelCase UserWord', () => {
    const w = parseUserWordRow(row)
    expect(w).toMatchObject({ id: row.id, entryId: 'en:dog', meaningVi: 'con chó', exampleTranslation: 'Con chó sủa.', audioUrl: 'x.ogg', status: 'new' })
  })
})

describe('draftFromDictEntry', () => {
  it('prefills a draft from a dictionary preview', () => {
    const e: DictEntryPreview = {
      id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1',
      ipa: '/dɔːɡ/', pos: 'noun', glossVi: 'con chó', glossEn: 'dog', audioUrl: 'x.ogg',
    }
    const d = draftFromDictEntry(e)
    expect(d).toMatchObject({ entryId: 'en:dog', headword: 'dog', meaningVi: 'con chó', meaningEn: 'dog', ipa: '/dɔːɡ/', status: 'new', tags: [] })
  })
})

function mockInsert(returned: unknown) {
  const single = vi.fn(() => Promise.resolve({ data: returned, error: null }))
  const select = vi.fn(() => ({ single }))
  const insert = vi.fn(() => ({ select }))
  const order = vi.fn(() => Promise.resolve({ data: [returned], error: null }))
  const selectList = vi.fn(() => ({ order }))
  const from = vi.fn(() => ({ insert, select: selectList }))
  return { client: { from } as unknown as import('@supabase/supabase-js').SupabaseClient, insert }
}

describe('addWord', () => {
  it('inserts a draft and returns the parsed word', async () => {
    const { client, insert } = mockInsert(row)
    const w = await addWord(client, draftFromDictEntry({
      id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1',
      ipa: '/dɔːɡ/', pos: 'noun', glossVi: 'con chó', glossEn: 'dog', audioUrl: 'x.ogg',
    }))
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ entry_id: 'en:dog', meaning_vi: 'con chó' }))
    expect(w.headword).toBe('dog')
  })
})

describe('listWords', () => {
  it('returns parsed rows', async () => {
    const { client } = mockInsert(row)
    const res = await listWords(client)
    expect(res[0].headword).toBe('dog')
  })
})
```

Run: `npm run test -- wordlist-store` — Expected: FAIL.

- [ ] **Step 3: Viết implementation**

```ts
// lib/wordlist/store.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import { userWordRow, type UserWord, type WordDraft } from './types'

export * from './types'

export function parseUserWordRow(r: unknown): UserWord {
  const x = userWordRow.parse(r)
  return {
    id: x.id, lang: x.lang, entryId: x.entry_id, headword: x.headword, reading: x.reading,
    ipa: x.ipa, pos: x.pos, meaningVi: x.meaning_vi, meaningEn: x.meaning_en, level: x.level,
    example: x.example, exampleTranslation: x.example_translation, audioUrl: x.audio_url,
    notes: x.notes, status: x.status, tags: x.tags, createdAt: x.created_at, updatedAt: x.updated_at,
  }
}

export function draftFromDictEntry(e: DictEntryPreview): WordDraft {
  return {
    lang: e.lang, entryId: e.id, headword: e.headword, reading: null, ipa: e.ipa, pos: e.pos,
    meaningVi: e.glossVi, meaningEn: e.glossEn, level: e.level, example: null, exampleTranslation: null,
    audioUrl: e.audioUrl, notes: null, status: 'new', tags: [],
  }
}

function draftToRow(d: WordDraft): Record<string, unknown> {
  return {
    lang: d.lang, entry_id: d.entryId, headword: d.headword, reading: d.reading, ipa: d.ipa, pos: d.pos,
    meaning_vi: d.meaningVi, meaning_en: d.meaningEn, level: d.level, example: d.example,
    example_translation: d.exampleTranslation, audio_url: d.audioUrl, notes: d.notes, status: d.status, tags: d.tags,
  }
}

function patchToRow(p: Partial<WordDraft>): Record<string, unknown> {
  const map: Record<keyof WordDraft, string> = {
    lang: 'lang', entryId: 'entry_id', headword: 'headword', reading: 'reading', ipa: 'ipa', pos: 'pos',
    meaningVi: 'meaning_vi', meaningEn: 'meaning_en', level: 'level', example: 'example',
    exampleTranslation: 'example_translation', audioUrl: 'audio_url', notes: 'notes', status: 'status', tags: 'tags',
  }
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(p) as (keyof WordDraft)[]) out[map[k]] = p[k]
  return out
}

export async function listWords(supabase: SupabaseClient): Promise<UserWord[]> {
  const { data, error } = await supabase.from('user_words').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(parseUserWordRow)
}

export async function addWord(supabase: SupabaseClient, draft: WordDraft): Promise<UserWord> {
  const { data, error } = await supabase.from('user_words').insert(draftToRow(draft)).select().single()
  if (error) throw error
  return parseUserWordRow(data)
}

export async function updateWord(supabase: SupabaseClient, id: string, patch: Partial<WordDraft>): Promise<UserWord> {
  const { data, error } = await supabase.from('user_words').update(patchToRow(patch)).eq('id', id).select().single()
  if (error) throw error
  return parseUserWordRow(data)
}

export async function deleteWord(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('user_words').delete().eq('id', id)
  if (error) throw error
}

export async function deleteWords(supabase: SupabaseClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('user_words').delete().in('id', ids)
  if (error) throw error
}
```

- [ ] **Step 4: Run test** — `npm run test -- wordlist-store` — Expected: PASS.

- [ ] **Step 5: Commit**

```
git add lib/wordlist test/wordlist-store.test.ts
git commit -m "feat(wordlist): user_words store (CRUD + mapping)"
```

---

## Task 4: `AudioButton` (file thật + TTS fallback)

**Files:**
- Create: `components/AudioButton.tsx`
- Test: `test/audio-button.test.tsx`

**Interfaces:**
- Produces: `AudioButton({ text, lang, audioUrl }: { text: string; lang: LangCode; audioUrl?: string | null })` — client component. Hành vi: nếu có `audioUrl` thì `new Audio(audioUrl).play()`; nếu không có hoặc play lỗi thì `speechSynthesis.speak` với `lang` map `{ en:'en-US', es:'es-ES', zh:'zh-CN' }`. Export hàm thuần `speechLang(lang): string` để test.

- [ ] **Step 1: Viết test (FAIL)**

```tsx
// test/audio-button.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AudioButton, speechLang } from '@/components/AudioButton'

describe('speechLang', () => {
  it('maps lang codes to BCP-47', () => {
    expect(speechLang('en')).toBe('en-US')
    expect(speechLang('es')).toBe('es-ES')
    expect(speechLang('zh')).toBe('zh-CN')
  })
})

describe('AudioButton', () => {
  beforeEach(() => {
    vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel: vi.fn() })
    vi.stubGlobal('SpeechSynthesisUtterance', vi.fn(function (this: Record<string, unknown>, t: string) { this.text = t }))
  })

  it('plays the audio file when audioUrl is present', async () => {
    const play = vi.fn(() => Promise.resolve())
    vi.stubGlobal('Audio', vi.fn(() => ({ play })))
    render(<AudioButton text="dog" lang="en" audioUrl="x.ogg" />)
    await userEvent.click(screen.getByRole('button'))
    expect(play).toHaveBeenCalled()
  })

  it('uses speech synthesis when no audioUrl', async () => {
    render(<AudioButton text="dog" lang="en" audioUrl={null} />)
    await userEvent.click(screen.getByRole('button'))
    expect(speechSynthesis.speak).toHaveBeenCalled()
  })
})
```

Run: `npm run test -- audio-button` — Expected: FAIL.

- [ ] **Step 2: Viết implementation**

```tsx
// components/AudioButton.tsx
'use client'
import { useState } from 'react'
import type { LangCode } from '@/lib/content/types'

export function speechLang(lang: LangCode): string {
  return { en: 'en-US', es: 'es-ES', zh: 'zh-CN' }[lang]
}

function speak(text: string, lang: LangCode) {
  if (typeof speechSynthesis === 'undefined') return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = speechLang(lang)
  speechSynthesis.speak(u)
}

export function AudioButton({ text, lang, audioUrl }: { text: string; lang: LangCode; audioUrl?: string | null }) {
  const [playing, setPlaying] = useState(false)
  async function onClick() {
    setPlaying(true)
    try {
      if (audioUrl) {
        await new Audio(audioUrl).play()
      } else {
        speak(text, lang)
      }
    } catch {
      speak(text, lang)
    } finally {
      setPlaying(false)
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Phát âm ${text}`}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/10 ${playing ? 'opacity-50' : ''}`}
    >
      🔊
    </button>
  )
}
```

- [ ] **Step 3: Run test** — `npm run test -- audio-button` — Expected: PASS.

- [ ] **Step 4: Commit**

```
git add components/AudioButton.tsx test/audio-button.test.tsx
git commit -m "feat(wordlist): AudioButton with real-audio + TTS fallback"
```

---

## Task 5: `AddWordDialog` (tìm từ điển + thêm thủ công)

**Files:**
- Create: `components/wordlist/AddWordDialog.tsx`
- Test: `test/add-word-dialog.test.tsx`

**Interfaces:**
- Consumes: `searchEntries`, `draftFromDictEntry`, browser `createClient` từ `@/lib/supabase/client`, `LangCode`.
- Produces: `AddWordDialog({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (draft: WordDraft) => void | Promise<void> })`. Hai tab: "Từ điển" (chọn ngôn ngữ + ô tìm debounce 250ms gọi `searchEntries`, hiện danh sách kết quả với nghĩa + IPA, mỗi item có nút "Thêm" gọi `onAdd(draftFromDictEntry(e))`) và "Thủ công" (form nhập headword/lang/meaningVi/ipa/pos/example..., submit gọi `onAdd` với draft tự dựng, headword bắt buộc).

**Implementation notes (structure; match existing Tailwind style):**
- Dùng `<dialog>` gốc, mở/đóng theo prop `open` qua `useEffect` (`ref.current.showModal()/close()`).
- Debounce bằng `useEffect` + `setTimeout` trên state `query`.
- `const supabase = useMemo(() => createClient(), [])`.
- Khi `onAdd` xong, không tự đóng (controller wordlist quyết định) — nhưng reset ô tìm.

- [ ] **Step 1: Viết test (FAIL)**

```tsx
// test/add-word-dialog.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddWordDialog } from '@/components/wordlist/AddWordDialog'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/dictionary/search', () => ({
  searchEntries: vi.fn(async () => ([{ id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1', ipa: '/dɔːɡ/', pos: 'noun', glossVi: 'con chó', glossEn: 'dog', audioUrl: null }])),
}))

beforeEach(() => { HTMLDialogElement.prototype.showModal = vi.fn(); HTMLDialogElement.prototype.close = vi.fn() })

describe('AddWordDialog', () => {
  it('searches and adds a dictionary entry', async () => {
    const onAdd = vi.fn()
    render(<AddWordDialog open onClose={() => {}} onAdd={onAdd} />)
    await userEvent.type(screen.getByPlaceholderText(/Tìm từ/i), 'dog')
    expect(await screen.findByText('con chó')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Thêm/i }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ headword: 'dog', meaningVi: 'con chó', entryId: 'en:dog' }))
  })

  it('manual tab requires a headword', async () => {
    const onAdd = vi.fn()
    render(<AddWordDialog open onClose={() => {}} onAdd={onAdd} />)
    await userEvent.click(screen.getByRole('tab', { name: /Thủ công/i }))
    await userEvent.click(screen.getByRole('button', { name: /Lưu từ/i }))
    expect(onAdd).not.toHaveBeenCalled()
  })
})
```

Run: `npm run test -- add-word-dialog` — Expected: FAIL.

- [ ] **Step 2: Viết implementation** (đầy đủ component theo interface + notes ở trên; dùng `searchEntries`/`draftFromDictEntry`, tab "Từ điển"/"Thủ công", `<dialog>` gốc, debounce 250ms, nhãn tiếng Việt: ô tìm `placeholder="Tìm từ..."`, nút mỗi kết quả "Thêm", tab "Thủ công" với input bắt buộc headword và nút "Lưu từ"). Mọi nhãn role/text phải khớp test (`tab` "Thủ công", button "Thêm"/"Lưu từ").

- [ ] **Step 3: Run test** — `npm run test -- add-word-dialog` — Expected: PASS.

- [ ] **Step 4: Commit**

```
git add components/wordlist/AddWordDialog.tsx test/add-word-dialog.test.tsx
git commit -m "feat(wordlist): AddWordDialog (dictionary search + manual add)"
```

---

## Task 6: `EditWordDialog`

**Files:**
- Create: `components/wordlist/EditWordDialog.tsx`
- Test: `test/edit-word-dialog.test.tsx`

**Interfaces:**
- Produces: `EditWordDialog({ word, open, onClose, onSave }: { word: UserWord | null; open: boolean; onClose: () => void; onSave: (id: string, patch: Partial<WordDraft>) => void | Promise<void> })`. Form điền sẵn từ `word`, sửa được: meaningVi, meaningEn, pos, ipa, level, example, exampleTranslation, notes, status (select new/learning/known), tags (nhập phân tách dấu phẩy). Submit gọi `onSave(word.id, patch)` chỉ với các trường đổi; nút "Hủy" gọi `onClose`.

- [ ] **Step 1: Viết test (FAIL)**

```tsx
// test/edit-word-dialog.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditWordDialog } from '@/components/wordlist/EditWordDialog'
import type { UserWord } from '@/lib/wordlist/types'

const word: UserWord = {
  id: 'id1', lang: 'en', entryId: 'en:dog', headword: 'dog', reading: null, ipa: '/dɔːɡ/', pos: 'noun',
  meaningVi: 'con chó', meaningEn: 'dog', level: 'A1', example: null, exampleTranslation: null,
  audioUrl: null, notes: null, status: 'new', tags: [], createdAt: 'x', updatedAt: 'x',
}
beforeEach(() => { HTMLDialogElement.prototype.showModal = vi.fn(); HTMLDialogElement.prototype.close = vi.fn() })

describe('EditWordDialog', () => {
  it('saves edited meaning and status', async () => {
    const onSave = vi.fn()
    render(<EditWordDialog word={word} open onClose={() => {}} onSave={onSave} />)
    const meaning = screen.getByLabelText(/Nghĩa/i)
    await userEvent.clear(meaning)
    await userEvent.type(meaning, 'chó nhà')
    await userEvent.selectOptions(screen.getByLabelText(/Trạng thái/i), 'learning')
    await userEvent.click(screen.getByRole('button', { name: /Lưu/i }))
    expect(onSave).toHaveBeenCalledWith('id1', expect.objectContaining({ meaningVi: 'chó nhà', status: 'learning' }))
  })
})
```

Run: `npm run test -- edit-word-dialog` — Expected: FAIL.

- [ ] **Step 2: Viết implementation** (form điền sẵn, label đúng test: "Nghĩa", "Trạng thái", nút "Lưu"; build `patch` chỉ chứa trường khác giá trị gốc; `<dialog>` gốc; tags parse từ chuỗi phân tách dấu phẩy thành `string[]`).

- [ ] **Step 3: Run test** — `npm run test -- edit-word-dialog` — Expected: PASS.

- [ ] **Step 4: Commit**

```
git add components/wordlist/EditWordDialog.tsx test/edit-word-dialog.test.tsx
git commit -m "feat(wordlist): EditWordDialog"
```

---

## Task 7: `WordDetail` (chi tiết lazy)

**Files:**
- Create: `components/wordlist/WordDetail.tsx`
- Test: `test/word-detail.test.tsx`

**Interfaces:**
- Consumes: `getEntryDetail`, browser `createClient`.
- Produces: `WordDetail({ word }: { word: UserWord })`. Nếu `word.entryId` có: lazy gọi `getEntryDetail` (useEffect 1 lần, cache trong state), hiện tất cả senses (pos + glossVi/glossEn), tất cả pronunciations (accent + ipa + `AudioButton`), examples (text + translationVi), relations (related_text nhóm theo relation_type). Nếu không có `entryId`: hiện các trường người dùng (meaningVi, example, notes). Hiện trạng thái "Đang tải..." khi fetch.

- [ ] **Step 1: Viết test (FAIL)**

```tsx
// test/word-detail.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WordDetail } from '@/components/wordlist/WordDetail'
import type { UserWord } from '@/lib/wordlist/types'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/dictionary/search', () => ({
  getEntryDetail: vi.fn(async () => ({
    id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1', ipa: '/dɔːɡ/', pos: 'noun',
    glossVi: 'con chó', glossEn: 'dog', audioUrl: null,
    senses: [{ pos: 'noun', glossVi: 'con chó', glossEn: 'dog', senseOrder: 1 }],
    pronunciations: [{ accent: 'en-US', ipa: '/dɔːɡ/', audioUrl: null }],
    examples: [{ text: 'The dog barked.', reading: null, translationVi: 'Con chó sủa.', translationEn: null }],
    relations: [{ relationType: 'synonym', relatedText: 'hound', relatedEntryId: null }],
    attributes: {},
  })),
}))

const base: UserWord = {
  id: 'id1', lang: 'en', entryId: 'en:dog', headword: 'dog', reading: null, ipa: null, pos: null,
  meaningVi: null, meaningEn: null, level: null, example: null, exampleTranslation: null,
  audioUrl: null, notes: null, status: 'new', tags: [], createdAt: 'x', updatedAt: 'x',
}

describe('WordDetail', () => {
  it('loads and shows dictionary detail when entryId present', async () => {
    render(<WordDetail word={base} />)
    expect(await screen.findByText('Con chó sủa.')).toBeInTheDocument()
    expect(screen.getByText('hound')).toBeInTheDocument()
  })

  it('shows user fields for a manual word', () => {
    render(<WordDetail word={{ ...base, entryId: null, meaningVi: 'tự nhập', notes: 'ghi chú' }} />)
    expect(screen.getByText('tự nhập')).toBeInTheDocument()
    expect(screen.getByText('ghi chú')).toBeInTheDocument()
  })
})
```

Run: `npm run test -- word-detail` — Expected: FAIL.

- [ ] **Step 2: Viết implementation** (theo interface; lazy fetch với `useEffect`, state `detail`/`loading`; render senses/prons/examples/relations; manual fallback). Dùng `AudioButton` cho mỗi pronunciation.

- [ ] **Step 3: Run test** — `npm run test -- word-detail` — Expected: PASS.

- [ ] **Step 4: Commit**

```
git add components/wordlist/WordDetail.tsx test/word-detail.test.tsx
git commit -m "feat(wordlist): WordDetail lazy dictionary detail"
```

---

## Task 8: `WordlistClient` (bảng/thẻ + search/sort/filter + bulk + optimistic CRUD)

**Files:**
- Create: `app/wordlist/WordlistClient.tsx`
- Test: `test/wordlist-client.test.tsx`

**Interfaces:**
- Consumes: `UserWord`, `WordDraft`, store `addWord`/`updateWord`/`deleteWord`/`deleteWords`, browser `createClient`, `AddWordDialog`, `EditWordDialog`, `WordDetail`, `AudioButton`.
- Produces: `WordlistClient({ initialWords }: { initialWords: UserWord[] })`. Quản lý state `words` (khởi từ `initialWords`), thực hiện thêm/sửa/xóa optimistic (cập nhật state ngay rồi gọi store; rollback nếu lỗi). Có: thanh công cụ (nút "Thêm từ" mở AddWordDialog; ô "Tìm trong danh sách"; select lọc ngôn ngữ; select lọc trạng thái; toggle "Bảng"/"Thẻ" lưu localStorage key `wordlist_view`); bảng với checkbox chọn từng dòng + chọn tất cả + nút "Xóa đã chọn"; cột Từ/IPA/Từ loại/Nghĩa/Cấp độ/Ngữ cảnh/Ngày thêm/Audio/Thao tác(xem/sửa/xóa); nút sắp xếp theo Từ và Ngày thêm; mở rộng dòng hiện `WordDetail`.

**Implementation notes:**
- `const supabase = useMemo(() => createClient(), [])`.
- Optimistic add: tạo temp id (`crypto.randomUUID()`), chèn vào đầu list, gọi `addWord`, thay temp bằng kết quả thật; nếu lỗi gỡ temp + `alert`/thông báo.
- Optimistic delete: bỏ khỏi list, gọi store; nếu lỗi khôi phục.
- Lọc/sắp/tìm: dùng `useMemo` dẫn xuất `visible` từ `words` + state filter/sort/query (không gọi DB lại).
- Empty state: "Chưa có từ nào. Bấm Thêm từ để bắt đầu."

- [ ] **Step 1: Viết test (FAIL)**

```tsx
// test/wordlist-client.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WordlistClient } from '@/app/wordlist/WordlistClient'
import type { UserWord } from '@/lib/wordlist/types'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
const addWord = vi.fn(async (_c, d) => ({ ...mk('new-id'), ...{ headword: d.headword, meaningVi: d.meaningVi, entryId: d.entryId, lang: d.lang } }))
const deleteWord = vi.fn(async () => {})
const deleteWords = vi.fn(async () => {})
const updateWord = vi.fn(async (_c, id, p) => ({ ...mk(id), ...p }))
vi.mock('@/lib/wordlist/store', async (orig) => ({ ...(await orig()), addWord, deleteWord, deleteWords, updateWord }))

function mk(id: string, over: Partial<UserWord> = {}): UserWord {
  return { id, lang: 'en', entryId: 'en:dog', headword: 'dog', reading: null, ipa: '/dɔːɡ/', pos: 'noun',
    meaningVi: 'con chó', meaningEn: 'dog', level: 'A1', example: 'The dog barked.', exampleTranslation: 'Con chó sủa.',
    audioUrl: null, notes: null, status: 'new', tags: [], createdAt: '2026-06-19T00:00:00Z', updatedAt: 'x', ...over }
}
beforeEach(() => { HTMLDialogElement.prototype.showModal = vi.fn(); HTMLDialogElement.prototype.close = vi.fn(); vi.clearAllMocks() })

describe('WordlistClient', () => {
  it('renders rows with key columns', () => {
    render(<WordlistClient initialWords={[mk('a', { headword: 'forward', meaningVi: 'chuyển tiếp' })]} />)
    expect(screen.getByText('forward')).toBeInTheDocument()
    expect(screen.getByText('chuyển tiếp')).toBeInTheDocument()
  })

  it('filters by search query', async () => {
    render(<WordlistClient initialWords={[mk('a', { headword: 'forward' }), mk('b', { headword: 'recipient' })]} />)
    await userEvent.type(screen.getByPlaceholderText(/Tìm trong danh sách/i), 'forward')
    expect(screen.getByText('forward')).toBeInTheDocument()
    expect(screen.queryByText('recipient')).not.toBeInTheDocument()
  })

  it('deletes a word optimistically', async () => {
    render(<WordlistClient initialWords={[mk('a', { headword: 'forward' })]} />)
    await userEvent.click(screen.getByRole('button', { name: /Xóa từ forward/i }))
    // confirm dialog: assume window.confirm stubbed true
    expect(screen.queryByText('forward')).not.toBeInTheDocument()
    expect(deleteWord).toHaveBeenCalledWith(expect.anything(), 'a')
  })

  it('shows empty state', () => {
    render(<WordlistClient initialWords={[]} />)
    expect(screen.getByText(/Chưa có từ nào/i)).toBeInTheDocument()
  })
})
```

Note: trong test xóa, stub `window.confirm`: thêm `vi.stubGlobal('confirm', () => true)` ở `beforeEach`.

Run: `npm run test -- wordlist-client` — Expected: FAIL.

- [ ] **Step 2: Viết implementation** (component đầy đủ theo interface + notes; nút xóa mỗi dòng có `aria-label={`Xóa từ ${w.headword}`}`; ô tìm `placeholder="Tìm trong danh sách..."`; empty state text "Chưa có từ nào...").

- [ ] **Step 3: Run test** — `npm run test -- wordlist-client` — Expected: PASS.

- [ ] **Step 4: Commit**

```
git add app/wordlist/WordlistClient.tsx test/wordlist-client.test.tsx
git commit -m "feat(wordlist): WordlistClient (table/card, filters, optimistic CRUD)"
```

---

## Task 9: Trang `/wordlist` + liên kết điều hướng

**Files:**
- Create: `app/wordlist/page.tsx`
- Modify: `app/page.tsx` (thêm liên kết "Danh sách từ")

**Interfaces:**
- Consumes: `createClient` từ `@/lib/supabase/server` (cookie client, để đọc `user_words` của đúng người dùng), `listWords`, `WordlistClient`.
- Produces: route `/wordlist`.

- [ ] **Step 1: Viết `app/wordlist/page.tsx`**

```tsx
// app/wordlist/page.tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { listWords } from '@/lib/wordlist/store'
import { WordlistClient } from './WordlistClient'

export default async function WordlistPage() {
  const supabase = await createClient()
  const words = await listWords(supabase)
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/" className="text-sm text-black/50 hover:underline">← Trang chủ</Link>
      <h1 className="mt-3 text-3xl font-bold">Danh sách từ</h1>
      <p className="mt-1 text-sm text-black/60">Nơi lưu các từ bạn đã học. Lưu ý: danh sách gắn với phiên trình duyệt hiện tại.</p>
      <div className="mt-6">
        <WordlistClient initialWords={words} />
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Thêm liên kết ở `app/page.tsx`**

Thêm sau khối `<div className="mt-10 grid ...">...</div>` (trước thẻ đóng `</main>`):
```tsx
      <div className="mt-10">
        <Link href="/wordlist" className="inline-block rounded-lg bg-black px-4 py-2 text-white">
          Danh sách từ của tôi
        </Link>
      </div>
```
Thêm `import Link from 'next/link'` ở đầu `app/page.tsx`.

- [ ] **Step 3: Kiểm tra build/typecheck + smoke test**

Run: `npm run test` (toàn bộ) — Expected: PASS toàn bộ.
Run: `npx tsc --noEmit` — Expected: không lỗi type.

- [ ] **Step 4: Commit**

```
git add app/wordlist/page.tsx app/page.tsx
git commit -m "feat(wordlist): /wordlist route + home link"
```

---

## Task 10: Hiệu năng — client nội dung không-cookie + cache + bỏ waterfall

**Files:**
- Create: `lib/supabase/content.ts`
- Modify: `lib/content/SupabaseContentSource.ts`, `lib/progress/SupabaseProgressStore.ts`
- Test: cập nhật `test/` nào mock `@/lib/supabase/server` cho content reads (tìm và sửa).

**Interfaces:**
- Produces: `createContentClient(): SupabaseClient` (dùng `createClient` của `@supabase/supabase-js` với url + anon key, `{ auth: { persistSession: false } }`), KHÔNG đọc cookie.

- [ ] **Step 1: Viết `lib/supabase/content.ts`**

```ts
// lib/supabase/content.ts
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function createContentClient(): SupabaseClient {
  if (!client) {
    client = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
  }
  return client
}
```

- [ ] **Step 2: Sửa `SupabaseContentSource` đọc nội dung công khai qua content client + `unstable_cache`, gộp waterfall**

- `getLanguages`, `getLessons`, `getLesson`, `getVocab`, `getVocabByLang` dùng `createContentClient()` thay cho `await createClient()` (cookie). Bọc các hàm đọc tĩnh bằng `unstable_cache` (key gồm tên hàm + tham số, `revalidate: 3600`, `tags: ['content']`).
- `getLessons`/`getLesson`: gộp 2 query thành một query lồng nhau:
```ts
const { data, error } = await supabase
  .from('lessons')
  .select('id, lang, title, description, position, lesson_vocab(vocab_id, position)')
  .eq('lang', lang)
  .order('position')
```
Map `lesson_vocab` (sắp theo `position`) thành `vocabIds`. Bỏ hàm `lessonVocabIds` cũ.
- `getVocabByLang`: thêm `.limit(200)` (đủ cho pool đáp án, tránh kéo toàn bảng khi dữ liệu lớn). Ghi `log`/comment lý do giới hạn.

Lưu ý: KHÔNG bọc `unstable_cache` quanh đoạn gọi `cookies()` (content client không dùng cookie, nên an toàn). Giữ kiểu trả về như cũ (`Language[]`, `Lesson[]`, `VocabItem[]`).

- [ ] **Step 3: Sửa `SupabaseProgressStore.countDue` dùng count head**

```ts
async countDue(lang: LangCode, now: number): Promise<number> {
  const userId = await this.userId()
  const { count, error } = await this.supabase
    .from('srs_state')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('lang', lang)
    .lte('due', now)
  if (error) throw error
  return count ?? 0
}
```
(Xác minh tên cột `due`/`lang`/`user_id` trong `SupabaseProgressStore` hiện tại trước khi sửa; giữ đúng tên thật.)

- [ ] **Step 4: Cập nhật test liên quan + chạy toàn bộ**

Tìm test mock content reads (vd test cho `SupabaseContentSource`/lessons) và đổi mock từ `@/lib/supabase/server` sang `@/lib/supabase/content` cho phần content. Run: `npm run test` — Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```
git add lib/supabase/content.ts lib/content/SupabaseContentSource.ts lib/progress/SupabaseProgressStore.ts test
git commit -m "perf(content): cookieless cached reads, collapse lesson waterfall, count-head due"
```

---

## Task 11: Hiệu năng — bỏ client waterfall ở dashboard

**Files:**
- Modify: `app/learn/[lang]/page.tsx`, `app/learn/[lang]/LangDashboard.tsx`

**Interfaces:**
- Produces: `LangDashboard` nhận `due: number` qua prop thay vì tự `useEffect` fetch.

- [ ] **Step 1: Đọc `due` ở server, truyền prop**

Trong `app/learn/[lang]/page.tsx`: sau khi có `language`/`lessons`, gọi đếm thẻ đến hạn phía server. Vì `countDue` cần user (cookie), giữ ở server với progress store dùng cookie client:
```tsx
const due = await getProgressStore().countDue(code, Date.now())
return <LangDashboard language={language} lessons={lessons} due={due} />
```
(Lưu ý: `getProgressStore` hiện dùng browser client trong `lib/progress/index.ts`. Nếu nó là browser-only, tạo nhánh server tương đương dùng `@/lib/supabase/server`, hoặc nếu rủi ro/không gọn thì GIỮ `useEffect` nhưng đảm bảo `countDue` đã là count-head (Task 10) — ghi rõ lựa chọn trong report.)

- [ ] **Step 2: Sửa `LangDashboard`**

Bỏ `useEffect`/`useState` đếm thẻ; nhận `due: number` qua prop; hiển thị `due` trực tiếp; nếu `LangDashboard` không còn dùng hook nào khác có thể bỏ `'use client'` (chỉ bỏ nếu không còn `onClick`/hook). Giữ link "Ôn tập".

- [ ] **Step 3: Chạy test + typecheck**

Run: `npm run test` ; `npx tsc --noEmit` — Expected: PASS, không lỗi type.

- [ ] **Step 4: Commit**

```
git add app/learn/[lang]/page.tsx app/learn/[lang]/LangDashboard.tsx
git commit -m "perf(dashboard): server-side due count, drop client waterfall"
```

---

## Self-review (đã thực hiện khi viết plan)

- **Spec coverage:** Bảng wordlist + cột (Task 8); thêm/sửa/xóa + bulk (Task 5,6,8); search/sort/filter (Task 8); xem chi tiết (Task 7); audio thật+TTS (Task 4); ghi chú/trạng thái/tag (Task 3,6,8); optimistic (Task 8); bảng/thẻ (Task 8); data model + RLS (Task 1); tích hợp lex (Task 2); route + nav (Task 9); hiệu năng (Task 10,11). Phase 2 (SRS/AI/export/multi-lang) cố ý ngoài phạm vi.
- **Type consistency:** `UserWord`/`WordDraft`/`DictEntryPreview`/`DictEntryDetail` dùng nhất quán xuyên các task; tên hàm store/dictionary khớp giữa định nghĩa (Task 2,3) và nơi dùng (Task 5–9).
- **Placeholder:** Các task UE lớn (5–8) mô tả interface + test đầy đủ + ghi chú cấu trúc; code logic (1–4,9–11) đầy đủ. Nhãn/role trong test khớp yêu cầu implementation.
- **Điểm cần implementer xác minh tại chỗ (đã ghi trong task):** tên cột `srs_state` (Task 10 step 3); `getProgressStore` có nhánh server không (Task 11 step 1).
