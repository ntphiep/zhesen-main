'use client'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { entryPath } from '@/lib/dictionary/entryId'
import { LinkPending } from '@/components/ui/LinkPending'
import { Ipa } from '@/components/ui/Ipa'
import { PosTag } from '@/components/ui/PosTag'
import { detectOrder, orderByBestMatch } from '@/lib/dictionary/detect'
import { pushRecent, readRecent, writeRecent } from '@/lib/dictionary/recent'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import { posGroups, splitPos, type PosGroup } from '@/lib/dictionary/pos'
import {
  serverTargetsSnapshot, setTargets, subscribeTargets, targetsSnapshot, toggleTarget,
} from '@/lib/dictionary/targetLangs'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import { EMPTY_SEARCH_RESPONSE, type SearchResponse } from '@/lib/dictionary/response'
import { fetchSearch, searchQueryString } from '@/lib/dictionary/searchClient'
import type { Direction } from '@/lib/dictionary/search'
import { LANG_CODES, type LangCode } from '@/lib/languages'
import { PassageBlock, looksLikeAPassage } from './PassageBlock'
import { AiSuggest } from './AiSuggest'

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
export function LookupPanel({ direction, label, placeholder, hint, autoFocus = false, initialQuery = '', lang }: {
  direction: Direction
  label: string
  placeholder: string
  hint?: string
  autoFocus?: boolean
  initialQuery?: string
  /** The caller already fixed the language, so the target control would contradict it. */
  lang?: LangCode
}) {
  const [query, setQuery] = useState(initialQuery)
  const [data, setData] = useState<SearchResponse>(EMPTY_SEARCH_RESPONSE)
  const [loading, setLoading] = useState(false)
  // The route answered with a status rather than a result set, so "không tìm thấy" would
  // be a claim about a dictionary that was never asked. Holds the route's own wording,
  // because a rate limit and a cold database are different things to be told.
  const [refusal, setRefusal] = useState<string | null>(null)
  const [levelFilter, setLevelFilter] = useState<string | null>(null)
  const [posFilter, setPosFilter] = useState<string | null>(null)
  // readRecent must stay SSR-guarded: this lazy initializer also runs in the server pass.
  const [recent, setRecent] = useState<string[]>(readRecent)
  const [focused, setFocused] = useState(false)
  // Not lazy state the way `recent` is: that value renders before hydration, and a stored
  // choice differing from the server's pass is React #418 on the summary text.
  const stored = useSyncExternalStore(subscribeTargets, targetsSnapshot, serverTargetsSnapshot)
  const cache = useRef(new Map<string, SearchResponse>())
  const router = useRouter()

  // The target control belongs to the Vietnamese direction only. Typing a foreign word
  // asks about that word, and which language it is written in is not the learner's choice.
  const targets = useMemo(
    () => (lang ? [lang] : direction === 'vi' ? stored : [...LANG_CODES]),
    [lang, direction, stored],
  )

  // Adjust state during render, not in an effect:
  // react.dev/learn/you-might-not-need-an-effect
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    setLevelFilter(null)
    setPosFilter(null)
    if (!query.trim()) { setData(EMPTY_SEARCH_RESPONSE); setLoading(false); setRefusal(null) }
  }

  const trimmed = query.trim()
  const isPassage = trimmed.length > 0 && looksLikeAPassage(trimmed, direction)

  useEffect(() => {
    if (!trimmed) return
    const opts = { langs: targets, dir: direction } as const
    const key = searchQueryString(trimmed.toLowerCase(), opts)
    const ctrl = new AbortController()
    let id: ReturnType<typeof setTimeout> | undefined
    // A ref cannot be read during render, so the cache lookup lives here. Inside a
    // function, not in the effect body: react-hooks/set-state-in-effect forbids the
    // synchronous form, and a cache hit still answers within one microtask.
    async function run() {
      const cached = cache.current.get(key)
      if (cached) { setData(cached); setLoading(false); return }
      setLoading(true)
      id = setTimeout(async () => {
        try {
          const outcome = await fetchSearch(trimmed, ctrl.signal, opts)
          // A refusal body is not a result set; caching it would replay the refusal on
          // every later keystroke.
          if (outcome.status === 'refused') {
            setRefusal(outcome.message)
            setData(EMPTY_SEARCH_RESPONSE)
            return
          }
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
    void run()
    return () => { if (id) clearTimeout(id); ctrl.abort() }
  }, [trimmed, targets, direction])

  const entries = data.entries
  // The Vietnamese direction keeps the fixed language order: its columns are read side by
  // side, and one that moves between two queries is harder to read than a weak one. The
  // foreign direction leads with whichever language actually matched.
  const order = useMemo(
    () => (direction === 'vi'
      ? targets
      : orderByBestMatch(detectOrder(trimmed).filter((l) => targets.includes(l)), entries)),
    [direction, targets, trimmed, entries],
  )

  const allShown = useMemo(() => order.flatMap((l) => entries[l]), [order, entries])
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
    return order.map((l) => [l, entries[l].filter(keep)] as const)
  }, [order, entries, levelFilter, posFilter])
  const total = shown.reduce((n, [, list]) => n + list.length, 0)
  const first = shown.flatMap(([, list]) => list)[0]

  function remember(e: DictEntryPreview) {
    const next = pushRecent(recent, e.headword)
    setRecent(next)
    writeRecent(next)
  }
  function onKeyDown(ev: React.KeyboardEvent) {
    if (ev.key !== 'Enter' || !first) return
    ev.preventDefault()
    remember(first)
    router.push(entryPath(first.id))
  }

  const showRecent = focused && !trimmed && recent.length > 0
  // A whole sentence has no single headword, so neither a trigram suggestion nor the
  // assistant has anything to add to the translation PassageBlock already shows.
  const showEmpty =
    !loading && !refusal && !isPassage && trimmed.length > 0 && allShown.length === 0
  const showFilteredEmpty = !loading && allShown.length > 0 && total === 0
  const inputId = `lookup-${direction}`

  function renderRow(e: DictEntryPreview) {
    return (
      <li key={e.id}>
        <Link
          href={entryPath(e.id)}
          prefetch={false}
          onClick={() => remember(e)}
          className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg px-3 py-2 hover:bg-black/5"
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

  /** One language card. The first hit is set above the rest, because a lookup asks for one
   *  answer and the others are alternatives to it. An empty language in the Vietnamese
   *  direction says so rather than disappearing: a missing card next to two full ones
   *  reads as a bug, where "chưa có từ khớp" is the truth. */
  function renderCard(l: LangCode, list: DictEntryPreview[]) {
    if (list.length === 0 && direction !== 'vi') return null
    const [lead, ...rest] = list
    return (
      <section key={l} className="overflow-hidden rounded-xl border border-black/10">
        <h3 className="border-b border-black/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-black/55">
          {LANG_LABELS[l]}
        </h3>
        {!lead
          ? <p className="px-4 py-3 text-sm text-black/35">Chưa có từ khớp</p>
          : (
            <>
              <Link
                href={entryPath(lead.id)}
                prefetch={false}
                onClick={() => remember(lead)}
                className="flex flex-col gap-1 border-b border-black/5 px-4 py-3 hover:bg-black/5"
              >
                <span className="flex flex-wrap items-baseline gap-2">
                  <span className="text-2xl font-semibold">{lead.headword}</span>
                  <Ipa value={lead.ipa} lang={lead.lang} className="text-sm text-black/40" />
                  {lead.level && (
                    <span className="rounded-full border border-black/15 px-2 py-0.5 text-xs text-black/50">
                      {lead.level}
                    </span>
                  )}
                  <LinkPending />
                </span>
                <span className="flex flex-wrap items-baseline gap-2 text-sm text-black/60">
                  <PosTag value={lead.pos} className="text-xs text-black/45" />
                  {lead.glossVi}
                </span>
              </Link>
              {rest.length > 0 && <ul className="flex flex-col gap-0.5 py-1">{rest.map(renderRow)}</ul>}
            </>
          )}
      </section>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <label htmlFor={inputId} className="text-sm font-semibold">{label}</label>
      <input
        id={inputId}
        name={`q-${direction}`}
        type="text"
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-xl border border-black/15 px-4 py-3 text-base shadow-sm focus:border-black/40 focus:outline-none"
      />

      {direction === 'vi' && !lang && (
        <fieldset className="flex flex-wrap items-center gap-2 border-0 p-0">
          <legend className="sr-only">Ngôn ngữ cần dịch sang</legend>
          {LANG_CODES.map((l) => (
            <label
              key={l}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${
                stored.includes(l) ? 'border-black/40 bg-black/5 font-medium' : 'border-black/15 text-black/50'
              }`}
            >
              <input
                type="checkbox"
                name="target-lang"
                value={l}
                checked={stored.includes(l)}
                onChange={() => setTargets(toggleTarget(stored, l))}
                className="sr-only"
              />
              {LANG_LABELS[l]}
            </label>
          ))}
        </fieldset>
      )}
      {hint && <p className="text-xs text-black/40">{hint}</p>}

      {showRecent && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs uppercase tracking-wide text-black/40">Tìm gần đây</span>
          {recent.map((r) => (
            <button
              key={r}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setQuery(r) }}
              className="rounded-full border border-black/15 px-3 py-1 text-xs hover:bg-black/5"
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {isPassage && <PassageBlock text={trimmed} direction={direction} targets={targets} />}

      {loading && <p className="text-sm text-black/40">Đang tra…</p>}
      {refusal && <p className="text-sm text-red-600">{refusal}</p>}

      {total > 0 && (
        <div className="flex flex-col gap-3">{shown.map(([l, list]) => renderCard(l, list))}</div>
      )}
      {showFilteredEmpty && <p className="text-sm text-black/40">Không còn kết quả nào khớp bộ lọc.</p>}

      {showEmpty && (
        data.suggestions.length > 0
          ? (
            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-wide text-black/40">Có phải bạn tìm</span>
              <div className="flex flex-wrap gap-2">
                {data.suggestions.map((s) => (
                  <Link
                    key={s.id}
                    href={entryPath(s.id)}
                    prefetch={false}
                    className="rounded-full border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5"
                  >
                    <span className="font-medium">{s.headword}</span>
                    {s.glossVi && <span className="ml-2 text-black/50">{s.glossVi}</span>}
                    <LinkPending />
                  </Link>
                ))}
              </div>
            </div>
          )
          : <p className="text-sm text-black/40">Chưa tìm thấy từ nào.</p>
      )}
      {/* Renders nothing where `aiConfig()` is null, which is every deployment that
          cannot reach the router. */}
      {showEmpty && <AiSuggest query={trimmed} />}

      {/* Below the results, because a filter is only worth reading once there is something
          to filter, and the chips depend on what came back. */}
      {(levelOptions.length > 0 || posOptions.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-black/40">Lọc</span>
          {levelOptions.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={levelFilter === l}
              onClick={() => setLevelFilter(levelFilter === l ? null : l)}
              className={`rounded-full border px-3 py-1 text-xs ${
                levelFilter === l ? 'border-black/40 bg-black/5 font-medium' : 'border-black/15 text-black/50'
              }`}
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
              className={`rounded-full border px-3 py-1 text-xs ${
                posFilter === g.key ? 'border-black/40 bg-black/5 font-medium' : 'border-black/15 text-black/50'
              }`}
            >
              {g.labelVi}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
