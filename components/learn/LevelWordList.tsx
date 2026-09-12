'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getEntriesByLevel, getAllEntriesByLevel } from '@/lib/dictionary/levels'
import { addWords, draftFromDictEntry, listSavedEntryIds } from '@/lib/wordlist/store'
import { entryPath } from '@/lib/dictionary/entryId'
import { LANG_FLAGS } from '@/lib/dictionary/labels'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import type { Language } from '@/lib/languages'

type AddAllState = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; added: number; skipped: number } | { kind: 'error' }

/** `/learn/[lang]/[level]`: a paginated ("load more") list of every word at one
 * level, plus a one-click "add whole level" bulk import into the wordlist. */
export function LevelWordList({ language, level, levelIsEstimated, initialItems, total, pageSize }: {
  language: Language
  level: string
  levelIsEstimated: boolean
  initialItems: DictEntryPreview[]
  total: number
  pageSize: number
}) {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState(initialItems)
  const [loadingMore, setLoadingMore] = useState(false)
  const [addAll, setAddAll] = useState<AddAllState>({ kind: 'idle' })

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await getEntriesByLevel(supabase, language.code, level, items.length, pageSize)
      setItems((prev) => [...prev, ...page.items])
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleAddAll() {
    setAddAll({ kind: 'busy' })
    try {
      const [all, saved] = await Promise.all([
        getAllEntriesByLevel(supabase, language.code, level),
        listSavedEntryIds(supabase, language.code),
      ])
      const missing = all.filter((e) => !saved.has(e.id))
      if (missing.length > 0) await addWords(supabase, missing.map(draftFromDictEntry))
      setAddAll({ kind: 'done', added: missing.length, skipped: all.length - missing.length })
    } catch {
      setAddAll({ kind: 'error' })
    }
  }

  const addAllLabel = addAll.kind === 'busy' ? 'Đang thêm...'
    : addAll.kind === 'done' ? `Đã thêm ${addAll.added} từ${addAll.skipped > 0 ? ` (bỏ qua ${addAll.skipped} từ đã có)` : ''}`
    : addAll.kind === 'error' ? 'Lỗi, thử lại'
    : `+ Thêm cả ${level} vào sổ tay (${total} từ)`

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href={`/learn/${language.code}`} className="text-sm text-black/50 hover:underline">← {language.name}</Link>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-3xl">{LANG_FLAGS[language.code]}</span>
        <h1 className="text-3xl font-bold">{level}</h1>
        <span className="text-sm text-black/40">{total} từ</span>
      </div>

      {levelIsEstimated && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Cấp độ ước lượng bởi hệ thống, không phải phân loại CEFR chính thức.
        </p>
      )}

      <button
        type="button"
        onClick={handleAddAll}
        disabled={addAll.kind === 'busy' || addAll.kind === 'done'}
        className="mt-4 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {addAllLabel}
      </button>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {items.map((e) => (
          <Link
            key={e.id}
            href={entryPath(e.id)}
            className="flex items-baseline gap-2 rounded-lg border border-black/10 px-4 py-2 hover:bg-black/5"
          >
            <span className="font-medium">{e.headword}</span>
            {e.ipa && <span className="ipa text-xs text-black/40">{e.ipa}</span>}
            {e.glossVi && <span className="truncate text-sm text-black/55">{e.glossVi}</span>}
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
          {loadingMore ? 'Đang tải...' : `Tải thêm (${items.length}/${total})`}
        </button>
      )}
    </main>
  )
}
