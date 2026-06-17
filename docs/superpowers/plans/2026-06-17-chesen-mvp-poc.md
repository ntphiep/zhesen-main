# Chesen MVP POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable language-learning POC (Next.js) for Chinese, Spanish, and English with chapter lessons (multiple-choice) and spaced-repetition flashcards, storing progress locally; Supabase wiring is a clearly-separated later phase.

**Architecture:** A single Next.js (App Router, TypeScript) app. All UI and learning logic talk to data only through two interfaces, `ContentSource` (content) and `ProgressStore` (progress + SRS), so the local backing in Phase 1 can be swapped for Supabase in Phase 2 without touching UI. Content is bundled JSON validated by zod; progress lives in `localStorage` behind a small key-value backend that is replaced with an in-memory backend in tests. The SRS scheduler is a pure function developed with TDD.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Vitest + @testing-library/react + jsdom, zod.

## Global Constraints

- Base/UI language is Vietnamese; learning languages are `zh`, `es`, `en`.
- Phase 1 must run end-to-end with NO external service (no Supabase, no network).
- UI and learning logic may import ONLY `ContentSource` / `ProgressStore` interfaces, never a concrete backend directly (except in the composition root / provider).
- TypeScript strict mode on. No `any` in committed code.
- Every logic/data task is TDD: failing test first, then minimal implementation.
- Commit after every task with a conventional-commit message.
- All user-visible copy is Vietnamese.

---

## File Structure

```
chesen/
  app/
    layout.tsx                          # root layout, providers
    page.tsx                            # home: language picker
    learn/[lang]/page.tsx               # dashboard: lessons + due count
    learn/[lang]/lesson/[lessonId]/page.tsx   # lesson: vocab intro + MCQ
    learn/[lang]/review/page.tsx        # flashcard SRS session
  components/
    LanguageCard.tsx
    LessonList.tsx
    Quiz.tsx
    Flashcard.tsx
  content/
    languages.json
    zh.json                             # { lessons: [...], vocab: [...] }
    es.json
    en.json
  lib/
    content/
      types.ts                          # domain types
      schema.ts                         # zod schemas + validateContent()
      ContentSource.ts                  # interface
      LocalContentSource.ts             # reads bundled JSON
      index.ts                          # singleton getContentSource()
    progress/
      types.ts                          # SrsState, Grade, CardRecord, LessonProgress
      srs.ts                            # pure SM-2-lite scheduler
      ProgressStore.ts                  # interface
      kv.ts                             # KVBackend + InMemory + LocalStorage backends
      LocalProgressStore.ts             # ProgressStore over a KVBackend
      index.ts                          # singleton getProgressStore() (client)
    quiz/
      buildQuiz.ts                      # pure MCQ builder
  test/setup.ts                         # vitest + RTL setup
  vitest.config.ts
  docs/superpowers/{specs,plans}/
```

---

### Task 1: Scaffold Next.js app + test harness

**Files:**
- Create: whole Next.js skeleton via `create-next-app`
- Create: `vitest.config.ts`, `test/setup.ts`
- Create: `lib/sanity.ts`, `test/sanity.test.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: nothing
- Produces: a booting app and a green `npm test`

- [ ] **Step 1: Scaffold the app**

Run (non-interactive flags so it doesn't prompt):
```bash
cd /c/Users/Hiep/Desktop/chesen
npx --yes create-next-app@latest . --ts --app --tailwind --eslint --src-dir=false --import-alias "@/*" --use-npm --no-turbopack
```
Expected: project files created in `chesen/` (the existing `docs/` folder is preserved). If create-next-app refuses because the directory is non-empty, scaffold in a temp dir and copy files over, keeping `docs/`.

- [ ] **Step 2: Install test dependencies**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event zod
```

- [ ] **Step 3: Add Vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': resolve(__dirname, '.') } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
  },
})
```

Create `test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 4: Add test scripts to package.json**

In `package.json` `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write a sanity test (failing)**

Create `lib/sanity.ts`:
```ts
// intentionally empty for now
```
Create `test/sanity.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { ping } from '@/lib/sanity'

describe('sanity', () => {
  it('pings', () => {
    expect(ping()).toBe('pong')
  })
})
```

- [ ] **Step 6: Run test, verify it fails**

Run: `npm test`
Expected: FAIL — `ping` is not exported / not a function.

- [ ] **Step 7: Implement minimal**

Replace `lib/sanity.ts`:
```ts
export function ping(): string {
  return 'pong'
}
```

- [ ] **Step 8: Run test + build, verify green**

Run: `npm test`
Expected: PASS.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Next.js app with vitest harness"
```

---

### Task 2: Content domain types + zod schema + seed data

**Files:**
- Create: `lib/content/types.ts`
- Create: `lib/content/schema.ts`
- Create: `content/languages.json`, `content/zh.json`, `content/es.json`, `content/en.json`
- Test: `test/content/schema.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - Types `LangCode = 'zh'|'es'|'en'`, `Script = 'han'|'latin'`, `Language`, `Example`, `VocabItem`, `Lesson`, `LanguageContent`
  - `validateLanguages(data: unknown): Language[]`
  - `validateLanguageContent(data: unknown): LanguageContent` where `LanguageContent = { lessons: Lesson[]; vocab: VocabItem[] }`

- [ ] **Step 1: Write the types**

Create `lib/content/types.ts`:
```ts
export type LangCode = 'zh' | 'es' | 'en'
export type Script = 'han' | 'latin'

export interface Language {
  code: LangCode
  name: string       // Vietnamese display name, e.g. "Tiếng Trung"
  nativeName: string // e.g. "中文"
  script: Script
}

export interface Example {
  sentence: string
  reading?: string
  translation: { vi: string }
}

export interface VocabItem {
  id: string
  lang: LangCode
  term: string
  reading?: string
  translation: { vi: string }
  partOfSpeech?: string
  level?: string
  examples?: Example[]
  audio?: string
}

export interface Lesson {
  id: string
  lang: LangCode
  title: string
  description: string
  position: number
  vocabIds: string[]
}

export interface LanguageContent {
  lessons: Lesson[]
  vocab: VocabItem[]
}
```

- [ ] **Step 2: Write failing schema test**

Create `test/content/schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { validateLanguages, validateLanguageContent } from '@/lib/content/schema'

const okLang = [{ code: 'zh', name: 'Tiếng Trung', nativeName: '中文', script: 'han' }]

const okContent = {
  lessons: [
    { id: 'zh-l1', lang: 'zh', title: 'Chào hỏi', description: '', position: 1, vocabIds: ['zh-1'] },
  ],
  vocab: [
    { id: 'zh-1', lang: 'zh', term: '你好', reading: 'nǐ hǎo', translation: { vi: 'xin chào' } },
  ],
}

