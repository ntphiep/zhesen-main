'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveTokens, getZhSegmentCandidates } from '@/lib/dictionary/resolveTokens'
import { getCharacters } from '@/lib/dictionary/entryDetail'
import { tokenize, type Segment } from '@/lib/reader/tokenize'
import { WordPopover } from './WordPopover'
import type { DictEntryPreview, CharInfo } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'

/**
 * Renders text with dictionary-known words made tappable. Tapping a word opens an
 * inline popover with its meaning. Unknown words render as plain text. Resolution
 * happens once per text via the public (anon) client; failures degrade to plain text.
 */
export function TappableText({ text, lang }: { text: string; lang: LangCode }) {
  const supabase = useMemo(() => createClient(), [])
  const [segments, setSegments] = useState<Segment[]>([])
  const [entries, setEntries] = useState<Map<string, DictEntryPreview>>(new Map())
  const [chars, setChars] = useState<Map<string, CharInfo>>(new Map())
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

  useEffect(() => {
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
  }, [text, lang, supabase])

  return (
    <span className="leading-relaxed">
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
