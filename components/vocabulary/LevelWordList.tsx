'use client'
import { useState } from 'react'
import Link from 'next/link'
import { LinkPending } from '@/components/ui/LinkPending'
import { PageHead } from '@/components/theory/BlockPage'
import { ArrowLeft, ArrowRight, Warn } from '@/components/theory/Glyphs'
import s from '@/components/theory/Theory.module.css'
import { entryPath } from '@/lib/dictionary/entryId'
import { levelPageHref, theoryBlockPath, vocabularyLevelPath } from '@/lib/theory/path'
import { signInHref, useAccount } from '@/lib/hooks/useAccount'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import type { Language } from '@/lib/languages'
import { Ipa } from '@/components/ui/Ipa'
import { loadSupabaseClient } from '@/lib/supabase/loadClient'
import { pageCount } from '@/lib/wordlist/paginate'

type AddAllState = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; added: number; skipped: number } | { kind: 'error' }

/** `/theory/[lang]/vocabulary/[level]`: a paginated list of every word at one level, plus a
 * one-click bulk import into the wordlist. Browsing is public; the import needs an
 * account, so without one the button is a sign-in prompt carrying this page in `next`.
 * The server renders page `?page=N` from row `initialStart`, and the previous and next
 * links are plain `?page=N` URLs, so a crawler reaches every word without the script. */
export function LevelWordList({ language, level, levelIsEstimated, initialItems, initialStart = 0, total, pageSize }: {
  language: Language
  level: string
  levelIsEstimated: boolean
  initialItems: DictEntryPreview[]
  initialStart?: number
  total: number
  pageSize: number
}) {
  const { kind } = useAccount()
  // `items` starts at row `start`: a page jump replaces the list, "load more" extends it.
  const [start, setStart] = useState(initialStart)
  const [items, setItems] = useState(initialItems)
  const [loadingMore, setLoadingMore] = useState(false)
  const [addAll, setAddAll] = useState<AddAllState>({ kind: 'idle' })
  const end = start + items.length
  const pages = pageCount(total, pageSize)

  async function fetchFrom(offset: number, replace: boolean) {
    setLoadingMore(true)
    try {
      // Imported on the click, as in `PersonalStrip`: browsing the list needs neither
      // supabase-js nor zod, and a static import put both on this page's first load.
      const [{ createClient }, { getEntriesByLevel }] = await Promise.all([
        loadSupabaseClient(),
        import('@/lib/dictionary/levels'),
      ])
      const page = await getEntriesByLevel(createClient(), language.code, level, offset, pageSize)
      if (replace) setStart(offset)
      setItems((prev) => (replace ? page.items : [...prev, ...page.items]))
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleAddAll() {
    setAddAll({ kind: 'busy' })
    try {
      const [{ createClient }, { getAllEntriesByLevel }, { addWords, draftFromDictEntry, listSavedEntryIds }] = await Promise.all([
        loadSupabaseClient(),
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
    <main className={`${s.page} font-ui`} data-l={language.code}>
      <PageHead
        language={language}
        back={{ href: theoryBlockPath(language.code, 'vocabulary'), label: `Từ vựng ${language.name}` }}
        title={<>{level}<small>{total} từ</small></>}
      >
        {levelIsEstimated && (
          <p className={s.note} data-gap="">
            Trình độ do Zhesen ước lượng, không theo phân loại CEFR chính thức.
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {kind === 'permanent' ? (
            <button
              type="button"
              onClick={handleAddAll}
              disabled={addAll.kind === 'busy' || addAll.kind === 'done'}
              className={s.btn}
            >
              {addAll.kind === 'error' && <Warn />}
              {addAllLabel}
            </button>
          ) : (
            kind !== null && (
              <Link
                href={`${signInHref(kind)}?next=${encodeURIComponent(here)}`}
                prefetch={false}
                className={s.ghost}
              >
                {`Đăng nhập để thêm cả ${level} vào sổ tay (${total} từ)`}
                <LinkPending />
              </Link>
            )
          )}

          {pages > 1 && (
            <label className={s.pager}>
              Trang
              <select
                value={Math.floor(start / pageSize) + 1}
                // Not disabled while loading: disabling a focused control drops focus to the page.
                onChange={(e) => { if (!loadingMore) fetchFrom((Number(e.target.value) - 1) * pageSize, true) }}
                aria-busy={loadingMore}
                aria-label="Chuyển tới trang"
                className={s.field}
              >
                {Array.from({ length: pages }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
              </select>
              / {pages}
            </label>
          )}
        </div>
      </PageHead>

      <div className={`${s.body} mx-auto max-w-page px-6`}>
        {/* Keyed by the first row, so a page jump fades the new rows in. */}
        <div key={start} className={`${s.entries} ${s.rows}`} aria-busy={loadingMore}>
          {items.map((e) => (
            <Link key={e.id} href={entryPath(e.id)} className={s.entry}>
              <span className={s.hw} lang={e.lang}>{e.headword}</span>
              <Ipa value={e.ipa} lang={e.lang} className={s.pron} />
              {e.glossVi && <span className={`${s.gloss} min-w-0 truncate`}>{e.glossVi}</span>}
              <LinkPending />
            </Link>
          ))}
        </div>

        {end < total && (
          <button
            type="button"
            onClick={() => fetchFrom(end, false)}
            disabled={loadingMore}
            className={`${s.ghost} mt-6 w-full`}
          >
            {loadingMore ? 'Đang tải…' : `Tải thêm (${end}/${total})`}
          </button>
        )}

        {pages > 1 && (
          <nav aria-label="Phân trang" className="mt-4 flex flex-wrap items-center justify-between gap-3">
            {start > 0 ? (
              <Link href={levelPageHref(language.code, level, start / pageSize)} className={s.ghost}>
                <ArrowLeft />
                Trang trước
                <LinkPending />
              </Link>
            ) : <span />}
            {end < total && (
              <Link href={levelPageHref(language.code, level, Math.floor(end / pageSize) + 1)} className={s.ghost}>
                Trang sau
                <ArrowRight />
                <LinkPending />
              </Link>
            )}
          </nav>
        )}
      </div>
    </main>
  )
}