describe('content schema', () => {
  it('accepts valid languages', () => {
    expect(validateLanguages(okLang)).toHaveLength(1)
  })
  it('accepts valid language content', () => {
    expect(validateLanguageContent(okContent).vocab[0].term).toBe('你好')
  })
  it('rejects an unknown lang code', () => {
    expect(() => validateLanguages([{ ...okLang[0], code: 'fr' }])).toThrow()
  })
  it('rejects vocab missing vi translation', () => {
    const bad = { ...okContent, vocab: [{ id: 'x', lang: 'zh', term: 'a', translation: {} }] }
    expect(() => validateLanguageContent(bad)).toThrow()
  })
})
```

- [ ] **Step 3: Run test, verify it fails**

Run: `npx vitest run test/content/schema.test.ts`
Expected: FAIL — module `@/lib/content/schema` not found.

- [ ] **Step 4: Implement the schema**

Create `lib/content/schema.ts`:
```ts
import { z } from 'zod'
import type { Language, LanguageContent } from './types'

const langCode = z.enum(['zh', 'es', 'en'])

const languageSchema = z.object({
  code: langCode,
  name: z.string().min(1),
  nativeName: z.string().min(1),
  script: z.enum(['han', 'latin']),
})

const translationSchema = z.object({ vi: z.string().min(1) })

const exampleSchema = z.object({
  sentence: z.string().min(1),
  reading: z.string().optional(),
  translation: translationSchema,
})

const vocabSchema = z.object({
  id: z.string().min(1),
  lang: langCode,
  term: z.string().min(1),
  reading: z.string().optional(),
  translation: translationSchema,
  partOfSpeech: z.string().optional(),
  level: z.string().optional(),
  examples: z.array(exampleSchema).optional(),
  audio: z.string().optional(),
})

const lessonSchema = z.object({
  id: z.string().min(1),
  lang: langCode,
  title: z.string().min(1),
  description: z.string(),
  position: z.number().int().nonnegative(),
  vocabIds: z.array(z.string().min(1)),
})

const contentSchema = z.object({
  lessons: z.array(lessonSchema),
  vocab: z.array(vocabSchema),
})

export function validateLanguages(data: unknown): Language[] {
  return z.array(languageSchema).parse(data)
}

export function validateLanguageContent(data: unknown): LanguageContent {
  return contentSchema.parse(data)
}
```

- [ ] **Step 5: Create seed JSON**

Create `content/languages.json`:
```json
[
  { "code": "zh", "name": "Tiếng Trung", "nativeName": "中文", "script": "han" },
  { "code": "es", "name": "Tiếng Tây Ban Nha", "nativeName": "Español", "script": "latin" },
  { "code": "en", "name": "Tiếng Anh", "nativeName": "English", "script": "latin" }
]
```

Create `content/zh.json` (small seed: 1 lesson, 5 vocab):
```json
{
  "lessons": [
    { "id": "zh-l1", "lang": "zh", "title": "Chào hỏi cơ bản", "description": "Những câu chào thông dụng.", "position": 1, "vocabIds": ["zh-1", "zh-2", "zh-3", "zh-4", "zh-5"] }
  ],
  "vocab": [
    { "id": "zh-1", "lang": "zh", "term": "你好", "reading": "nǐ hǎo", "translation": { "vi": "xin chào" }, "level": "HSK1" },
    { "id": "zh-2", "lang": "zh", "term": "谢谢", "reading": "xiè xie", "translation": { "vi": "cảm ơn" }, "level": "HSK1" },
    { "id": "zh-3", "lang": "zh", "term": "再见", "reading": "zài jiàn", "translation": { "vi": "tạm biệt" }, "level": "HSK1" },
    { "id": "zh-4", "lang": "zh", "term": "对不起", "reading": "duì bu qǐ", "translation": { "vi": "xin lỗi" }, "level": "HSK1" },
    { "id": "zh-5", "lang": "zh", "term": "请", "reading": "qǐng", "translation": { "vi": "làm ơn / mời" }, "level": "HSK1" }
  ]
}
```

Create `content/es.json`:
```json
{
  "lessons": [
    { "id": "es-l1", "lang": "es", "title": "Saludos básicos", "description": "Cách chào hỏi cơ bản.", "position": 1, "vocabIds": ["es-1", "es-2", "es-3", "es-4", "es-5"] }
  ],
  "vocab": [
    { "id": "es-1", "lang": "es", "term": "hola", "translation": { "vi": "xin chào" }, "level": "A1" },
    { "id": "es-2", "lang": "es", "term": "gracias", "translation": { "vi": "cảm ơn" }, "level": "A1" },
    { "id": "es-3", "lang": "es", "term": "adiós", "translation": { "vi": "tạm biệt" }, "level": "A1" },
    { "id": "es-4", "lang": "es", "term": "perdón", "translation": { "vi": "xin lỗi" }, "level": "A1" },
    { "id": "es-5", "lang": "es", "term": "por favor", "translation": { "vi": "làm ơn" }, "level": "A1" }
  ]
}
```

Create `content/en.json`:
```json
{
  "lessons": [
    { "id": "en-l1", "lang": "en", "title": "Basic greetings", "description": "Common greetings.", "position": 1, "vocabIds": ["en-1", "en-2", "en-3", "en-4", "en-5"] }
  ],
  "vocab": [
    { "id": "en-1", "lang": "en", "term": "hello", "translation": { "vi": "xin chào" }, "level": "A1" },
    { "id": "en-2", "lang": "en", "term": "thank you", "translation": { "vi": "cảm ơn" }, "level": "A1" },
    { "id": "en-3", "lang": "en", "term": "goodbye", "translation": { "vi": "tạm biệt" }, "level": "A1" },
    { "id": "en-4", "lang": "en", "term": "sorry", "translation": { "vi": "xin lỗi" }, "level": "A1" },
    { "id": "en-5", "lang": "en", "term": "please", "translation": { "vi": "làm ơn" }, "level": "A1" }
  ]
}
```

- [ ] **Step 6: Run test, verify it passes**

Run: `npx vitest run test/content/schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(content): add domain types, zod schema, and seed data"
```

---

### Task 3: ContentSource interface + LocalContentSource

**Files:**
- Create: `lib/content/ContentSource.ts`
- Create: `lib/content/LocalContentSource.ts`
- Create: `lib/content/index.ts`
- Test: `test/content/LocalContentSource.test.ts`

**Interfaces:**
- Consumes: `Language`, `Lesson`, `VocabItem`, `LangCode` (Task 2); `validateLanguages`, `validateLanguageContent` (Task 2)
- Produces:
```ts
interface ContentSource {
  getLanguages(): Promise<Language[]>
  getLessons(lang: LangCode): Promise<Lesson[]>
  getLesson(lessonId: string): Promise<Lesson | null>
  getVocab(ids: string[]): Promise<VocabItem[]>
  getVocabByLang(lang: LangCode): Promise<VocabItem[]>
}
```
  - `getContentSource(): ContentSource` (singleton)

- [ ] **Step 1: Write the interface**

Create `lib/content/ContentSource.ts`:
```ts
import type { Language, Lesson, VocabItem, LangCode } from './types'

