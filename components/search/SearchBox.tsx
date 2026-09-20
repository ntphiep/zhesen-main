'use client'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { entryPath } from '@/lib/dictionary/entryId'
import { LinkPending } from '@/components/ui/LinkPending'
import { AiSuggest } from './AiSuggest'
import { detectOrder, orderByBestMatch } from '@/lib/dictionary/detect'
import { pushRecent, readRecent, writeRecent } from '@/lib/dictionary/recent'
import { serverTargetsSnapshot, setTargets, subscribeTargets, targetsSnapshot, toggleTarget } from '@/lib/dictionary/targetLangs'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import { posGroups, splitPos, type PosGroup } from '@/lib/dictionary/pos'
import { Ipa } from '@/components/ui/Ipa'
import { PosTag } from '@/components/ui/PosTag'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import { bestScore, EMPTY_SEARCH_RESPONSE, type SearchResponse } from '@/lib/dictionary/response'
import { fetchSearch, searchQueryString } from '@/lib/dictionary/searchClient'
import { LANG_CODES, type LangCode } from '@/lib/languages'

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
 *
 * `direction="reverse"` is the Vietnamese-first page: the query is Vietnamese because the
 * page says so, so no forward search runs and no detection decides anything.
 */
export function SearchBox({ initialQuery = '', autoFocus = false, lang, direction = 'both' }: {
  initialQuery?: string
  autoFocus?: boolean
  lang?: LangCode
  direction?: 'both' | 'reverse'
}) {
  const reverseOnly = direction === 'reverse'
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
  // Not lazy state the way `recent` does it: that value renders before hydration, and a
  // stored choice differing from the server's pass is React #418 on the summary text.
  const targets = useSyncExternalStore(subscribeTargets, targetsSnapshot, serverTargetsSnapshot)
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
    const opts = { langs: targets, direction } as const
    const key = searchQueryString(q.toLowerCase(), opts)
    const ctrl = new AbortController()
    let id: ReturnType<typeof setTimeout> | undefined
    async function run() {
      const cached = cache.current.get(key)
      if (cached) { setData(cached); setLoading(false); return }
      setLoading(true)
      id = setTimeout(async () => {
        try {
          const outcome = await fetchSearch(q, ctrl.signal, opts)
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
  }, [query, targets, direction])

  const forward = data.forward
  const reverse = data.reverse
  const order = useMemo(() => {
    if (lang) return [lang]
    // The Vietnamese-first page has nothing to detect: the query is Vietnamese, and the
    // groups are target languages, so they keep their own order.
    const picked = (reverseOnly ? LANG_CODES : detectOrder(query)).filter((l) => targets.includes(l))
    return reverseOnly ? picked : orderByBestMatch(picked, forward, reverse)
  }, [query, lang, targets, reverseOnly, forward, reverse])
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
    const byKey = new Map<string, PosGroup>()
    for (const e of allShown) {
      for (const g of posGroups(splitPos(e.pos))) byKey.set(g.key, g)
    }
    return [...byKey.values()]
  }, [allShown])

  const matches = useMemo(
    () => (e: DictEntryPreview) =>
      (!levelFilter || e.level === levelFilter) &&
      (!posFilter || posGroups(splitPos(e.pos)).some((g) => g.key === posFilter)),
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

  function chooseTarget(l: LangCode) {
    setTargets(toggleTarget(targets, l))
  }
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
  // On the Vietnamese-first page every group is a translation from Vietnamese, so saying
  // so on each one is noise; on the mixed page it is the only thing telling them apart.
  const groupLabel = (l: LangCode, reversed: boolean) =>
    reversed && !reverseOnly ? `${LANG_LABELS[l]}, dịch từ tiếng Việt` : LANG_LABELS[l]

  function renderGroup(lang: LangCode, entries: DictEntryPreview[], reversed: boolean) {
    if (entries.length === 0) return null
    return (
      <div key={`${reversed ? 'rev' : 'fwd'}-${lang}`} className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-black/40" aria-hidden="true">
          {LANG_LABELS[lang]}
          {reversed && !reverseOnly && (
            <span className="ml-1 normal-case text-black/30">· dịch từ tiếng Việt</span>
          )}
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
                  <PosTag value={e.pos} className="text-xs text-black/45" />
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

  const allTargets = targets.length === LANG_CODES.length

  return (
    <div className="relative flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
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
          placeholder={reverseOnly
            ? 'Nhập từ tiếng Việt...'
            : 'Nhập từ cần tra (Anh · Trung · Tây Ban Nha · Việt)...'}
          className="w-full rounded-xl border border-black/15 px-4 py-3 text-base shadow-sm focus:border-black/40 focus:outline-none sm:flex-1"
        />
        {/* A native disclosure, so the list opens and closes with no state and no outside-click
            handler, and the summary stays keyboard-reachable. `lang` means the caller already
            fixed the language, and the control would contradict it. */}
        {!lang && (
          <details className="relative shrink-0">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-black/15 px-4 py-3 text-sm shadow-sm hover:bg-black/5">
              <span className="text-black/60">Dịch sang</span>
              <span className="font-medium">
                {allTargets ? 'Tất cả' : targets.map((l) => LANG_LABELS[l]).join(', ')}
              </span>
            </summary>
            <fieldset className="absolute right-0 z-20 mt-1 flex min-w-56 flex-col gap-1 rounded-xl border border-black/15 bg-white p-2 shadow-lg">
              <legend className="sr-only">Ngôn ngữ cần dịch sang</legend>
              {LANG_CODES.map((l) => (
                <label key={l} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-black/5">
                  <input
                    type="checkbox"
                    name="target-lang"
                    value={l}
                    checked={targets.includes(l)}
                    onChange={() => chooseTarget(l)}
                    className="size-4"
                  />
                  {LANG_LABELS[l]}
                </label>
              ))}
            </fieldset>
          </details>
        )}
      </div>
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
          {posOptions.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setPosFilter((cur) => (cur === g.key ? null : g.key))}
              aria-pressed={posFilter === g.key}
              aria-label={g.labelVi}
              className={`rounded-full px-2.5 py-1 font-medium ${posFilter === g.key ? 'bg-black text-white' : 'bg-black/5 text-black/60 hover:bg-black/10'}`}
            >
              {g.abbr}
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
