'use client'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { entryPath } from '@/lib/dictionary/entryId'
import { LinkPending } from '@/components/ui/LinkPending'
import { Ipa } from '@/components/ui/Ipa'
import { PosTag } from '@/components/ui/PosTag'
import { detectOrder, orderByBestMatch } from '@/lib/dictionary/detect'
import { recentEntries, recentQueries } from '@/lib/dictionary/recent'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import { posGroups, splitPos, type PosGroup } from '@/lib/dictionary/pos'
import { sourceLangs, targetLangs, toggleTarget } from '@/lib/dictionary/targetLangs'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import { EMPTY_SEARCH_RESPONSE, type SearchResponse } from '@/lib/dictionary/response'
import { fetchSearch, searchQueryString } from '@/lib/dictionary/searchClient'
import type { Direction } from '@/lib/dictionary/search'
import { LANG_CODES, type LangCode } from '@/lib/languages'
import { PassageBlock, looksLikeAPassage } from './PassageBlock'
import { ErrorLine } from './ErrorLine'
import { AiSuggest } from './AiSuggest'
import s from './Lookup.module.css'

/** One entry per prefix typed, not per word, so the map fills fast. */
const CACHE_LIMIT = 100
/** CEFR order. Only en rows carry a level; a value outside this list renders after these. */
const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

/**
 * One direction of the lookup: a text box and the answers to what is in it.
 *
 * The page mounts two of these side by side, one per direction, because nothing in a
 * Vietnamese word tells it apart from an English or Spanish one. "an", "ban" and "con" are
 * real headwords in both, and the previous single box, which guessed, answered "cá" with
 * ca, can and called. The box the learner types in is the answer, and it costs one round
 * trip instead of two.
 */
