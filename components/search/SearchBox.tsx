'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { entryPath } from '@/lib/dictionary/entryId'
import { detectOrder } from '@/lib/dictionary/detect'
import { pushRecent } from '@/lib/dictionary/recent'
import { LANG_LABELS, LANG_FLAGS } from '@/lib/dictionary/labels'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/content/types'

type Results = Record<LangCode, DictEntryPreview[]>
const EMPTY: Results = { en: [], zh: [], es: [] }
const RECENT_KEY = 'chesen:recent-searches'

/**
 * Auto-detecting search box. Queries all three languages via the cached
 * /dictionary/search route, groups results by language and orders the groups by a
 * language guess (Han -> zh, Spanish letters -> es, else en). Debounced, with request
 * abort and a small in-memory prefix cache so repeats are instant. Supports keyboard
 * navigation (up/down/enter), prefetch on hover, and a recent-searches list.
 */
export function SearchBox({ initialQuery = '', autoFocus = false }: { initialQuery?: string; autoFocus?: boolean }) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<Results>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const [recent, setRecent] = useState<string[]>([])
  const [focused, setFocused] = useState(false)
  const cache = useRef(new Map<string, Results>())
  const router = useRouter()

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY)
      if (raw) setRecent(JSON.parse(raw) as string[])
    } catch { /* ignore unavailable/corrupt storage */ }
  }, [])

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
  // Flat list in display order, for keyboard navigation and Enter-to-open.
  const flat = useMemo(() => order.flatMap((lang) => results[lang].map((e) => e)), [order, results])
  const indexById = useMemo(() => new Map(flat.map((e, i) => [e.id, i])), [flat])
  useEffect(() => { setActive(0) }, [query])

  const total = flat.length

  function remember(q: string) {
    const next = pushRecent(recent, q)
    setRecent(next)
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }
  function open(e: DictEntryPreview) {
    remember(query)
    router.push(entryPath(e.id))
  }
  function onKeyDown(ev: React.KeyboardEvent) {
    if (total === 0) return
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive((i) => Math.min(i + 1, total - 1)) }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (ev.key === 'Enter') { ev.preventDefault(); open(flat[active] ?? flat[0]) }
  }

  const showRecent = focused && !query.trim() && recent.length > 0

  return (
    <div className="relative flex flex-col gap-3">
      <input
        type="text"
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label="Tra cứu từ"
        placeholder="Nhập từ cần tra (Anh · Trung · Tây Ban Nha)..."
        className="w-full rounded-xl border border-black/15 px-4 py-3 text-base shadow-sm focus:border-black/40 focus:outline-none"
      />
      {showRecent && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-black/40">Tìm gần đây</span>
          <div className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <button
                key={r}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setQuery(r) }}
                className="rounded-full bg-black/5 px-3 py-1 text-sm text-black/70 hover:bg-black/10"
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}
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
              {results[lang].map((e) => {
                const href = entryPath(e.id)
                const warm = () => router.prefetch(href)
                const isActive = indexById.get(e.id) === active
                return (
                  <li key={e.id}>
                    <Link
                      href={href}
                      prefetch={false}
                      onMouseEnter={() => { warm(); setActive(indexById.get(e.id) ?? 0) }}
                      onFocus={warm}
                      onClick={() => remember(query)}
                      aria-selected={isActive}
                      className={`flex items-baseline gap-2 rounded-lg px-3 py-2 ${isActive ? 'bg-black/5' : 'hover:bg-black/5'}`}
                    >
                      <span className="font-medium">{e.headword}</span>
                      {e.ipa && <span className="ipa text-xs text-black/40">{e.ipa}</span>}
                      {e.glossVi && <span className="text-sm text-black/60">{e.glossVi}</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null,
      )}
    </div>
  )
}
