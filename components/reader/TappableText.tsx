'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveTokens, getZhSegmentCandidates } from '@/lib/dictionary/resolveTokens'
import { getCharacters } from '@/lib/dictionary/entryDetail'
import { tokenize, type Segment } from '@/lib/reader/tokenize'
import { WordPopover } from './WordPopover'
import type { ResolvedText } from '@/lib/dictionary/tappable'
import type { DictEntryPreview, CharInfo } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'

/**
 * Renders text with dictionary-known words made tappable. Tapping a word opens an
 * inline popover with its meaning. Unknown words render as plain text. Resolution
 * happens once per text via the public (anon) client; failures degrade to plain text.
 */
export function TappableText({
  text, lang, resolved,
}: {
  text: string
  lang: LangCode
  /** Resolved on the server. When present the text renders on the first paint
   * and no request is made; without it the effect below does the work in the
   * browser, which is what the grammar pages still rely on. */
  resolved?: ResolvedText
}) {
  const supabase = useMemo(() => createClient(), [])
  const [segments, setSegments] = useState<Segment[]>(() => resolved?.segments ?? [])
  const [entries, setEntries] = useState<Map<string, DictEntryPreview>>(() => new Map(resolved?.entries))
  const [chars, setChars] = useState<Map<string, CharInfo>>(() => new Map(resolved?.chars))
  const [active, setActive] = useState<number | null>(null)

  // Close any open popover whenever the underlying text changes, without waiting for
  // the async resolution below (adjust state during render, per React's guidance for
  // resetting state when inputs change: react.dev/learn/you-might-not-need-an-effect).
  const resetKey = `${lang}:${text}`
  const [prevResetKey, setPrevResetKey] = useState(resetKey)
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey)
    setActive(null)
  }

  // Dismiss the popover the way every other popover on the web does: Escape, or a
  // click anywhere outside it. Tapping the word again still closes it, but that was
  // the only way out, so reading on past an open popover left it hanging over the
  // text. Listeners exist only while one is open.
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
  }, [text, lang, supabase, resolved])

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
