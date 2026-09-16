import type { SupabaseClient } from '@supabase/supabase-js'
import type { LangCode } from '@/lib/languages'
import { tokenize, type Segment } from '@/lib/reader/tokenize'
import { getZhSegmentCandidatesForTexts, resolveTokens } from './resolveTokens'
import { getCharacters } from './entryDetail'
import type { CharInfo, DictEntryPreview } from './types'

/**
 * Everything TappableText needs to render one text, already resolved.
 *
 * Entries and characters travel as pairs rather than Maps: this crosses the
 * server/client boundary, and a plain array is the shape that survives it
 * unambiguously. The component rebuilds the Maps once on the other side.
 */
export interface ResolvedText {
  text: string
  segments: Segment[]
  /** Keyed by lowercased token, matching what `resolveTokens` returns. */
  entries: [string, DictEntryPreview][]
  /** Single Han characters with no entry of their own, keyed by the character. */
  chars: [string, CharInfo][]
}

/**
 * Resolve every tappable text on a page in one pass, on the server, behind
 * `unstable_cache`, instead of each `TappableText` resolving itself from the
 * browser. The whole page costs at most one candidate query, the three inside
 * resolveTokens, and one character query.
 */
export async function resolveTappableTexts(
  supabase: SupabaseClient, lang: LangCode, texts: string[],
): Promise<ResolvedText[]> {
  const unique = [...new Set(texts.filter((t) => t.trim()))]
  if (unique.length === 0) return []

  const headwords = lang === 'zh' ? await getZhSegmentCandidatesForTexts(supabase, unique) : []
  const tokenized = unique.map((text) => ({ text, segments: tokenize(lang, text, headwords) }))

  const allTokens = tokenized.flatMap(({ segments }) => segments.filter((s) => s.word).map((s) => s.text))
  const entryMap = await resolveTokens(supabase, lang, allTokens)

  let charMap = new Map<string, CharInfo>()
  if (lang === 'zh') {
    const unresolved = [...new Set(
      allTokens.filter((t) => [...t].length === 1 && !entryMap.has(t.toLowerCase())),
    )]
    if (unresolved.length > 0) {
      const infos = await getCharacters(supabase, unresolved.join(''))
      charMap = new Map(infos.map((c) => [c.char, c]))
    }
  }

  return tokenized.map(({ text, segments }) => {
    const tokens = [...new Set(segments.filter((s) => s.word).map((s) => s.text))]
    return {
      text,
      segments,
      entries: tokens.flatMap((token): [string, DictEntryPreview][] => {
        const entry = entryMap.get(token.toLowerCase())
        return entry ? [[token.toLowerCase(), entry]] : []
      }),
      chars: tokens.flatMap((token): [string, CharInfo][] => {
        const info = charMap.get(token)
        return info ? [[token, info]] : []
      }),
    }
  })
}
