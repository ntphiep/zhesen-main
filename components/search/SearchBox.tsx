'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { entryPath } from '@/lib/dictionary/entryId'
import { detectOrder, orderByBestMatch } from '@/lib/dictionary/detect'
import { pushRecent } from '@/lib/dictionary/recent'
import { LANG_LABELS, LANG_FLAGS } from '@/lib/dictionary/labels'
import { posGroup } from '@/lib/dictionary/pos'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import { EMPTY_SEARCH_RESPONSE, searchResponse, type SearchResponse } from '@/lib/dictionary/response'
import type { LangCode } from '@/lib/languages'

type ByLang = SearchResponse['forward']

/** Best `lex.search` score in a group, 0 when nothing carries one. */
function bestScore(groups: ByLang): number {
  return Math.max(0, ...[...groups.en, ...groups.es, ...groups.zh].map((e) => e.matchScore ?? 0))
}
const EMPTY = EMPTY_SEARCH_RESPONSE
const RECENT_KEY = 'zhesen:recent-searches'
/** en levels only as of this writing (verified: 0 es/zh rows have a level), in
 * CEFR order; any level value not in this list (there shouldn't be one) still
 * renders, just after these. */
const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

/**
 * Auto-detecting, bidirectional search box. Queries all three languages via the
 * cached /dictionary/search route -- both the forward direction (query typed in
 * en/es/zh) and, when the query looks Vietnamese or the forward search found
 * nothing, the reverse direction (Vietnamese -> en/es/zh, labeled separately so
 * it's clear which kind of match is shown). Falls back to "did you mean...?"
 * trigram suggestions when neither direction finds anything. Results can be
 * narrowed with level/part-of-speech filters, computed from (and only shown
 * when present in) the current result set. Debounced, with request abort and a
 * small in-memory prefix cache so repeats are instant. Supports keyboard
 * navigation (up/down/enter), prefetch on hover, and a recent-searches list.
 */
