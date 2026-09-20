'use client'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { entryPath } from '@/lib/dictionary/entryId'
import { LinkPending } from '@/components/ui/LinkPending'
import { AiSuggest } from './AiSuggest'
import { detectOrder, looksHan, orderByBestMatch } from '@/lib/dictionary/detect'
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
/** CEFR order. Only en rows carry a level (0 es/zh rows have one); a value outside
 * this list still renders, after these. */
const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

/** Written out because Tailwind reads class names from the source: `sm:grid-cols-${n}`
 *  produces no CSS. */
const COLUMNS: Record<number, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
}

/** Where the passage lookup is worth offering alongside the word lookup. Three words is
 *  the point at which one entry often stops being the answer, though "look forward to"
 *  and "hợp đồng lao động" are entries too, so this offers the passage rather than
 *  claiming the query is one. Han text carries no spaces, so it is counted in characters. */
function looksLikeAPassage(q: string): boolean {
  return looksHan(q) ? q.length >= 6 : q.split(/\s+/).length >= 3
}

/**
 * Auto-detecting, bidirectional search box over the cached /dictionary/search route:
 * forward (en/es/zh), plus the Vietnamese reverse lookup when the query looks Vietnamese
 * or the forward direction scored badly.
 *
 * The Vietnamese direction renders as one column per language rather than three stacked
 * lists, because the question it answers is "what is this word in each of them".
 */