export interface ContentSource {
  getLanguages(): Promise<Language[]>
  getLessons(lang: LangCode): Promise<Lesson[]>
  getLesson(lessonId: string): Promise<Lesson | null>
  getVocab(ids: string[]): Promise<VocabItem[]>
  getVocabByLang(lang: LangCode): Promise<VocabItem[]>
}
```

- [ ] **Step 2: Write failing test**

Create `test/content/LocalContentSource.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { LocalContentSource } from '@/lib/content/LocalContentSource'

const src = new LocalContentSource()

describe('LocalContentSource', () => {
  it('lists three languages', async () => {
    const langs = await src.getLanguages()
    expect(langs.map((l) => l.code).sort()).toEqual(['en', 'es', 'zh'])
  })
  it('returns lessons sorted by position for a language', async () => {
    const lessons = await src.getLessons('zh')
    expect(lessons.length).toBeGreaterThan(0)
    expect(lessons[0].lang).toBe('zh')
  })
  it('gets a lesson by id, null when missing', async () => {
    expect((await src.getLesson('zh-l1'))?.id).toBe('zh-l1')
    expect(await src.getLesson('nope')).toBeNull()
  })
  it('gets vocab by ids preserving requested order', async () => {
    const v = await src.getVocab(['zh-2', 'zh-1'])
    expect(v.map((x) => x.id)).toEqual(['zh-2', 'zh-1'])
  })
  it('gets all vocab for a language', async () => {
    const v = await src.getVocabByLang('es')
    expect(v.every((x) => x.lang === 'es')).toBe(true)
  })
})
```

- [ ] **Step 3: Run test, verify it fails**

Run: `npx vitest run test/content/LocalContentSource.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement LocalContentSource**

Create `lib/content/LocalContentSource.ts`:
```ts
import type { ContentSource } from './ContentSource'
import type { Language, Lesson, VocabItem, LangCode, LanguageContent } from './types'
import { validateLanguages, validateLanguageContent } from './schema'
import languagesJson from '@/content/languages.json'
import zhJson from '@/content/zh.json'
import esJson from '@/content/es.json'
import enJson from '@/content/en.json'

const languages: Language[] = validateLanguages(languagesJson)
const byLang: Record<LangCode, LanguageContent> = {
  zh: validateLanguageContent(zhJson),
  es: validateLanguageContent(esJson),
  en: validateLanguageContent(enJson),
}

const allVocab: VocabItem[] = Object.values(byLang).flatMap((c) => c.vocab)
const vocabById = new Map(allVocab.map((v) => [v.id, v]))
const allLessons: Lesson[] = Object.values(byLang).flatMap((c) => c.lessons)

export class LocalContentSource implements ContentSource {
  async getLanguages(): Promise<Language[]> {
    return languages
  }
  async getLessons(lang: LangCode): Promise<Lesson[]> {
    return allLessons.filter((l) => l.lang === lang).sort((a, b) => a.position - b.position)
  }
  async getLesson(lessonId: string): Promise<Lesson | null> {
    return allLessons.find((l) => l.id === lessonId) ?? null
  }
  async getVocab(ids: string[]): Promise<VocabItem[]> {
    return ids.map((id) => vocabById.get(id)).filter((v): v is VocabItem => Boolean(v))
  }
  async getVocabByLang(lang: LangCode): Promise<VocabItem[]> {
    return allVocab.filter((v) => v.lang === lang)
  }
}
```

Note: ensure `tsconfig.json` has `"resolveJsonModule": true` (Next.js default). If JSON import typing complains, add `"esModuleInterop": true` (Next default).

Create `lib/content/index.ts`:
```ts
import type { ContentSource } from './ContentSource'
import { LocalContentSource } from './LocalContentSource'

let instance: ContentSource | null = null
export function getContentSource(): ContentSource {
  if (!instance) instance = new LocalContentSource()
  return instance
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npx vitest run test/content/LocalContentSource.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(content): add ContentSource interface and local JSON implementation"
```

---

### Task 4: SRS scheduler (SM-2-lite), pure + TDD

**Files:**
- Create: `lib/progress/types.ts`
- Create: `lib/progress/srs.ts`
- Test: `test/progress/srs.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
```ts
type Grade = 'again' | 'hard' | 'good' | 'easy'
interface SrsState {
  vocabId: string
  intervalDays: number
  ease: number
  reps: number
  lapses: number
  dueAt: number          // epoch ms
  lastReviewedAt: number | null
}
function initialSrsState(vocabId: string, now: number): SrsState
function review(state: SrsState, grade: Grade, now: number): SrsState
const DAY_MS = 86_400_000
```

- [ ] **Step 1: Write the types**

Create `lib/progress/types.ts`:
```ts
import type { LangCode } from '@/lib/content/types'

export type Grade = 'again' | 'hard' | 'good' | 'easy'

export interface SrsState {
  vocabId: string
  intervalDays: number
  ease: number
  reps: number
  lapses: number
  dueAt: number
  lastReviewedAt: number | null
}

export type LessonStatus = 'not_started' | 'in_progress' | 'completed'

export interface LessonProgress {
  lessonId: string
  status: LessonStatus
  completedAt: number | null
}

// stored card couples scheduling state with the language for due filtering
export interface CardRecord extends SrsState {
  lang: LangCode
}
```

- [ ] **Step 2: Write failing tests**

Create `test/progress/srs.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { initialSrsState, review, DAY_MS } from '@/lib/progress/srs'

const T0 = 1_000_000_000_000 // fixed "now"

