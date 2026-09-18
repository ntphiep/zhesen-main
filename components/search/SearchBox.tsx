'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { entryPath } from '@/lib/dictionary/entryId'
import { LinkPending } from '@/components/ui/LinkPending'
import { AiSuggest } from './AiSuggest'
import { detectOrder, orderByBestMatch } from '@/lib/dictionary/detect'
import { pushRecent, readRecent, writeRecent } from '@/lib/dictionary/recent'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import { posGroup } from '@/lib/dictionary/pos'
import { Ipa } from '@/components/ui/Ipa'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import { bestScore, EMPTY_SEARCH_RESPONSE, type SearchResponse } from '@/lib/dictionary/response'
import { fetchSearch } from '@/lib/dictionary/searchClient'
import type { LangCode } from '@/lib/languages'

type ByLang = SearchResponse['forward']

/** One entry per prefix typed, not per word, so the map fills fast. */
const CACHE_LIMIT = 100
const BUSY_MESSAGE = 'Đang có quá nhiều lượt tra cứu. Vui lòng thử lại sau ít giây.'
/** CEFR order. Only en rows carry a level (0 es/zh rows have one); a value outside
 * this list still renders, after these. */
const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

/**
 * Auto-detecting, bidirectional search box over the cached /dictionary/search route:
 * forward (en/es/zh), plus reverse (vi -> en/es/zh) when the query looks Vietnamese.
 */
