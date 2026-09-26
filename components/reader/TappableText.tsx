'use client'
import { useEffect, useRef, useState } from 'react'
import { tokenize, type Segment } from '@/lib/reader/tokenize'
import { WordPopover } from './WordPopover'
import type { ResolvedText } from '@/lib/dictionary/tappable'
import type { DictEntryPreview, CharInfo } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'

/**
 * Text with dictionary-known words made tappable, each opening an inline popover;
 * unknown words render as plain text. Resolution happens once per text through the
 * public (anon) client, and a failure degrades to plain text.
 */
export function TappableText({
  text, lang, resolved,
}: {
  text: string
  lang: LangCode
  /** Resolved on the server: with it the text renders on the first paint and no
   * request is made, without it the effect below resolves in the browser. */
  resolved?: ResolvedText
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
  useEffect(() => {
    if (active === null) return
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!root.current?.contains(e.target as Node)) setActive(null)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setActive(null)
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
          import('@/lib/supabase/client'),
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
    <span className="leading-relaxed" ref={root}>
      {segments.map((seg, i) => {
        if (!seg.word) return <span key={i}>{seg.text}</span>
        const entry = entries.get(seg.text.toLowerCase())
        const charInfo = !entry && lang === 'zh' ? chars.get(seg.text) : undefined
        if (!entry && !charInfo) return <span key={i}>{seg.text}</span>
        return (
          <span key={i} className="relative inline-block">
            <button
              type="button"
              onClick={() => setActive(active === i ? null : i)}
              className="rounded text-blue-700 underline decoration-dotted underline-offset-2 hover:bg-blue-50"
            >
              {seg.text}
            </button>
            {active === i && (
              <span className="absolute left-0 top-full z-20 mt-1 block">
                <WordPopover entry={entry} charInfo={charInfo} />
              </span>
            )}
          </span>
        )
      })}
    </span>
  )
}
