'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { entryPath } from '@/lib/dictionary/entryId'
import { detectOrder } from '@/lib/dictionary/detect'
import { LANG_LABELS, LANG_FLAGS } from '@/lib/dictionary/labels'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/content/types'

type Results = Record<LangCode, DictEntryPreview[]>
const EMPTY: Results = { en: [], zh: [], es: [] }

/**
 * Auto-detecting search box. Queries all three languages via the cached
 * /dictionary/search route, groups results by language and orders the groups by a
 * language guess (Han -> zh, Spanish letters -> es, else en). Debounced, with request
 * abort and a small in-memory prefix cache so repeats are instant.
 */
export function SearchBox({ initialQuery = '', autoFocus = false }: { initialQuery?: string; autoFocus?: boolean }) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<Results>(EMPTY)
  const [loading, setLoading] = useState(false)
  const cache = useRef(new Map<string, Results>())

  useEffect(() => {
    const q = query.trim()
    if (!q) { setResults(EMPTY); setLoading(false); return }
    const key = q.toLowerCase()
    const cached = cache.current.get(key)
    if (cached) { setResults(cached); setLoading(false); return }
    setLoading(true)
    const ctrl = new AbortController()
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/dictionary/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        const data = (await res.json()) as Results
        cache.current.set(key, data)
        setResults(data)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setResults(EMPTY)
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => { clearTimeout(id); ctrl.abort() }
  }, [query])

  const order = useMemo(() => detectOrder(query), [query])
  const total = order.reduce((n, l) => n + results[l].length, 0)

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Nhập từ cần tra (Anh · Trung · Tây Ban Nha)..."
        className="w-full rounded-xl border border-black/15 px-4 py-3 text-base shadow-sm focus:border-black/40 focus:outline-none"
      />
      {loading && <p className="text-sm text-black/40">Đang tìm...</p>}
      {!loading && query.trim() && total === 0 && (
        <p className="text-sm text-black/40">Không tìm thấy kết quả.</p>
      )}
      {order.map((lang) =>
        results[lang].length > 0 ? (
          <div key={lang} className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-black/40">
              {LANG_FLAGS[lang]} {LANG_LABELS[lang]}
            </span>
            <ul className="flex flex-col gap-0.5">
              {results[lang].map((e) => (
                <li key={e.id}>
                  <Link href={entryPath(e.id)} className="flex items-baseline gap-2 rounded-lg px-3 py-2 hover:bg-black/5">
                    <span className="font-medium">{e.headword}</span>
                    {e.ipa && <span className="ipa text-xs text-black/40">{e.ipa}</span>}
                    {e.glossVi && <span className="text-sm text-black/60">{e.glossVi}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </div>
  )
}