export function LookupPanel({ direction, label, autoFocus = false, initialQuery = '', lang }: {
  direction: Direction
  label: string
  autoFocus?: boolean
  initialQuery?: string
  /** The caller already fixed the language, so the target control would contradict it. */
  lang?: LangCode
}) {
  const [query, setQuery] = useState(initialQuery)
  const [data, setData] = useState<SearchResponse>(EMPTY_SEARCH_RESPONSE)
  // Which request `data` answers. "Không tìm thấy từ nào" is a claim about the dictionary,
  // so it may only be made once the answer on screen is the answer to what is in the box:
  // without this it flashed during the debounce and whenever a cached shorter prefix with
  // no hits was still on screen.
  const [dataKey, setDataKey] = useState('')
  const [loading, setLoading] = useState(false)
  // The route answered with a status rather than a result set, or the request threw, so
  // "không tìm thấy" would be a claim about a dictionary that was never asked. Holds the
  // route's own wording, because a rate limit and a cold database are different things.
  const [refusal, setRefusal] = useState<string | null>(null)
  // Bumped by "Thử lại" to reissue the same query; neither failure is cached.
  const [attempt, setAttempt] = useState(0)
  const [levelFilter, setLevelFilter] = useState<string | null>(null)
  const [posFilter, setPosFilter] = useState<string | null>(null)
  // One store per direction: the Vietnamese box picks what to translate into, the foreign
  // box picks what to search in, and a shared key would tie the two controls together.
  // Read through useSyncExternalStore, like every other stored preference here: a lazy
  // `useState` initializer renders storage on the first client pass while the server
  // rendered nothing, which is React #418.
  const store = direction === 'vi' ? targetLangs : sourceLangs
  const stored = useSyncExternalStore(store.subscribe, store.snapshot, store.serverSnapshot)
  const recent = useSyncExternalStore(
    recentQueries.subscribe, recentQueries.snapshot, recentQueries.serverSnapshot,
  )
  const cache = useRef(new Map<string, SearchResponse>())
  const router = useRouter()

  const targets = useMemo(() => (lang ? [lang] : stored), [lang, stored])

  // Adjust state during render, not in an effect:
  // react.dev/learn/you-might-not-need-an-effect
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    setLevelFilter(null)
    setPosFilter(null)
    // A passage is answered by PassageBlock, so the word search is cleared rather than
    // left holding the hits for the last prefix that was still one word.
    const next = query.trim()
    if (!next || looksLikeAPassage(next, direction)) {
      setData(EMPTY_SEARCH_RESPONSE); setDataKey(''); setLoading(false); setRefusal(null)
    }
  }

  const trimmed = query.trim()
  const isPassage = trimmed.length > 0 && looksLikeAPassage(trimmed, direction)

  // A whole sentence has no headword to look up: `lex.search_vi` scores every gloss term
  // in it and answers unrelated words after seconds, and on production the route answered
  // 503 for one. PassageBlock translates it, and in the foreign direction resolves each
  // word through `POST /dictionary/text/lookup`.
  useEffect(() => {
    if (!trimmed || isPassage) return
    const opts = { langs: targets, dir: direction } as const
    const key = searchQueryString(trimmed.toLowerCase(), opts)
    const ctrl = new AbortController()
    let id: ReturnType<typeof setTimeout> | undefined
    // A ref cannot be read during render, so the cache lookup lives here. Inside a
    // function, not in the effect body: react-hooks/set-state-in-effect forbids the
    // synchronous form, and a cache hit still answers within one microtask.
    async function run() {
      const cached = cache.current.get(key)
      if (cached) { setData(cached); setDataKey(key); setLoading(false); setRefusal(null); return }
      setLoading(true)
      setRefusal(null)
      id = setTimeout(async () => {
        try {
          const outcome = await fetchSearch(trimmed, ctrl.signal, opts)
          // A refusal body is not a result set; caching it would replay the refusal on
          // every later keystroke.
          if (outcome.status === 'refused') {
            setRefusal(outcome.message)
            setData(EMPTY_SEARCH_RESPONSE)
            setDataKey(key)
            return
          }
          // Map insertion order is age, so the first key is the oldest.
          if (cache.current.size >= CACHE_LIMIT) {
            const oldest = cache.current.keys().next()
            if (!oldest.done) cache.current.delete(oldest.value)
          }
          cache.current.set(key, outcome.data)
          setData(outcome.data)
          setDataKey(key)
        } catch (e) {
          if ((e as Error).name !== 'AbortError') {
            setRefusal('Chưa tra được.')
            setData(EMPTY_SEARCH_RESPONSE)
            setDataKey(key)
          }
        } finally {
          setLoading(false)
        }
      }, 200)
    }
    void run()
    return () => { if (id) clearTimeout(id); ctrl.abort() }
  }, [trimmed, isPassage, targets, direction, attempt])

  const entries = data.entries
  const translated = data.translated
  // The Vietnamese direction keeps the fixed language order: its columns are read side by
  // side, and one that moves between two queries is harder to read than a weak one. The
  // foreign direction leads with whichever language actually matched.
  const order = useMemo(
    () => (direction === 'vi'
      ? targets
      : orderByBestMatch(detectOrder(trimmed).filter((l) => targets.includes(l)), entries)),
    [direction, targets, trimmed, entries],
  )

  const allShown = useMemo(
    () => order.flatMap((l) => [...entries[l], ...(translated?.[l]?.entries ?? [])]),
    [order, entries, translated],
  )
  const levelOptions = useMemo(() => {
    const present = new Set(allShown.map((e) => e.level).filter((l): l is string => !!l))
    const ordered = LEVEL_ORDER.filter((l) => present.has(l))
    return [...ordered, ...[...present].filter((l) => !LEVEL_ORDER.includes(l)).sort()]
  }, [allShown])
  const posOptions = useMemo(() => {
    const byKey = new Map<string, PosGroup>()
    for (const e of allShown) for (const g of posGroups(splitPos(e.pos))) byKey.set(g.key, g)
    return [...byKey.values()]
  }, [allShown])

  const shown = useMemo(() => {
    const keep = (e: DictEntryPreview) =>
      (!levelFilter || e.level === levelFilter)
      && (!posFilter || posGroups(splitPos(e.pos)).some((g) => g.key === posFilter))
    return order.map((l) => [l, entries[l].filter(keep), (translated?.[l]?.entries ?? []).filter(keep)] as const)
  }, [order, entries, translated, levelFilter, posFilter])
  const total = shown.reduce((n, [, list, more]) => n + list.length + more.length, 0)
  const first = shown.flatMap(([, list, more]) => [...list, ...more])[0]

  function remember(e: DictEntryPreview) {
    recentQueries.push(e.headword)
    // The query goes in the box's own "Tra gần đây" row; the word goes in the strip under
    // the boxes, which links back to the word page rather than refilling the box.
    recentEntries.record({ id: e.id, headword: e.headword, lang: e.lang, glossVi: e.glossVi ?? null })
  }

  // `prefetch={false}` on every result, then one prefetch when a result is pointed at.
  // Link's own prefetch fires as soon as a link enters the viewport, and a keystroke here
  // can put twenty-four of them there at once, which would fetch twenty-four entry pages
  // to open one. Hover and keyboard focus are the two signals that one of them is about
  // to be opened, and the entry page is static, so the prefetch is a CDN read.
  const prefetched = useRef(new Set<string>())
  function warm(id: string) {
    const href = entryPath(id)
    if (prefetched.current.has(href)) return
    prefetched.current.add(href)
    router.prefetch(href)
  }
  // Enter opens the top hit, as it did when the box was an `<input>`. Shift+Enter and a
  // passage both fall through to the textarea's own behaviour, because a paragraph needs
  // its line breaks and has no single word to open.
  function onKeyDown(ev: React.KeyboardEvent) {
    if (ev.key !== 'Enter' || ev.shiftKey || isPassage || !first) return
    ev.preventDefault()
    remember(first)
    router.push(entryPath(first.id))
  }

  // Shown whenever the box is empty, not only while it holds focus. Tied to focus the row
  // appeared and vanished on every click anywhere on the page, moving everything under it.
  const showRecent = !trimmed && recent.length > 0
  // A whole sentence has no single headword, so neither a trigram suggestion nor the
  // assistant has anything to add to the translation PassageBlock already shows.
  const answered = dataKey === searchQueryString(trimmed.toLowerCase(), { langs: targets, dir: direction })
  const showEmpty =
    answered && !loading && !refusal && !isPassage && trimmed.length > 0 && allShown.length === 0
  const showFilteredEmpty = !loading && allShown.length > 0 && total === 0
  const inputId = `lookup-${direction}`

  function renderRow(e: DictEntryPreview) {
    return (
      <li key={e.id}>
        <Link
          href={entryPath(e.id)}
          prefetch={false}
          onClick={() => remember(e)}
          onMouseEnter={() => warm(e.id)}
          onFocus={() => warm(e.id)}
          onTouchStart={() => warm(e.id)}
          className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl px-3 py-2 transition-colors duration-150 ease-std hover:bg-(--zs-bg)"
        >
          <span data-hw="" lang={e.lang} className="text-[1.1875rem] leading-snug">{e.headword}</span>
          <Ipa value={e.ipa} lang={e.lang} className="text-xs text-(--zs-soft)" />
          {e.level && (
            <span className="rounded-full border-[1.5px] border-current px-1.5 py-px text-[0.6875rem] font-semibold text-(--zs-soft)">
              {e.level}
            </span>
          )}
          <PosTag value={e.pos} className="text-xs text-(--zs-soft)" />
          {e.glossVi && <span className="text-[0.9375rem] font-semibold">{e.glossVi}</span>}
          <LinkPending />
        </Link>
      </li>
    )
  }

  /** One language card. Every hit is set the same size: the ranking already says which is
   *  the best answer, and drawing the first one twice as large made a weak top hit look
   *  authoritative. An empty language in the Vietnamese direction says so rather than
   *  disappearing: a missing card next to two full ones reads as a bug, where
   *  "chưa có từ khớp" is the truth. */
  function renderCard(l: LangCode, list: DictEntryPreview[], more: DictEntryPreview[]) {
    if (list.length === 0 && more.length === 0 && direction !== 'vi') return null
    return (
      <section key={l} data-l={l} className={`${s.pane} px-2 pt-3 pb-2`}>
        <h3 className="px-3 text-xs font-bold tracking-[0.02em] text-(--zs-soft)">
          {LANG_LABELS[l]}
        </h3>
        {list.length > 0 && <ul className="mt-1 flex flex-col gap-0.5">{list.map(renderRow)}</ul>}
        {more.length > 0 && (
          <>
            {/* Found through the machine translation of the query, not a Vietnamese
                meaning in the dictionary, so it says which translation it came from. */}
            <p className={`mx-3 pt-2 text-xs text-(--zs-soft) ${list.length > 0 ? 'mt-1 border-t-[1.5px] border-(--edge)' : ''}`}>
              Dịch máy: {translated?.[l]?.text}
            </p>
            <ul className="flex flex-col gap-0.5">{more.map(renderRow)}</ul>
          </>
        )}
        {list.length === 0 && more.length === 0 && (
          <p className="px-3 pt-1.5 pb-1 text-sm text-(--zs-soft)">Chưa có từ khớp</p>
        )}
      </section>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <label htmlFor={inputId} className="text-[0.9375rem] font-bold text-(--zs-ink)">{label}</label>
      {/* A textarea rather than an input, because the same box takes a word and a
          paragraph, and tall enough that a pasted paragraph is readable without scrolling
          it. No placeholder: the label above already names the direction, and a sentence
          of grey text inside every box was the first thing on the page. */}
      <textarea
        id={inputId}
        name={`q-${direction}`}
        rows={3}
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
        className={`${s.box} min-h-[13rem] w-full resize-y px-5 py-4 text-[1.3125rem] leading-normal font-medium lg:min-h-[16rem]`}
      />

      {/* A joined segmented control, not the rounded chips the rest of this panel uses for
          one-tap suggestions: this one sets state that persists, and drawing the two the
          same way made a filter look like a shortcut. */}
      {!lang && (
        <fieldset className="flex flex-wrap items-center gap-2 border-0 p-0">
          <legend className="sr-only">
            {direction === 'vi' ? 'Ngôn ngữ cần dịch sang' : 'Ngôn ngữ cần tìm'}
          </legend>
          <span aria-hidden className="text-xs font-bold tracking-[0.02em] text-(--zs-soft)">
            {direction === 'vi' ? 'Dịch sang' : 'Tìm trong'}
          </span>
          <div className={`${s.seg} inline-flex rounded-lg border-[1.5px] border-(--edge)`}>
            {LANG_CODES.map((l, i) => {
              const on = stored.includes(l)
              return (
              <label
                key={l}
                // The divider is the page colour on a selected segment: with all three on,
                // one border colour made the control read as a single wide button.
                className={`cursor-pointer px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ease-std ${
                  i > 0 ? (on ? 'border-l-[1.5px] border-(--zs-bg)' : 'border-l-[1.5px] border-(--edge)') : ''
                } ${on ? 'bg-(--zs-btn) text-(--zs-btn-ink) hover:bg-(--zs-btn-hover)' : 'bg-(--zs-bg) text-(--zs-soft) hover:bg-(--tint-1)'}`}
              >
                <input
                  type="checkbox"
                  name={`${direction}-lang`}
                  value={l}
                  checked={on}
                  onChange={() => store.set(toggleTarget(stored, l))}
                  className="sr-only"
                />
                {LANG_LABELS[l]}
              </label>
              )
            })}
          </div>
        </fieldset>
      )}

      {showRecent && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold tracking-[0.02em] text-(--zs-soft)">Tra gần đây</span>
          {recent.map((r) => (
            <button
              key={r}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setQuery(r) }}
              className={`${s.chip} px-3 py-1 text-sm`}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {isPassage && <PassageBlock text={trimmed} direction={direction} targets={targets} />}

      {loading && <p className="text-sm text-(--zs-soft)">Đang dịch…</p>}
      {refusal && (
        <div className="flex items-center gap-3">
          <ErrorLine>{refusal}</ErrorLine>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className={`${s.chip} px-3 py-1 text-sm font-semibold`}
          >
            Thử lại
          </button>
        </div>
      )}

      {total > 0 && (
        <div className="flex flex-col gap-3">{shown.map(([l, list, more]) => renderCard(l, list, more))}</div>
      )}
      {showFilteredEmpty && <p className="text-sm text-(--zs-soft)">Không có từ nào khớp bộ lọc. Đổi bộ lọc.</p>}

      {showEmpty && (
        data.suggestions.length > 0
          ? (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold tracking-[0.02em] text-(--zs-soft)">Có phải là</span>
              <div className="flex flex-wrap gap-2">
                {data.suggestions.map((w) => (
                  <Link
                    key={w.id}
                    href={entryPath(w.id)}
                    prefetch={false}
                    className={`${s.chip} px-3 py-1.5 text-sm`}
                  >
                    <span data-hw="" lang={w.lang} className="text-base">{w.headword}</span>
                    {w.glossVi && <span className="text-(--zs-soft)">{w.glossVi}</span>}
                    <LinkPending />
                  </Link>
                ))}
              </div>
            </div>
          )
          : <p className="text-sm text-(--zs-soft)">Không tìm thấy từ nào.</p>
      )}
      {/* Renders nothing where `aiConfig()` is null, which is every deployment that
          cannot reach the router. */}
      {showEmpty && <AiSuggest query={trimmed} />}

      {/* Below the results, because a filter is only worth reading once there is something
          to filter, and the chips depend on what came back. */}
      {(levelOptions.length > 0 || posOptions.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold tracking-[0.02em] text-(--zs-soft)">Lọc</span>
          {levelOptions.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={levelFilter === l}
              onClick={() => setLevelFilter(levelFilter === l ? null : l)}
              className={`${s.chip} px-3 py-1 text-xs ${levelFilter === l ? 'font-bold' : 'font-medium'}`}
            >
              {l}
            </button>
          ))}
          {posOptions.map((g) => (
            <button
              key={g.key}
              type="button"
              aria-pressed={posFilter === g.key}
              onClick={() => setPosFilter(posFilter === g.key ? null : g.key)}
              className={`${s.chip} px-3 py-1 text-xs ${posFilter === g.key ? 'font-bold' : 'font-medium'}`}
            >
              {g.labelVi}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