export function SearchBox({ initialQuery = '', autoFocus = false, lang }: {
  initialQuery?: string
  autoFocus?: boolean
  lang?: LangCode
}) {
  const [query, setQuery] = useState(initialQuery)
  const [data, setData] = useState<SearchResponse>(EMPTY_SEARCH_RESPONSE)
  const [loading, setLoading] = useState(false)
  // The route answered with a status rather than a result set, so "Không tìm thấy kết
  // quả" would be a claim about a dictionary that was never asked. Holds the route's own
  // wording, because a rate limit and a cold database are different things to be told.
  const [refusal, setRefusal] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const [levelFilter, setLevelFilter] = useState<string | null>(null)
  const [posFilter, setPosFilter] = useState<string | null>(null)
  // readRecent must stay SSR-guarded: this lazy initializer also runs in the server pass.
  const [recent, setRecent] = useState<string[]>(readRecent)
  // Not lazy state the way `recent` does it: that value renders before hydration, and a
  // stored choice differing from the server's pass is React #418 on the summary text.
  const targets = useSyncExternalStore(subscribeTargets, targetsSnapshot, serverTargetsSnapshot)
  const [focused, setFocused] = useState(false)
  // The learner said the query is Vietnamese. Nothing in the text says so: "an", "ban"
  // and "con" are real English and Spanish headwords, so the forward search answers them
  // well enough to keep the Vietnamese direction from ever running.
  const [askVietnamese, setAskVietnamese] = useState(false)
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
    setAskVietnamese(false)
    if (!query.trim()) { setData(EMPTY_SEARCH_RESPONSE); setLoading(false); setRefusal(null) }
  }

  useEffect(() => {
    const q = query.trim()
    if (!q) return
    const opts = { langs: targets, vietnamese: askVietnamese } as const
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
          if (outcome.status === 'refused') { setRefusal(outcome.message); setData(EMPTY_SEARCH_RESPONSE); return }
          setRefusal(null)
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
  }, [query, targets, askVietnamese])

  const forward = data.forward
  const reverse = data.reverse
  const order = useMemo(() => {
    if (lang) return [lang]
    return orderByBestMatch(detectOrder(query).filter((l) => targets.includes(l)), forward, reverse)
  }, [query, lang, targets, forward, reverse])
  // The Vietnamese columns keep the fixed language order instead: they are read side by
  // side, so a column that moves between two queries is harder to read than a weak one.
  const columns = useMemo(
    () => (lang ? [lang] : LANG_CODES.filter((l) => targets.includes(l))),
    [lang, targets],
  )

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
  const hasReverse = columns.some((l) => reverseShown[l].length > 0)

  // The stronger direction leads: "con mèo" yields forward trigram guesses scoring
  // under 1.8, while the reverse lookup finds cat.
  const reverseLeads = useMemo(
    () => bestScore(reverseShown) > bestScore(forwardShown),
    [forwardShown, reverseShown],
  )

  // Flat list in display order, for keyboard navigation and Enter-to-open. The columns
  // lay out left to right, which is also their DOM order.
  const flat = useMemo(
    () => (reverseLeads
      ? [...columns.flatMap((l) => reverseShown[l]), ...order.flatMap((l) => forwardShown[l])]
      : [...order.flatMap((l) => forwardShown[l]), ...columns.flatMap((l) => reverseShown[l])]),
    [order, columns, forwardShown, reverseShown, reverseLeads],
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
  /** The word opened, not the text typed. Storing the query filled the list with the
   *  prefixes a result happened to be clicked on: gra, inten, forens. */
  function remember(e: DictEntryPreview) {
    const next = pushRecent(recent, e.headword)
    setRecent(next)
    writeRecent(next)
  }
  function open(e: DictEntryPreview) {
    remember(e)
    router.push(entryPath(e.id))
  }
  function onKeyDown(ev: React.KeyboardEvent) {
    if (total === 0) return
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive((i) => Math.min(i + 1, total - 1)) }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (ev.key === 'Enter') { ev.preventDefault(); open(flat[active] ?? flat[0]) }
  }

  const trimmed = query.trim()
  const showRecent = focused && !trimmed && recent.length > 0
  const showNoResults = !loading && !refusal && trimmed && allShown.length === 0 && data.suggestions.length === 0
  const showSuggestions = !loading && !refusal && trimmed && allShown.length === 0 && data.suggestions.length > 0
  const showFilteredEmpty = !loading && trimmed && allShown.length > 0 && total === 0
  const showPassageLink = trimmed.length > 0 && looksLikeAPassage(trimmed)
  // Offered only where it can help: Vietnamese is written in Latin script, and the
  // lookup already ran by itself if it had anything to say.
  const offerVietnamese = trimmed.length > 0 && !loading && !refusal && !askVietnamese
    && !looksHan(trimmed) && !hasReverse
  // Once asked, the answer shows even when it is empty: the question deserves a reply.
  const showReverse = hasReverse || (askVietnamese && !loading && !refusal)

  // ARIA combobox pattern: w3.org/WAI/ARIA/apg/patterns/combobox. `aria-activedescendant`
  // is what announces the highlighted row; `aria-selected` alone announces nothing.
  const optionId = (entryId: string) => `search-option-${entryId.replace(/[^\w-]/g, '_')}`
  const activeId = flat[active] ? optionId(flat[active].id) : undefined

  function renderRow(e: DictEntryPreview) {
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
          onClick={() => remember(e)}
          className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg px-3 py-2 ${isActive ? 'bg-black/5' : 'hover:bg-black/5'}`}
        >
          <span className="font-medium">{e.headword}</span>
          <Ipa value={e.ipa} lang={e.lang} className="text-xs text-black/40" />
          <PosTag value={e.pos} className="text-xs text-black/45" />
          {e.glossVi && <span className="text-sm text-black/60">{e.glossVi}</span>}
          <LinkPending />
        </Link>
      </li>
    )
  }

  function renderGroup(lang: LangCode, entries: DictEntryPreview[]) {
    if (entries.length === 0) return null
    return (
      <div key={`fwd-${lang}`} className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-black/40" aria-hidden="true">
          {LANG_LABELS[lang]}
        </span>
        {/* Carries the language name the heading shows visually, so a listbox reader
            hears which language a row belongs to. */}
        <ul role="group" aria-label={LANG_LABELS[lang]} className="flex flex-col gap-0.5">
          {entries.map(renderRow)}
        </ul>
      </div>
    )
  }

  /** One column of the Vietnamese direction. A language with nothing says so rather than
   *  disappearing, because a missing column reads as a bug next to two full ones. Below
   *  the grid breakpoint the columns stack, where an empty one is no longer a gap in a
   *  row but two lines of nothing between the answers, so there it is dropped. */
  function renderColumn(lang: LangCode, entries: DictEntryPreview[]) {
    return (
      <div key={`rev-${lang}`} className={`flex-col gap-1 ${entries.length === 0 ? 'hidden sm:flex' : 'flex'}`}>
        <span className="text-xs font-semibold uppercase tracking-wide text-black/40" aria-hidden="true">
          {LANG_LABELS[lang]}
        </span>
        {entries.length === 0
          ? <p className="px-3 py-2 text-sm text-black/35">Chưa có từ khớp</p>
          : (
            // The heading below is not part of the listbox, which reads only options and
            // groups, so the group label is what carries the direction to a reader.
            <ul role="group" aria-label={`${LANG_LABELS[lang]}, dịch từ tiếng Việt`} className="flex flex-col gap-0.5">
              {entries.map(renderRow)}
            </ul>
          )}
      </div>
    )
  }

  const reverseBlock = showReverse && (
    <section className="flex flex-col gap-2">
      <h2 aria-hidden="true" className="text-xs font-semibold uppercase tracking-wide text-black/55">Dịch từ tiếng Việt</h2>
      <div className={`grid gap-x-6 gap-y-4 ${COLUMNS[columns.length] ?? 'sm:grid-cols-3'}`}>
        {columns.map((l) => renderColumn(l, reverseShown[l]))}
      </div>
    </section>
  )

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
          placeholder="Nhập từ cần tra (Anh · Trung · Tây Ban Nha · Việt)..."
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
      {/* The passage lookup is the same task one size up, so it is offered where the
          learner already is rather than from a menu item of its own. */}
      {showPassageLink && (
        <p className="text-sm text-black/60">
          <Link href={`/dictionary/text?q=${encodeURIComponent(trimmed)}`} prefetch={false} className="font-medium underline underline-offset-2">
            Tra từng từ trong cả đoạn
          </Link>
        </p>
      )}
      {offerVietnamese && (
        <p className="text-sm text-black/60">
          <button
            type="button"
            onClick={() => setAskVietnamese(true)}
            className="font-medium underline underline-offset-2 hover:text-black"
          >
            Tra &quot;{trimmed}&quot; như tiếng Việt
          </button>
        </p>
      )}
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
          : refusal
            ? refusal
            : trimmed
              ? `${total} kết quả cho "${trimmed}"`
              : ''}
      </p>
      {loading && <p className="text-sm text-black/40">Đang tìm…</p>}
      {!loading && refusal && <p className="text-sm text-black/40">{refusal}</p>}
      {showNoResults && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-black/40">Không tìm thấy kết quả.</p>
          <AiSuggest query={trimmed} />
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
      <div id="dictionary-search-results" role="listbox" aria-label="Kết quả tra cứu" className="flex flex-col gap-4">
        {reverseLeads && reverseBlock}
        {order.map((l) => renderGroup(l, forwardShown[l]))}
        {!reverseLeads && reverseBlock}
      </div>
    </div>
  )
}