describe('srs', () => {
  it('initial state is due now with ease 2.5', () => {
    const s = initialSrsState('v1', T0)
    expect(s).toMatchObject({ vocabId: 'v1', intervalDays: 0, ease: 2.5, reps: 0, lapses: 0, dueAt: T0 })
  })

  it('first good review schedules 1 day out', () => {
    const s = review(initialSrsState('v1', T0), 'good', T0)
    expect(s.reps).toBe(1)
    expect(s.intervalDays).toBe(1)
    expect(s.dueAt).toBe(T0 + DAY_MS)
  })

  it('second good review schedules 6 days out', () => {
    let s = review(initialSrsState('v1', T0), 'good', T0)
    s = review(s, 'good', s.dueAt)
    expect(s.reps).toBe(2)
    expect(s.intervalDays).toBe(6)
  })

  it('third good review multiplies by ease', () => {
    let s = initialSrsState('v1', T0)
    s = review(s, 'good', T0)        // 1
    s = review(s, 'good', s.dueAt)   // 6
    s = review(s, 'good', s.dueAt)   // round(6 * 2.5) = 15
    expect(s.intervalDays).toBe(15)
  })

  it('again resets reps, increments lapses, lowers ease, due same time', () => {
    let s = review(initialSrsState('v1', T0), 'good', T0)
    const s2 = review(s, 'again', s.dueAt)
    expect(s2.reps).toBe(0)
    expect(s2.lapses).toBe(1)
    expect(s2.intervalDays).toBe(0)
    expect(s2.dueAt).toBe(s.dueAt)
    expect(s2.ease).toBeCloseTo(2.3, 5)
  })

  it('ease never drops below 1.3', () => {
    let s = initialSrsState('v1', T0)
    for (let i = 0; i < 20; i++) s = review(s, 'again', T0)
    expect(s.ease).toBeGreaterThanOrEqual(1.3)
  })

  it('easy raises ease and schedules further than good', () => {
    const good = review(initialSrsState('v1', T0), 'good', T0)
    const easy = review(initialSrsState('v2', T0), 'easy', T0)
    expect(easy.ease).toBeGreaterThan(2.5)
    expect(easy.intervalDays).toBeGreaterThanOrEqual(good.intervalDays)
  })

  it('hard grows interval modestly and lowers ease', () => {
    let s = initialSrsState('v1', T0)
    s = review(s, 'good', T0)        // interval 1, ease 2.5
    const hard = review(s, 'hard', s.dueAt)
    expect(hard.ease).toBeCloseTo(2.35, 5)
    expect(hard.intervalDays).toBeGreaterThanOrEqual(1)
    expect(hard.reps).toBe(2)
  })
})
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `npx vitest run test/progress/srs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the scheduler**

Create `lib/progress/srs.ts`:
```ts
import type { Grade, SrsState } from './types'

export const DAY_MS = 86_400_000
const MIN_EASE = 1.3
const START_EASE = 2.5

export function initialSrsState(vocabId: string, now: number): SrsState {
  return {
    vocabId,
    intervalDays: 0,
    ease: START_EASE,
    reps: 0,
    lapses: 0,
    dueAt: now,
    lastReviewedAt: null,
  }
}

function clampEase(e: number): number {
  return Math.max(MIN_EASE, e)
}

