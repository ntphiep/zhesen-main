'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { LinkPending } from '@/components/ui/LinkPending'
import { entryPath } from '@/lib/dictionary/entryId'
import { recentEntries } from '@/lib/dictionary/recent'
import type { UserWord } from '@/lib/wordlist/types'
import { loadSupabaseClient } from '@/lib/supabase/loadClient'

/** Enough to fill one row at 1440px. */
const SHOW = 8

interface Notebook {
  words: UserWord[]
  due: number
  total: number
}

/**
 * What this reader in particular has done: the words opened from the boxes, and the
 * newest words in their notebook with the number the scheduler wants back.
 *
 * Both halves are read in the browser. Reading the session in a server component calls
 * `cookies()` and stops `/dictionary` prerendering, and the recent list only ever existed
 * in this browser's storage.
 */
export function PersonalStrip() {
  const recent = useSyncExternalStore(
    recentEntries.subscribe, recentEntries.snapshot, recentEntries.serverSnapshot,
  )
  const [book, setBook] = useState<Notebook | null>(null)
  const [intent, setIntent] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    // Dynamic import for the same reason `useAccount` uses one: supabase-js is 62.2 kB
    // gzipped and this strip sits below the fold of a page that queries nothing.
    void (async () => {
      const { createClient } = await loadSupabaseClient()
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      if (!live || !data.session) return
      const [store, stats] = await Promise.all([
        import('@/lib/wordlist/store'),
        import('@/lib/wordlist/stats'),
      ])
      const [words, counted] = await Promise.all([
        store.listRecentWords(supabase, SHOW),
        stats.getWordlistStats(supabase),
      ])
      if (live) setBook({ words, due: counted.due, total: counted.total })
    })()
    return () => { live = false }
  }, [])

  const saved = book && book.total > 0

  return (
    <div className="flex flex-col gap-6">
      {recent.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-black/40">Tra gần đây</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {recent.map((e) => (
              <Link
                key={e.id}
                href={entryPath(e.id)}
                prefetch={intent === e.id ? null : false}
                onMouseEnter={() => setIntent(e.id)}
                onFocus={() => setIntent(e.id)}
                onTouchStart={() => setIntent(e.id)}
                className="rounded-full border border-black/10 px-3 py-1 text-sm hover:bg-black/5"
                title={e.glossVi ?? undefined}
              >
                {e.headword}
                <LinkPending />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-black/40">Sổ tay</h2>
          {saved && book.due > 0 && (
            <span className="text-xs text-black/50">{book.due} từ đến hạn ôn</span>
          )}
        </div>
        {saved ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {book.words.map((w) => (
              <Link
                key={w.id}
                href={w.entryId ? entryPath(w.entryId) : '/wordlist'}
                // /wordlist reads the session, so only an entry page is prefetched.
                prefetch={Boolean(w.entryId) && intent === w.id ? null : false}
                onMouseEnter={() => setIntent(w.id)}
                onFocus={() => setIntent(w.id)}
                onTouchStart={() => setIntent(w.id)}
                className="rounded-full border border-black/10 px-3 py-1 text-sm hover:bg-black/5"
                title={w.meaningVi ?? undefined}
              >
                {w.headword}
                <LinkPending />
              </Link>
            ))}
            <Link
              href="/practice"
              prefetch={false}
              className="rounded-full bg-black px-3 py-1 text-sm font-medium text-white hover:bg-black/85"
            >
              Luyện tập
            </Link>
          </div>
        ) : (
          <p className="mt-3 text-sm text-black/45">
            Chưa có từ. Tra một từ để lưu.
          </p>
        )}
      </div>
    </div>
  )
}