export function SearchBox({ initialQuery = '', autoFocus = false, lang }: { initialQuery?: string; autoFocus?: boolean; lang?: LangCode }) {
  const [query, setQuery] = useState(initialQuery)
  const [data, setData] = useState<SearchResponse>(EMPTY_SEARCH_RESPONSE)
  const [loading, setLoading] = useState(false)
  // The route refused rather than answered, so "Không tìm thấy kết quả" would be a
  // claim about a dictionary that was never asked.
  const [refused, setRefused] = useState(false)
  const [active, setActive] = useState(0)
  const [levelFilter, setLevelFilter] = useState<string | null>(null)
  const [posFilter, setPosFilter] = useState<string | null>(null)
  // readRecent must stay SSR-guarded: this lazy initializer also runs in the server pass.
  const [recent, setRecent] = useState<string[]>(readRecent)
  const [focused, setFocused] = useState(false)
  const cache = useRef(new Map<string, SearchResponse>())
  const router = useRouter()

  // Adjust state during render, not in an effect: react.dev/learn/you-might-not-need-an-effect.
  // A ref can't be read during render, so `data` branching stays in the effect below.
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    setActive(0)
    setLevelFilter(null)
    setPosFilter(null)
    if (!query.trim()) { setData(EMPTY_SEARCH_RESPONSE); setLoading(false); setRefused(false) }
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
          const outcome = await fetchSearch(q, ctrl.signal)
          // A refusal body is not a result set; caching it would replay the refusal
          // on every later keystroke.
          if (outcome.status === 'refused') { setRefused(true); setData(EMPTY_SEARCH_RESPONSE); return }
          setRefused(false)
          // Map insertion order is age, so the first key is the oldest.
          if (cache.current.size >= CACHE_LIMIT) {
            const oldest = cache.current.keys().next()
            if (!oldest.done) cache.current.delete(oldest.value)
          }
          cache.current.set(key, outcome.data)
          setData(outcome.data)
        } catch (e) {
          if ((e as Error).name !== 'AbortError') setData(EMPTY_SEARCH_RESPONSE)
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

  // Unfiltered, both directions: filter options derive from this, so a chip appears
  // only when picking it would narrow something down.
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
  // Filter all three languages so the result keeps every key and needs no cast.
  // `order` still decides what renders.
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

  // The stronger direction leads: "con mèo" yields forward trigram guesses scoring
  // under 1.8, while the reverse lookup finds cat.
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

  // Warm the keyboard-active row: a touch screen never hovers, so without this the
  // first suggestion is tapped cold. One prefetch per result set, not per row.
  const activeHref = flat[active] ? entryPath(flat[active].id) : null
  useEffect(() => {
    if (activeHref) router.prefetch(activeHref)
  }, [activeHref, router])

  function remember(q: string) {
    const next = pushRecent(recent, q)
    setRecent(next)
    writeRecent(next)
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
  const showNoResults = !loading && !refused && query.trim() && allShown.length === 0 && data.suggestions.length === 0
  const showSuggestions = !loading && !refused && query.trim() && allShown.length === 0 && data.suggestions.length > 0
  const showFilteredEmpty = !loading && query.trim() && allShown.length > 0 && total === 0

  // ARIA combobox pattern: w3.org/WAI/ARIA/apg/patterns/combobox. `aria-activedescendant`
  // is what announces the highlighted row; `aria-selected` alone announces nothing.
  const optionId = (entryId: string) => `search-option-${entryId.replace(/[^\w-]/g, '_')}`
  const activeId = flat[active] ? optionId(flat[active].id) : undefined
  const groupLabel = (l: LangCode, reversed: boolean) =>
    reversed ? `${LANG_LABELS[l]}, dịch từ tiếng Việt` : LANG_LABELS[l]

  function renderGroup(lang: LangCode, entries: DictEntryPreview[], reversed: boolean) {
    if (entries.length === 0) return null
    return (
      <div key={`${reversed ? 'rev' : 'fwd'}-${lang}`} className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-black/40" aria-hidden="true">
          {LANG_LABELS[lang]}
          {reversed && <span className="ml-1 normal-case text-black/30">· dịch từ tiếng Việt</span>}
        </span>
        {/* Carries the language name the heading shows visually, so a listbox reader
            hears which language a row belongs to. */}
        <ul role="group" aria-label={groupLabel(lang, reversed)} className="flex flex-col gap-0.5">
          {entries.map((e) => {
            const href = entryPath(e.id)
            const warm = () => router.prefetch(href)
            const isActive = indexById.get(e.id) === active
            return (
              // role="option" belongs on the row, not the anchor: on the anchor it would
              // stop the result being followable or openable in a new tab.
              <li key={e.id} role="option" id={optionId(e.id)} aria-selected={isActive}>
                <Link
                  href={href}
                  prefetch={false}
                  onMouseEnter={() => { warm(); setActive(indexById.get(e.id) ?? 0) }}
                  onFocus={warm}
                  onClick={() => remember(query)}
                  className={`flex items-baseline gap-2 rounded-lg px-3 py-2 ${isActive ? 'bg-black/5' : 'hover:bg-black/5'}`}
                >
                  <span className="font-medium">{e.headword}</span>
                  <Ipa value={e.ipa} lang={e.lang} className="text-xs text-black/40" />
                  {e.glossVi && <span className="text-sm text-black/60">{e.glossVi}</span>}
                  <LinkPending />
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
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={total > 0}
        aria-controls="dictionary-search-results"
        aria-activedescendant={activeId}
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
      {/* The only role="status" text on the page: screen readers get result counts
          from here alone. */}
      <p role="status" aria-live="polite" className="sr-only">
        {loading
          ? 'Đang tìm…'
          : refused
            ? BUSY_MESSAGE
            : query.trim()
              ? `${total} kết quả cho "${query.trim()}"`
              : ''}
      </p>
      {loading && <p className="text-sm text-black/40">Đang tìm…</p>}
      {!loading && refused && <p className="text-sm text-black/40">{BUSY_MESSAGE}</p>}
      {showNoResults && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-black/40">Không tìm thấy kết quả.</p>
          <AiSuggest query={query.trim()} />
        </div>
      )}
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
                {s.headword}
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
      <div id="dictionary-search-results" role="listbox" aria-label="Kết quả tra cứu" className="flex flex-col gap-3">
        {reverseLeads && hasReverse && order.map((l) => renderGroup(l, reverseShown[l], true))}
        {order.map((l) => renderGroup(l, forwardShown[l], false))}
        {!reverseLeads && hasReverse && order.map((l) => renderGroup(l, reverseShown[l], true))}
      </div>
    </div>
  )
}