export function review(state: SrsState, grade: Grade, now: number): SrsState {
  const base = { ...state, lastReviewedAt: now }

  if (grade === 'again') {
    return {
      ...base,
      reps: 0,
      lapses: state.lapses + 1,
      ease: clampEase(state.ease - 0.2),
      intervalDays: 0,
      dueAt: now,
    }
  }

  const reps = state.reps + 1
  let ease = state.ease
  let interval: number

  if (grade === 'hard') {
    ease = clampEase(state.ease - 0.15)
    interval = Math.max(1, Math.round((state.intervalDays || 1) * 1.2))
  } else if (grade === 'good') {
    if (reps === 1) interval = 1
    else if (reps === 2) interval = 6
    else interval = Math.round(state.intervalDays * ease)
  } else {
    // easy
    ease = state.ease + 0.15
    if (reps === 1) interval = 2
    else if (reps === 2) interval = 8
    else interval = Math.round(state.intervalDays * ease * 1.3)
  }

  return {
    ...base,
    reps,
    ease,
    intervalDays: interval,
    dueAt: now + interval * DAY_MS,
  }
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npx vitest run test/progress/srs.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(progress): add SM-2-lite SRS scheduler with tests"
```

---

### Task 5: ProgressStore interface + KV backends + LocalProgressStore

**Files:**
- Create: `lib/progress/ProgressStore.ts`
- Create: `lib/progress/kv.ts`
- Create: `lib/progress/LocalProgressStore.ts`
- Create: `lib/progress/index.ts`
- Test: `test/progress/LocalProgressStore.test.ts`

**Interfaces:**
- Consumes: `SrsState`, `Grade`, `CardRecord`, `LessonProgress`, `LessonStatus` (Task 4); `initialSrsState`, `review` (Task 4); `LangCode` (Task 2)
- Produces:
```ts
interface KVBackend { get(key: string): string | null; set(key: string, value: string): void }
class InMemoryKV implements KVBackend
class LocalStorageKV implements KVBackend
interface ProgressStore {
  ensureCards(cards: { vocabId: string; lang: LangCode }[], now: number): Promise<void>
  getDueCards(lang: LangCode, now: number, limit?: number): Promise<CardRecord[]>
  countDue(lang: LangCode, now: number): Promise<number>
  recordReview(vocabId: string, grade: Grade, now: number): Promise<CardRecord>
  getLessonProgress(lessonId: string): Promise<LessonProgress | null>
  setLessonProgress(lessonId: string, status: LessonStatus, now: number): Promise<void>
}
class LocalProgressStore implements ProgressStore { constructor(kv: KVBackend) }
function getProgressStore(): ProgressStore  // client singleton over LocalStorageKV
```

- [ ] **Step 1: Write the interface + KV backends**

Create `lib/progress/ProgressStore.ts`:
```ts
import type { CardRecord, Grade, LessonProgress, LessonStatus } from './types'
import type { LangCode } from '@/lib/content/types'

export interface ProgressStore {
  ensureCards(cards: { vocabId: string; lang: LangCode }[], now: number): Promise<void>
  getDueCards(lang: LangCode, now: number, limit?: number): Promise<CardRecord[]>
  countDue(lang: LangCode, now: number): Promise<number>
  recordReview(vocabId: string, grade: Grade, now: number): Promise<CardRecord>
  getLessonProgress(lessonId: string): Promise<LessonProgress | null>
  setLessonProgress(lessonId: string, status: LessonStatus, now: number): Promise<void>
}
```

Create `lib/progress/kv.ts`:
```ts
export interface KVBackend {
  get(key: string): string | null
  set(key: string, value: string): void
}

export class InMemoryKV implements KVBackend {
  private store = new Map<string, string>()
  get(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }
  set(key: string, value: string): void {
    this.store.set(key, value)
  }
}

export class LocalStorageKV implements KVBackend {
  get(key: string): string | null {
    return window.localStorage.getItem(key)
  }
  set(key: string, value: string): void {
    window.localStorage.setItem(key, value)
  }
}
```

- [ ] **Step 2: Write failing test**

Create `test/progress/LocalProgressStore.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { InMemoryKV } from '@/lib/progress/kv'
import { LocalProgressStore } from '@/lib/progress/LocalProgressStore'
import { DAY_MS } from '@/lib/progress/srs'

const T0 = 1_000_000_000_000

function store() {
  return new LocalProgressStore(new InMemoryKV())
}

describe('LocalProgressStore', () => {
  it('ensureCards creates due cards, idempotently', async () => {
    const s = store()
    await s.ensureCards([{ vocabId: 'zh-1', lang: 'zh' }], T0)
    await s.ensureCards([{ vocabId: 'zh-1', lang: 'zh' }], T0 + 5) // must not reset
    const due = await s.getDueCards('zh', T0)
    expect(due).toHaveLength(1)
    expect(due[0].vocabId).toBe('zh-1')
  })

  it('countDue filters by language and due time', async () => {
    const s = store()
    await s.ensureCards(
      [{ vocabId: 'zh-1', lang: 'zh' }, { vocabId: 'es-1', lang: 'es' }],
      T0,
    )
    expect(await s.countDue('zh', T0)).toBe(1)
    expect(await s.countDue('es', T0)).toBe(1)
    expect(await s.countDue('en', T0)).toBe(0)
  })

  it('recordReview good pushes the card out of the due window', async () => {
    const s = store()
    await s.ensureCards([{ vocabId: 'zh-1', lang: 'zh' }], T0)
    const card = await s.recordReview('zh-1', 'good', T0)
    expect(card.intervalDays).toBe(1)
    expect(await s.countDue('zh', T0)).toBe(0)
    expect(await s.countDue('zh', T0 + DAY_MS)).toBe(1)
  })

  it('persists across instances sharing a backend', async () => {
    const kv = new InMemoryKV()
    const a = new LocalProgressStore(kv)
    await a.ensureCards([{ vocabId: 'zh-1', lang: 'zh' }], T0)
    await a.recordReview('zh-1', 'good', T0)
    const b = new LocalProgressStore(kv)
    expect(await b.countDue('zh', T0)).toBe(0)
  })

  it('tracks lesson progress', async () => {
    const s = store()
    expect(await s.getLessonProgress('zh-l1')).toBeNull()
    await s.setLessonProgress('zh-l1', 'completed', T0)
    const p = await s.getLessonProgress('zh-l1')
    expect(p?.status).toBe('completed')
    expect(p?.completedAt).toBe(T0)
  })
})
```

- [ ] **Step 3: Run test, verify it fails**

Run: `npx vitest run test/progress/LocalProgressStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement LocalProgressStore**

Create `lib/progress/LocalProgressStore.ts`:
```ts
import type { ProgressStore } from './ProgressStore'
import type { CardRecord, Grade, LessonProgress, LessonStatus } from './types'
import type { LangCode } from '@/lib/content/types'
import type { KVBackend } from './kv'
import { initialSrsState, review } from './srs'

const CARDS_KEY = 'chesen.cards.v1'
const LESSONS_KEY = 'chesen.lessons.v1'

export class LocalProgressStore implements ProgressStore {
  constructor(private kv: KVBackend) {}

  private readCards(): Record<string, CardRecord> {
    const raw = this.kv.get(CARDS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, CardRecord>) : {}
  }
  private writeCards(cards: Record<string, CardRecord>): void {
    this.kv.set(CARDS_KEY, JSON.stringify(cards))
  }
  private readLessons(): Record<string, LessonProgress> {
    const raw = this.kv.get(LESSONS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, LessonProgress>) : {}
  }
  private writeLessons(l: Record<string, LessonProgress>): void {
    this.kv.set(LESSONS_KEY, JSON.stringify(l))
  }

  async ensureCards(items: { vocabId: string; lang: LangCode }[], now: number): Promise<void> {
    const cards = this.readCards()
    let changed = false
    for (const { vocabId, lang } of items) {
      if (!cards[vocabId]) {
        cards[vocabId] = { ...initialSrsState(vocabId, now), lang }
        changed = true
      }
    }
    if (changed) this.writeCards(cards)
  }

  async getDueCards(lang: LangCode, now: number, limit?: number): Promise<CardRecord[]> {
    const due = Object.values(this.readCards())
      .filter((c) => c.lang === lang && c.dueAt <= now)
      .sort((a, b) => a.dueAt - b.dueAt)
    return typeof limit === 'number' ? due.slice(0, limit) : due
  }

  async countDue(lang: LangCode, now: number): Promise<number> {
    return (await this.getDueCards(lang, now)).length
  }

  async recordReview(vocabId: string, grade: Grade, now: number): Promise<CardRecord> {
    const cards = this.readCards()
    const existing = cards[vocabId]
    if (!existing) throw new Error(`No card for vocab ${vocabId}`)
    const updated: CardRecord = { ...review(existing, grade, now), lang: existing.lang }
    cards[vocabId] = updated
    this.writeCards(cards)
    return updated
  }

  async getLessonProgress(lessonId: string): Promise<LessonProgress | null> {
    return this.readLessons()[lessonId] ?? null
  }

  async setLessonProgress(lessonId: string, status: LessonStatus, now: number): Promise<void> {
    const lessons = this.readLessons()
    lessons[lessonId] = {
      lessonId,
      status,
      completedAt: status === 'completed' ? now : null,
    }
    this.writeLessons(lessons)
  }
}
```

Create `lib/progress/index.ts`:
```ts
import type { ProgressStore } from './ProgressStore'
import { LocalProgressStore } from './LocalProgressStore'
import { LocalStorageKV } from './kv'

let instance: ProgressStore | null = null
export function getProgressStore(): ProgressStore {
  if (!instance) instance = new LocalProgressStore(new LocalStorageKV())
  return instance
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npx vitest run test/progress/LocalProgressStore.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(progress): add ProgressStore with local KV-backed implementation"
```

---

### Task 6: Quiz builder (pure MCQ generation), TDD

**Files:**
- Create: `lib/quiz/buildQuiz.ts`
- Test: `test/quiz/buildQuiz.test.ts`

**Interfaces:**
- Consumes: `VocabItem` (Task 2)
- Produces:
```ts
interface QuizQuestion { vocabId: string; prompt: string; reading?: string; options: string[]; answerIndex: number }
function buildQuiz(items: VocabItem[], pool: VocabItem[], rng?: () => number): QuizQuestion[]
```

- [ ] **Step 1: Write failing test**

Create `test/quiz/buildQuiz.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildQuiz } from '@/lib/quiz/buildQuiz'
import type { VocabItem } from '@/lib/content/types'

const v = (id: string, term: string, vi: string): VocabItem => ({
  id, lang: 'es', term, translation: { vi },
})
const pool = [v('1', 'hola', 'xin chào'), v('2', 'gracias', 'cảm ơn'), v('3', 'adiós', 'tạm biệt'), v('4', 'perdón', 'xin lỗi')]

// deterministic rng: always 0 -> stable ordering
const rng = () => 0

describe('buildQuiz', () => {
  it('builds one question per item', () => {
    const qs = buildQuiz(pool, pool, rng)
    expect(qs).toHaveLength(4)
  })
  it('each question has 4 options including the correct translation at answerIndex', () => {
    const qs = buildQuiz([pool[0]], pool, rng)
    const q = qs[0]
    expect(q.vocabId).toBe('1')
    expect(q.prompt).toBe('hola')
    expect(q.options).toHaveLength(4)
    expect(q.options[q.answerIndex]).toBe('xin chào')
  })
  it('falls back to fewer options when pool is tiny', () => {
    const tiny = [pool[0], pool[1]]
    const q = buildQuiz([tiny[0]], tiny, rng)[0]
    expect(q.options).toContain('xin chào')
    expect(q.options.length).toBeGreaterThanOrEqual(2)
    expect(q.options.length).toBeLessThanOrEqual(4)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run test/quiz/buildQuiz.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement buildQuiz**

Create `lib/quiz/buildQuiz.ts`:
```ts
import type { VocabItem } from '@/lib/content/types'

export interface QuizQuestion {
  vocabId: string
  prompt: string
  reading?: string
  options: string[]
  answerIndex: number
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function buildQuiz(
  items: VocabItem[],
  pool: VocabItem[],
  rng: () => number = Math.random,
): QuizQuestion[] {
  return items.map((item) => {
    const correct = item.translation.vi
    const distractors = shuffle(
      pool.filter((p) => p.id !== item.id).map((p) => p.translation.vi).filter((t) => t !== correct),
      rng,
    ).slice(0, 3)
    const options = shuffle([correct, ...distractors], rng)
    return {
      vocabId: item.id,
      prompt: item.term,
      reading: item.reading,
      options,
      answerIndex: options.indexOf(correct),
    }
  })
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run test/quiz/buildQuiz.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(quiz): add pure multiple-choice quiz builder"
```

---

### Task 7: Home page — language picker

**Files:**
- Create: `components/LanguageCard.tsx`
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx` (set Vietnamese lang + title)
- Test: `test/components/LanguageCard.test.tsx`

**Interfaces:**
- Consumes: `getContentSource()` (Task 3), `Language` (Task 2)
- Produces: route `/` listing languages, each linking to `/learn/[code]`

- [ ] **Step 1: Write failing component test**

Create `test/components/LanguageCard.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LanguageCard } from '@/components/LanguageCard'

describe('LanguageCard', () => {
  it('renders name, native name, and links to the language', () => {
    render(<LanguageCard language={{ code: 'zh', name: 'Tiếng Trung', nativeName: '中文', script: 'han' }} />)
    expect(screen.getByText('Tiếng Trung')).toBeInTheDocument()
    expect(screen.getByText('中文')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/learn/zh')
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run test/components/LanguageCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement LanguageCard**

Create `components/LanguageCard.tsx`:
```tsx
import Link from 'next/link'
import type { Language } from '@/lib/content/types'

export function LanguageCard({ language }: { language: Language }) {
  return (
    <Link
      href={`/learn/${language.code}`}
      className="block rounded-2xl border border-black/10 p-6 transition hover:shadow-lg hover:-translate-y-0.5"
    >
      <div className="text-3xl font-semibold">{language.nativeName}</div>
      <div className="mt-1 text-sm text-black/60">{language.name}</div>
    </Link>
  )
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run test/components/LanguageCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implement the home page**

Replace `app/page.tsx`:
```tsx
import { getContentSource } from '@/lib/content'
import { LanguageCard } from '@/components/LanguageCard'

export default async function Home() {
  const languages = await getContentSource().getLanguages()
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold">Chesen</h1>
      <p className="mt-2 text-black/60">Học tiếng Trung, Tây Ban Nha và Anh.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {languages.map((l) => (
          <LanguageCard key={l.code} language={l} />
        ))}
      </div>
    </main>
  )
}
```

Edit `app/layout.tsx`: set `<html lang="vi">` and update the exported `metadata` title to `'Chesen'` and description to `'Học ngoại ngữ'`.

- [ ] **Step 6: Verify build + run**

Run: `npm run build`
Expected: build succeeds.
Run: `npm run dev`, open `http://localhost:3000`, confirm three language cards render and link to `/learn/<code>`. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): add home page language picker"
```

---

### Task 8: Language dashboard — lessons + due count

**Files:**
- Create: `components/LessonList.tsx`
- Create: `app/learn/[lang]/page.tsx`
- Create: `app/learn/[lang]/LangDashboard.tsx` (client component)
- Test: `test/components/LessonList.test.tsx`

**Interfaces:**
- Consumes: `getContentSource()` (Task 3), `getProgressStore()` (Task 5), `Lesson`, `LangCode`
- Produces: route `/learn/[lang]` showing lessons (link to lesson) and a due-card count with a link to `/learn/[lang]/review`

- [ ] **Step 1: Write failing component test**

Create `test/components/LessonList.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LessonList } from '@/components/LessonList'

const lessons = [
  { id: 'zh-l1', lang: 'zh' as const, title: 'Chào hỏi', description: 'desc', position: 1, vocabIds: ['zh-1'] },
]

describe('LessonList', () => {
  it('renders lessons linking to the lesson route', () => {
    render(<LessonList lang="zh" lessons={lessons} />)
    expect(screen.getByText('Chào hỏi')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Chào hỏi/ })).toHaveAttribute('href', '/learn/zh/lesson/zh-l1')
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run test/components/LessonList.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement LessonList**

Create `components/LessonList.tsx`:
```tsx
import Link from 'next/link'
import type { Lesson, LangCode } from '@/lib/content/types'

export function LessonList({ lang, lessons }: { lang: LangCode; lessons: Lesson[] }) {
  return (
    <ul className="space-y-3">
      {lessons.map((l) => (
        <li key={l.id}>
          <Link
            href={`/learn/${lang}/lesson/${l.id}`}
            className="block rounded-xl border border-black/10 p-4 hover:bg-black/5"
          >
            <div className="font-medium">{l.title}</div>
            {l.description && <div className="text-sm text-black/60">{l.description}</div>}
          </Link>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run test/components/LessonList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implement the dashboard (server + client split)**

Create `app/learn/[lang]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { getContentSource } from '@/lib/content'
import type { LangCode } from '@/lib/content/types'
import { LangDashboard } from './LangDashboard'

const VALID: LangCode[] = ['zh', 'es', 'en']

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!VALID.includes(lang as LangCode)) notFound()
  const code = lang as LangCode
  const src = getContentSource()
  const [language, lessons] = await Promise.all([
    src.getLanguages().then((ls) => ls.find((l) => l.code === code)!),
    src.getLessons(code),
  ])
  return <LangDashboard language={language} lessons={lessons} />
}
```

Create `app/learn/[lang]/LangDashboard.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Language, Lesson } from '@/lib/content/types'
import { LessonList } from '@/components/LessonList'
import { getProgressStore } from '@/lib/progress'

export function LangDashboard({ language, lessons }: { language: Language; lessons: Lesson[] }) {
  const [due, setDue] = useState<number | null>(null)
  useEffect(() => {
    getProgressStore().countDue(language.code, Date.now()).then(setDue)
  }, [language.code])

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/" className="text-sm text-black/50 hover:underline">← Trang chủ</Link>
      <h1 className="mt-3 text-3xl font-bold">{language.name}</h1>

      <div className="mt-6 flex items-center justify-between rounded-xl bg-black/5 p-4">
        <span>Thẻ cần ôn hôm nay: <b>{due ?? '…'}</b></span>
        <Link
          href={`/learn/${language.code}/review`}
          className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-40"
          aria-disabled={due === 0}
        >
          Ôn tập
        </Link>
      </div>

      <h2 className="mt-10 mb-3 text-xl font-semibold">Bài học</h2>
      <LessonList lang={language.code} lessons={lessons} />
    </main>
  )
}
```

- [ ] **Step 6: Verify build + run**

Run: `npm run build`
Expected: build succeeds.
Run: `npm run dev`, open `/learn/zh`, confirm lessons render and due count shows (0 on a fresh profile). Stop the server.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): add language dashboard with lessons and due count"
```