export function SearchBox({ initialQuery = '', autoFocus = false, lang }: { initialQuery?: string; autoFocus?: boolean; lang?: LangCode }) {
  const [query, setQuery] = useState(initialQuery)
  const [data, setData] = useState<SearchResponse>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const [levelFilter, setLevelFilter] = useState<string | null>(null)
  const [posFilter, setPosFilter] = useState<string | null>(null)
  // Lazy-init from localStorage on mount; guarded for SSR (this runs during the
  // server-rendered pass too, before 'use client' hydration takes over on the client).
  const [recent, setRecent] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem(RECENT_KEY)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  })
  const [focused, setFocused] = useState(false)
  const cache = useRef(new Map<string, SearchResponse>())
  const router = useRouter()

  // Reset selection, filters and stale results synchronously as soon as the query
  // changes, instead of in an effect (adjust state during render, per
  // react.dev/learn/you-might-not-need-an-effect). The ref-backed cache can't be read
  // during render, so the cache-hit/fetch branching for `data` stays in the effect.
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    setActive(0)
    setLevelFilter(null)
    setPosFilter(null)
    if (!query.trim()) { setData(EMPTY); setLoading(false) }
  }

  useEffect(() => {
    const q = query.trim()
    if (!q) return
    const key = q.toLowerCase()
    const ctrl = new AbortController()
    let id: ReturnType<typeof setTimeout> | undefined
    async function run() {
      const cached = cache.current.get(key)
      if (cached) { setData(cached); setLoading(false); return }
      setLoading(true)
      id = setTimeout(async () => {
        try {
          const res = await fetch(`/dictionary/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
          // A rejected request (rate limit, server error, a proxy's HTML page)
          // carries a body that is not a result set. Show nothing rather than
          // caching it, so the next keystroke tries again instead of replaying it.
          if (!res.ok) { setData(EMPTY); return }
          const json = searchResponse.parse(await res.json())
          cache.current.set(key, json)
          setData(json)
        } catch (e) {
          if ((e as Error).name !== 'AbortError') setData(EMPTY)
        } finally {
          setLoading(false)
        }
      }, 200)
    }
    run()
    return () => { if (id) clearTimeout(id); ctrl.abort() }
  }, [query])

  const forward = data.forward
  const reverse = data.reverse
  const order = useMemo(
    () => (lang ? [lang] : orderByBestMatch(detectOrder(query), forward, reverse)),
    [query, lang, forward, reverse],
  )
  const hasReverse = order.some((l) => reverse[l].length > 0)

  // Every entry currently on screen (both directions, restricted to `order`),
  // unfiltered -- the level/pos filter options are derived from this so a chip
  // only ever appears when picking it would actually narrow something down.
  const allShown = useMemo(
    () => order.flatMap((l) => [...forward[l], ...reverse[l]]),
    [order, forward, reverse],
  )
  const levelOptions = useMemo(() => {
    const present = new Set(allShown.map((e) => e.level).filter((l): l is string => !!l))
    const ordered = LEVEL_ORDER.filter((l) => present.has(l))
    const rest = [...present].filter((l) => !LEVEL_ORDER.includes(l)).sort()
    return [...ordered, ...rest]
  }, [allShown])
  const posOptions = useMemo(() => {
    const byKey = new Map<string, string>()
    for (const e of allShown) {
      const g = posGroup(e.pos)
      if (g) byKey.set(g.key, g.labelVi)
    }
    return [...byKey.entries()]
  }, [allShown])

  const matches = useMemo(
    () => (e: DictEntryPreview) => (!levelFilter || e.level === levelFilter) && (!posFilter || posGroup(e.pos)?.key === posFilter),
    [levelFilter, posFilter],
  )
  // Filter every language rather than only those in `order`, so the result keeps
  // all three keys and needs no cast to claim it does. `order` still decides what
  // actually renders.
  const applyFilters = useMemo(
    () => (groups: ByLang): ByLang => ({
      en: groups.en.filter(matches),
      es: groups.es.filter(matches),
      zh: groups.zh.filter(matches),
    }),
    [matches],
  )
  const forwardShown = useMemo(() => applyFilters(forward), [applyFilters, forward])
  const reverseShown = useMemo(() => applyFilters(reverse), [applyFilters, reverse])

  // Which direction answered better. Typing "con mèo" produces forward hits --
  // con, cone, cons, all trigram guesses under 1.8 -- while the reverse lookup
  // finds cat. Showing the guesses first because they happen to be the forward
  // direction buries the answer, so the stronger direction leads.
  const reverseLeads = useMemo(
    () => bestScore(reverseShown) > bestScore(forwardShown),
    [forwardShown, reverseShown],
  )

  // Flat list in display order, for keyboard navigation and Enter-to-open.
  const flat = useMemo(
    () => (reverseLeads
      ? [...order.flatMap((l) => reverseShown[l]), ...order.flatMap((l) => forwardShown[l])]
      : [...order.flatMap((l) => forwardShown[l]), ...order.flatMap((l) => reverseShown[l])]),
    [order, forwardShown, reverseShown, reverseLeads],
  )
  const indexById = useMemo(() => new Map(flat.map((e, i) => [e.id, i])), [flat])
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
  const showNoResults = !loading && query.trim() && allShown.length === 0 && data.suggestions.length === 0
  const showSuggestions = !loading && query.trim() && allShown.length === 0 && data.suggestions.length > 0
  const showFilteredEmpty = !loading && query.trim() && allShown.length > 0 && total === 0

  function renderGroup(lang: LangCode, entries: DictEntryPreview[], reversed: boolean) {
    if (entries.length === 0) return null
    return (
      <div key={`${reversed ? 'rev' : 'fwd'}-${lang}`} className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-black/40">
          {LANG_FLAGS[lang]} {LANG_LABELS[lang]}
          {reversed && <span className="ml-1 normal-case text-black/30">· dịch từ tiếng Việt</span>}
        </span>
        <ul className="flex flex-col gap-0.5">
          {entries.map((e) => {
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
    )
  }

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
        id="dictionary-search"
        name="q"
        aria-label="Tra cứu từ"
        placeholder="Nhập từ cần tra (Anh · Trung · Tây Ban Nha · Việt)..."
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
      {/* Visually-hidden live region: screen readers only get result-count updates from
          here, since the visible list below has no other role="status" text. */}
      <p role="status" aria-live="polite" className="sr-only">
        {loading
          ? 'Đang tìm...'
          : query.trim()
            ? `${total} kết quả cho "${query.trim()}"`
            : ''}
      </p>
      {loading && <p className="text-sm text-black/40">Đang tìm...</p>}
      {showNoResults && <p className="text-sm text-black/40">Không tìm thấy kết quả.</p>}
      {showSuggestions && (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-black/40">Không tìm thấy kết quả. Có phải bạn tìm:</span>
          <div className="flex flex-wrap gap-2">
            {data.suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setQuery(s.headword) }}
                className="rounded-full bg-black/5 px-3 py-1 text-sm text-black/70 hover:bg-black/10"
              >
                {LANG_FLAGS[s.lang]} {s.headword}
                {s.glossVi && <span className="text-black/40"> · {s.glossVi}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      {allShown.length > 0 && (levelOptions.length > 0 || posOptions.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {levelOptions.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLevelFilter((cur) => (cur === l ? null : l))}
              aria-pressed={levelFilter === l}
              className={`rounded-full px-2.5 py-1 font-medium ${levelFilter === l ? 'bg-black text-white' : 'bg-black/5 text-black/60 hover:bg-black/10'}`}
            >
              {l}
            </button>
          ))}
          {posOptions.map(([key, labelVi]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPosFilter((cur) => (cur === key ? null : key))}
              aria-pressed={posFilter === key}
              className={`rounded-full px-2.5 py-1 font-medium ${posFilter === key ? 'bg-black text-white' : 'bg-black/5 text-black/60 hover:bg-black/10'}`}
            >
              {labelVi}
            </button>
          ))}
        </div>
      )}
      {showFilteredEmpty && <p className="text-sm text-black/40">Không có kết quả khớp bộ lọc đã chọn.</p>}
      {reverseLeads && hasReverse && order.map((l) => renderGroup(l, reverseShown[l], true))}
      {order.map((l) => renderGroup(l, forwardShown[l], false))}
      {!reverseLeads && hasReverse && order.map((l) => renderGroup(l, reverseShown[l], true))}
    </div>
  )
}
