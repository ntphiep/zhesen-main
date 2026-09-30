'use client'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { tokenize, type Segment } from '@/lib/reader/tokenize'
import { WordPopover } from './WordPopover'
import type { ResolvedText } from '@/lib/dictionary/tappable'
import type { DictEntryPreview, CharInfo } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'
import { loadSupabaseClient } from '@/lib/supabase/loadClient'
import r from './Reader.module.css'

/** A pseudo-element 24 px tall that reaches half a space to each side, so a tap between
 *  two words lands on the nearer one and never on the neighbour's letters. A word stays
 *  narrower than 24 px: WCAG 2.5.8 exempts targets inside a sentence. Not for Chinese,
 *  where words touch. */
const HIT_AREA = 'relative before:absolute before:inset-x-[-0.125em] before:top-1/2 before:h-full before:min-h-6 '
  + 'before:-translate-y-1/2'

/** Room kept between the popover and the edge of the viewport. */
const GUTTER = 12

/** The popover's anchor, moved back inside the viewport and above the word when the space
 *  below it is short. Written to the DOM: it is layout, measured after the popover mounts. */
function placePopover(anchor: HTMLElement, word: HTMLElement) {
  anchor.style.left = '0px'
  delete anchor.dataset.side
  const box = anchor.getBoundingClientRect()
  const at = word.getBoundingClientRect()
  const width = document.documentElement.clientWidth
  const shift = Math.max(GUTTER - box.left, Math.min(0, width - GUTTER - box.right))
  anchor.style.left = `${shift}px`
  anchor.style.setProperty('--pop-x', `${Math.max(12, at.left + at.width / 2 - (box.left + shift))}px`)
  const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 0
  if (box.bottom > window.innerHeight - GUTTER && at.top - box.height - GUTTER > header) anchor.dataset.side = 'top'
}

/**
 * Text with dictionary-known words made tappable, each opening an inline popover;
 * unknown words render as plain text. Resolution happens once per text through the
 * public (anon) client, and a failure degrades to plain text.
 */