---

### Task 9: Lesson view — vocab intro + multiple-choice quiz

**Files:**
- Create: `components/Quiz.tsx`
- Create: `app/learn/[lang]/lesson/[lessonId]/page.tsx`
- Create: `app/learn/[lang]/lesson/[lessonId]/LessonRunner.tsx` (client)

**Interfaces:**
- Consumes: `getContentSource()` (Task 3), `getProgressStore()` (Task 5), `buildQuiz()` (Task 6), `VocabItem`, `Lesson`
- Produces: route `/learn/[lang]/lesson/[lessonId]` that shows vocab, runs a quiz, then on finish calls `ensureCards(vocab, now)` and `setLessonProgress(lessonId, 'completed', now)`

- [ ] **Step 1: Implement the Quiz component**

(Quiz interaction is exercised manually in Step 4; the pure logic it relies on is already tested in Task 6.)

Create `components/Quiz.tsx`:
```tsx
'use client'
import { useState } from 'react'
import type { QuizQuestion } from '@/lib/quiz/buildQuiz'

export function Quiz({ questions, onDone }: { questions: QuizQuestion[]; onDone: () => void }) {
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const q = questions[i]

  function choose(idx: number) {
    if (picked !== null) return
    setPicked(idx)
  }
  function next() {
    if (i + 1 >= questions.length) return onDone()
    setI(i + 1)
    setPicked(null)
  }

  return (
    <div>
      <div className="text-sm text-black/50">Câu {i + 1}/{questions.length}</div>
      <div className="mt-2 text-3xl font-semibold">{q.prompt}</div>
      {q.reading && <div className="text-black/50">{q.reading}</div>}
      <div className="mt-6 space-y-2">
        {q.options.map((opt, idx) => {
          const isAnswer = idx === q.answerIndex
          const show = picked !== null
          const cls = show
            ? isAnswer
              ? 'border-green-600 bg-green-50'
              : idx === picked
                ? 'border-red-500 bg-red-50'
                : 'border-black/10'
            : 'border-black/10 hover:bg-black/5'
          return (
            <button
              key={idx}
              onClick={() => choose(idx)}
              className={`block w-full rounded-lg border p-3 text-left ${cls}`}
            >
              {opt}
            </button>
          )
        })}
      </div>
      {picked !== null && (
        <button onClick={next} className="mt-6 rounded-lg bg-black px-5 py-2 text-white">
          {i + 1 >= questions.length ? 'Hoàn thành' : 'Tiếp'}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Implement the lesson page (server)**

Create `app/learn/[lang]/lesson/[lessonId]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { getContentSource } from '@/lib/content'
import { LessonRunner } from './LessonRunner'

