'use client'
import { useState } from 'react'
import Link from 'next/link'
import { LinkPending } from '@/components/ui/LinkPending'
import { entryPath } from '@/lib/dictionary/entryId'
import { theoryBlockPath, vocabularyLevelPath } from '@/lib/theory/path'
import { signInHref, useAccount } from '@/lib/hooks/useAccount'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import type { Language } from '@/lib/languages'
import { Ipa } from '@/components/ui/Ipa'

type AddAllState = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; added: number; skipped: number } | { kind: 'error' }

/** `/theory/[lang]/vocabulary/[level]`: a paginated list of every word at one level, plus a
 * one-click bulk import into the wordlist. Browsing is public; the import needs an
 * account, so without one the button is a sign-in prompt carrying this page in `next`. */
export function LevelWordList({ language, level, levelIsEstimated, initialItems, total, pageSize }: {
  language: Language
  level: string
  levelIsEstimated: boolean
  initialItems: DictEntryPreview[]
  total: number
  pageSize: number
}) {
  const { kind } = useAccount()
  const [items, setItems] = useState(initialItems)
  const [loadingMore, setLoadingMore] = useState(false)
  const [addAll, setAddAll] = useState<AddAllState>({ kind: 'idle' })

  async function loadMore() {
    setLoadingMore(true)
    try {
      // Imported on the click, as in `PersonalStrip`: browsing the list needs neither
      // supabase-js nor zod, and a static import put both on this page's first load.
      const [{ createClient }, { getEntriesByLevel }] = await Promise.all([
        import('@/lib/supabase/client'),
        import('@/lib/dictionary/levels'),
      ])
      const page = await getEntriesByLevel(createClient(), language.code, level, items.length, pageSize)
      setItems((prev) => [...prev, ...page.items])
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleAddAll() {
    setAddAll({ kind: 'busy' })
    try {
      const [{ createClient }, { getAllEntriesByLevel }, { addWords, draftFromDictEntry, listSavedEntryIds }] = await Promise.all([
        import('@/lib/supabase/client'),
        import('@/lib/dictionary/levels'),
        import('@/lib/wordlist/store'),
      ])
      const supabase = createClient()
      const [all, saved] = await Promise.all([
        getAllEntriesByLevel(supabase, language.code, level),
        listSavedEntryIds(supabase, language.code),
      ])
      const missing = all.filter((e) => !saved.has(e.id))
      // Count what `addWords` inserted, not what it was asked to: the read above cannot
      // see a save in flight from another tab or a second click, so some come back present.
      const added = missing.length > 0 ? await addWords(supabase, missing.map(draftFromDictEntry)) : []
      setAddAll({ kind: 'done', added: added.length, skipped: all.length - added.length })
    } catch {
      setAddAll({ kind: 'error' })
    }
  }

  const here = vocabularyLevelPath(language.code, level)
  const addAllLabel = addAll.kind === 'busy' ? 'Đang thêm…'
    : addAll.kind === 'done' ? `Đã thêm ${addAll.added} từ${addAll.skipped > 0 ? ` (bỏ qua ${addAll.skipped} từ đã có)` : ''}`
    : addAll.kind === 'error' ? 'Lỗi, thử lại'
    : `+ Thêm cả ${level} vào sổ tay (${total} từ)`

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href={theoryBlockPath(language.code, 'vocabulary')} className="text-sm text-black/50 hover:underline">← Từ vựng {language.name}</Link>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-xl font-medium text-black/70">{language.nativeName}</span>
        <h1 className="text-3xl font-bold">{level}</h1>
        <span className="text-sm text-black/40">{total} từ</span>
      </div>

      {levelIsEstimated && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Trình độ do Zhesen ước lượng, không theo phân loại CEFR chính thức.
        </p>
      )}

      {kind === 'permanent' ? (
        <button
          type="button"
          onClick={handleAddAll}
          disabled={addAll.kind === 'busy' || addAll.kind === 'done'}
          className="mt-4 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {addAllLabel}
        </button>
      ) : (
        kind !== null && (
          <Link
            href={`${signInHref(kind)}?next=${encodeURIComponent(here)}`}
            prefetch={false}
            className="mt-4 inline-block rounded-lg border border-black/15 px-4 py-2 text-sm font-medium text-black/70 hover:bg-black/5"
          >
            {`Đăng nhập để thêm cả ${level} vào sổ tay (${total} từ)`}
            <LinkPending />
          </Link>
        )
      )}

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {items.map((e) => (
          <Link
            key={e.id}
            href={entryPath(e.id)}
            className="flex items-baseline gap-2 rounded-lg border border-black/10 px-4 py-2 hover:bg-black/5"
          >
            <span className="font-medium">{e.headword}</span>
            <Ipa value={e.ipa} lang={e.lang} className="text-xs text-black/40" />
            {e.glossVi && <span className="truncate text-sm text-black/55">{e.glossVi}</span>}
            <LinkPending />
          </Link>
        ))}
      </div>

      {items.length < total && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-6 w-full rounded-lg border border-black/15 px-4 py-2 text-sm text-black/70 hover:bg-black/5 disabled:opacity-50"
        >
          {loadingMore ? 'Đang tải…' : `Tải thêm (${items.length}/${total})`}
        </button>
      )}
    </main>
  )
}