export function TappableText({
  text, lang, resolved, quiet = false, mark = [],
}: {
  text: string
  lang: LangCode
  /** Resolved on the server: with it the text renders on the first paint and no
   * request is made, without it the effect below resolves in the browser. */
  resolved?: ResolvedText
  /** Ink with a faint underline instead of blue, for a sentence that is read first and
   * tapped second, as under a dictionary sense. */
  quiet?: boolean
  /** Lower-case words set in bold: the headword and its forms in its own examples. */
  mark?: string[]
}) {
  // Tokenised up front, not left empty until the effect below answers: the words are on
  // screen from the first paint and only become tappable once the entries arrive. Starting
  // empty blanked a freshly translated passage for as long as the resolution took.
  const [segments, setSegments] = useState<Segment[]>(() => resolved?.segments ?? tokenize(lang, text))
  const [entries, setEntries] = useState<Map<string, DictEntryPreview>>(() => new Map(resolved?.entries))
  const [chars, setChars] = useState<Map<string, CharInfo>>(() => new Map(resolved?.chars))
  const [active, setActive] = useState<number | null>(null)

  // Follow a change of text immediately rather than waiting for the async resolution
  // below: close the popover, and show the new text as plain words at once instead of
  // leaving the previous passage on screen. Adjust state during render:
  // react.dev/learn/you-might-not-need-an-effect.
  const resetKey = `${lang}:${text}`
  const [prevResetKey, setPrevResetKey] = useState(resetKey)
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey)
    setActive(null)
    setSegments(resolved?.segments ?? tokenize(lang, text))
    setEntries(new Map(resolved?.entries))
    setChars(new Map(resolved?.chars))
  }

  // Escape or a click outside dismisses, beside tapping the word again. The listeners
  // exist only while a popover is open.
  const root = useRef<HTMLSpanElement>(null)
  const anchor = useRef<HTMLSpanElement>(null)
  const words = useRef(new Map<number, HTMLButtonElement>())
  const id = useId()
  // Bumped by every open and close, so a fade-out that ends after the reader opened another
  // word does not close that one.
  const turn = useRef(0)

  function open(i: number) {
    turn.current++
    setActive(i)
  }

  /** Fades the popover out where the browser animates and motion is welcome, else at once. */
  function close() {
    const mine = ++turn.current
    const pop = anchor.current?.firstElementChild
    const still = typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!pop || typeof pop.animate !== 'function' || still) { setActive(null); return }
    pop.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-4px) scale(0.97)' }],
      { duration: 120, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'forwards' },
    ).finished.then(() => { if (turn.current === mine) setActive(null) }, () => {})
  }

  useLayoutEffect(() => {
    const word = active === null ? undefined : words.current.get(active)
    if (anchor.current && word) placePopover(anchor.current, word)
  }, [active])

  useEffect(() => {
    if (active === null) return
    const opened = active
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!root.current?.contains(e.target as Node)) close()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      // Back to the word, so the keyboard reader continues from where they opened it.
      if (root.current?.contains(document.activeElement)) words.current.get(opened)?.focus()
      close()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [active])

  useEffect(() => {
    if (resolved) return
    let cancelled = false
    async function run() {
      try {
        // Imported here, as in `PersonalStrip`: the server resolves most texts, so most
        // pages never reach this branch and need neither supabase-js nor zod.
        const [{ createClient }, { resolveTokens, getZhSegmentCandidates }, { getCharacters }] = await Promise.all([
          loadSupabaseClient(),
          import('@/lib/dictionary/resolveTokens'),
          import('@/lib/dictionary/entryDetail'),
        ])
        const supabase = createClient()
        const headwords = lang === 'zh' ? await getZhSegmentCandidates(supabase, text) : []
        const segs = tokenize(lang, text, headwords)
        const wordTokens = segs.filter((s) => s.word).map((s) => s.text)
        const entryMap = await resolveTokens(supabase, lang, wordTokens)

        let charMap = new Map<string, CharInfo>()
        if (lang === 'zh') {
          const unresolved = [...new Set(
            wordTokens.filter((t) => [...t].length === 1 && !entryMap.has(t.toLowerCase())),
          )]
          if (unresolved.length > 0) {
            const infos = await getCharacters(supabase, unresolved.join(''))
            charMap = new Map(infos.map((c) => [c.char, c]))
          }
        }
        if (!cancelled) { setSegments(segs); setEntries(entryMap); setChars(charMap) }
      } catch {
        if (!cancelled) { setSegments(tokenize(lang, text)); setEntries(new Map()); setChars(new Map()) }
      }
    }
    run()
    return () => { cancelled = true }
  }, [text, lang, resolved])

  return (
    <span
      className="leading-relaxed"
      ref={root}
      // Tabbing past the popover closes it; a click on its text moves focus nowhere and keeps it.
      onBlur={(e) => { if (active !== null && e.relatedTarget && !root.current?.contains(e.relatedTarget)) close() }}
    >
      {segments.map((seg, i) => {
        if (!seg.word) return <span key={i}>{seg.text}</span>
        const bold = mark.includes(seg.text.toLowerCase()) ? 'font-bold text-(--zs-pen)' : ''
        const entry = entries.get(seg.text.toLowerCase())
        const charInfo = !entry && lang === 'zh' ? chars.get(seg.text) : undefined
        if (!entry && !charInfo) return <span key={i} className={bold || undefined}>{seg.text}</span>
        const on = active === i
        return (
          <span key={i} className="relative inline-block">
            <button
              type="button"
              ref={(el) => { if (el) words.current.set(i, el); else words.current.delete(i) }}
              aria-expanded={on}
              aria-controls={on ? `${id}-pop` : undefined}
              onClick={() => (on ? close() : open(i))}
              className={`rounded-[3px] underline decoration-dotted transition-colors duration-150 ease-std ${lang === 'zh' ? '' : HIT_AREA} ${bold} ${
                quiet ? 'decoration-sea-300 underline-offset-4 hover:text-(--zs-pen)' : `underline-offset-2 ${bold ? '' : 'text-(--zs-pen)'} decoration-sea-300`
              } ${on ? 'bg-(--zs-chip) decoration-transparent' : 'hover:bg-(--tint-3)'}`}
            >
              {seg.text}
            </button>
            {on && (
              <span ref={anchor} id={`${id}-pop`} className={r.anchor}>
                <WordPopover entry={entry} charInfo={charInfo} />
              </span>
            )}
          </span>
        )
      })}
    </span>
  )
}