export default async function Page({ params }: { params: Promise<{ lang: string; lessonId: string }> }) {
  const { lessonId } = await params
  const src = getContentSource()
  const lesson = await src.getLesson(lessonId)
  if (!lesson) notFound()
  const [vocab, pool] = await Promise.all([
    src.getVocab(lesson.vocabIds),
    src.getVocabByLang(lesson.lang),
  ])
  return <LessonRunner lesson={lesson} vocab={vocab} pool={pool} />
}
```

- [ ] **Step 3: Implement the lesson runner (client)**

Create `app/learn/[lang]/lesson/[lessonId]/LessonRunner.tsx`:
```tsx
'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Lesson, VocabItem } from '@/lib/content/types'
import { buildQuiz } from '@/lib/quiz/buildQuiz'
import { Quiz } from '@/components/Quiz'
import { getProgressStore } from '@/lib/progress'

type Phase = 'intro' | 'quiz' | 'done'

export function LessonRunner({ lesson, vocab, pool }: { lesson: Lesson; vocab: VocabItem[]; pool: VocabItem[] }) {
  const [phase, setPhase] = useState<Phase>('intro')
  const questions = useMemo(() => buildQuiz(vocab, pool), [vocab, pool])

  async function finish() {
    const now = Date.now()
    const store = getProgressStore()
    await store.ensureCards(vocab.map((v) => ({ vocabId: v.id, lang: v.lang })), now)
    await store.setLessonProgress(lesson.id, 'completed', now)
    setPhase('done')
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <Link href={`/learn/${lesson.lang}`} className="text-sm text-black/50 hover:underline">← Quay lại</Link>
      <h1 className="mt-3 text-2xl font-bold">{lesson.title}</h1>

      {phase === 'intro' && (
        <div className="mt-6">
          <ul className="space-y-3">
            {vocab.map((v) => (
              <li key={v.id} className="rounded-xl border border-black/10 p-4">
                <div className="text-2xl font-semibold">{v.term}</div>
                {v.reading && <div className="text-black/50">{v.reading}</div>}
                <div className="mt-1">{v.translation.vi}</div>
              </li>
            ))}
          </ul>
          <button onClick={() => setPhase('quiz')} className="mt-6 rounded-lg bg-black px-5 py-2 text-white">
            Bắt đầu luyện tập
          </button>
        </div>
      )}

      {phase === 'quiz' && <div className="mt-6"><Quiz questions={questions} onDone={finish} /></div>}

      {phase === 'done' && (
        <div className="mt-10 text-center">
          <div className="text-2xl font-semibold">Hoàn thành bài học! 🎉</div>
          <p className="mt-2 text-black/60">Các từ đã được thêm vào hàng đợi ôn tập.</p>
          <Link href={`/learn/${lesson.lang}`} className="mt-6 inline-block rounded-lg bg-black px-5 py-2 text-white">
            Về bảng điều khiển
          </Link>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Verify build + run**

Run: `npm run build`
Expected: build succeeds.
Run: `npm run dev`, open `/learn/zh/lesson/zh-l1`, walk through intro then quiz, finish. Return to `/learn/zh` and confirm the due count is now 5. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): add lesson view with vocab intro and quiz"
```

---

### Task 10: Flashcard review session (SRS)

**Files:**
- Create: `components/Flashcard.tsx`
- Create: `app/learn/[lang]/review/page.tsx`
- Create: `app/learn/[lang]/review/ReviewSession.tsx` (client)

**Interfaces:**
- Consumes: `getContentSource()` (Task 3), `getProgressStore()` (Task 5), `CardRecord`, `Grade`, `VocabItem`, `LangCode`
- Produces: route `/learn/[lang]/review` that loads due cards, shows term then meaning, records a grade, and re-queues cards graded `again` within the session

- [ ] **Step 1: Implement Flashcard component**

Create `components/Flashcard.tsx`:
```tsx
'use client'
import type { VocabItem } from '@/lib/content/types'
import type { Grade } from '@/lib/progress/types'

const GRADES: { grade: Grade; label: string }[] = [
  { grade: 'again', label: 'Lại' },
  { grade: 'hard', label: 'Khó' },
  { grade: 'good', label: 'Tốt' },
  { grade: 'easy', label: 'Dễ' },
]

export function Flashcard({
  vocab, revealed, onReveal, onGrade,
}: {
  vocab: VocabItem
  revealed: boolean
  onReveal: () => void
  onGrade: (g: Grade) => void
}) {
  return (
    <div className="rounded-2xl border border-black/10 p-8 text-center">
      <div className="text-4xl font-semibold">{vocab.term}</div>
      {vocab.reading && <div className="mt-1 text-black/50">{vocab.reading}</div>}
      {revealed ? (
        <>
          <div className="mt-6 text-xl">{vocab.translation.vi}</div>
          <div className="mt-8 grid grid-cols-4 gap-2">
            {GRADES.map((g) => (
              <button key={g.grade} onClick={() => onGrade(g.grade)} className="rounded-lg border border-black/10 py-2 hover:bg-black/5">
                {g.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <button onClick={onReveal} className="mt-8 rounded-lg bg-black px-6 py-2 text-white">
          Hiện nghĩa
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Implement the review page (server)**

Create `app/learn/[lang]/review/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { getContentSource } from '@/lib/content'
import type { LangCode } from '@/lib/content/types'
import { ReviewSession } from './ReviewSession'

const VALID: LangCode[] = ['zh', 'es', 'en']

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!VALID.includes(lang as LangCode)) notFound()
  const code = lang as LangCode
  const vocab = await getContentSource().getVocabByLang(code)
  return <ReviewSession lang={code} vocab={vocab} />
}
```

- [ ] **Step 3: Implement the review session (client)**

Create `app/learn/[lang]/review/ReviewSession.tsx`:
```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { LangCode, VocabItem } from '@/lib/content/types'
import type { Grade } from '@/lib/progress/types'
import { Flashcard } from '@/components/Flashcard'
import { getProgressStore } from '@/lib/progress'

export function ReviewSession({ lang, vocab }: { lang: LangCode; vocab: VocabItem[] }) {
  const byId = useMemo(() => new Map(vocab.map((v) => [v.id, v])), [vocab])
  const [queue, setQueue] = useState<string[] | null>(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    getProgressStore()
      .getDueCards(lang, Date.now())
      .then((cards) => setQueue(cards.map((c) => c.vocabId)))
  }, [lang])

  if (queue === null) return <main className="p-12 text-center">Đang tải…</main>

  if (queue.length === 0) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-2xl font-semibold">Hết thẻ cần ôn 🎉</div>
        <Link href={`/learn/${lang}`} className="mt-6 inline-block rounded-lg bg-black px-5 py-2 text-white">
          Quay lại
        </Link>
      </main>
    )
  }

  const currentId = queue[0]
  const current = byId.get(currentId)!

  async function grade(g: Grade) {
    await getProgressStore().recordReview(currentId, g, Date.now())
    setRevealed(false)
    setQueue((q) => {
      const rest = (q as string[]).slice(1)
      return g === 'again' ? [...rest, currentId] : rest // re-queue "again" at the end
    })
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <div className="mb-4 flex items-center justify-between text-sm text-black/50">
        <Link href={`/learn/${lang}`} className="hover:underline">← Thoát</Link>
        <span>Còn lại: {queue.length}</span>
      </div>
      <Flashcard vocab={current} revealed={revealed} onReveal={() => setRevealed(true)} onGrade={grade} />
    </main>
  )
}
```

- [ ] **Step 4: Verify the full loop end-to-end**

Run: `npm run build`
Expected: build succeeds.
Run: `npm run dev`. Full manual pass:
1. `/` shows three languages.
2. Complete `/learn/zh/lesson/zh-l1`.
3. `/learn/zh` shows due = 5.
4. `/learn/zh/review`: grade cards. Grading `again` re-queues that card; grading `good`/`easy`/`hard` removes it. Session ends at "Hết thẻ cần ôn".
5. Reload `/learn/zh`: due count reflects scheduling (cards graded today are no longer due).
Stop the server.

- [ ] **Step 5: Run the whole test suite**

Run: `npm test`
Expected: ALL tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): add SRS flashcard review session"
```

---

## Phase 2 (later, not part of the POC): Supabase + anonymous auth

Tracked here so the POC sequencing is explicit. Each becomes its own task set when we start Phase 2.

- Install `@supabase/supabase-js` and `@supabase/ssr`; add a Supabase client factory in `lib/supabase/`.
- Create SQL migrations: `languages`, `vocab_items`, `lessons`, `lesson_vocab`, `srs_state`, `lesson_progress`; enable RLS (content readable by authenticated incl. anonymous; progress scoped to `auth.uid()`).
- Add anonymous sign-in on first load (verify Supabase anonymous sign-in behavior against official docs first; use the supabase:supabase skill).
- Implement `SupabaseContentSource` and `SupabaseProgressStore` against the same interfaces; switch the singletons in `lib/content/index.ts` and `lib/progress/index.ts`.
- Write a seed script that loads `content/*.json` into Supabase.
- No UI changes expected beyond a one-time anonymous session bootstrap.

---

## Self-Review

**1. Spec coverage:**
- Three languages, Vietnamese base, lessons + SRS flashcards → Tasks 2, 7–10. ✓
- `ContentSource` / `ProgressStore` seams → Tasks 3, 5. ✓
- SM-2-lite SRS, pure + tested → Task 4. ✓
- Multiple-choice exercise → Tasks 6, 9. ✓
- Chinese `reading` (pinyin) + `translation` map → Task 2 types/schema/seed. ✓
- zod validation of seed → Task 2. ✓
- Error handling: schema throws on bad data (Task 2); `recordReview` throws on missing card (Task 5). localStorage-unavailable handling and friendly network errors are Phase-2/Supabase concerns and are intentionally deferred (POC runs locally). Noted, not silently dropped.
- Supabase + anonymous auth + RLS → deferred to Phase 2 by explicit user decision ("POC first, improve gradually"). Documented above.

**2. Placeholder scan:** No TBD/TODO; every code step contains full code; commands have expected output. ✓

**3. Type consistency:** `SrsState`/`CardRecord`/`Grade` consistent across Tasks 4–5–10; `ContentSource` method names consistent across Tasks 3, 8, 9, 10; `QuizQuestion` shape consistent across Tasks 6 and 9. ✓
