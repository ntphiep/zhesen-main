import type { SupabaseClient } from '@supabase/supabase-js'
import { detectOrder } from './detect'
import { resolveTappableTexts } from './tappable'
import { resolveTokens } from './resolveTokens'
import { phraseCandidates, pickPhrases, type FoundPhrase } from './phrases'
import { tokenize } from '@/lib/reader/tokenize'
import type { DictEntryPreview } from './types'
import type { LangCode } from '@/lib/languages'

/**
 * Phrase, sentence and paragraph lookup, layer one: split the text and resolve every word
 * against the dictionary. No model is involved, so this answers whether or not the
 * assistant is configured. The whole-passage translation is layer two, the `translate`
 * task in `lib/ai/tasks.ts`.
 */

/** One word of the passage, in the order it was written. A word with no entry stays in
 *  the list: "this one is not in the dictionary" is an answer, and dropping it would
 *  silently renumber the passage. */
export interface LookedUpWord {
  text: string
  entry: DictEntryPreview | null
}

export interface TextLookup {
  /** The language the passage was read as, which decides tokenization. */
  lang: LangCode
  words: LookedUpWord[]
  /** English multi-word entries in the passage, in reading order; see ./phrases. */
  phrases: FoundPhrase[]
}

/** `lang` is the language Azure detected or the learner selected. Without it the letter
 *  heuristic decides, and it reads 30.5% of Spanish Tatoeba sentences as English. */
export async function lookUpText(supabase: SupabaseClient, text: string, given?: LangCode): Promise<TextLookup> {
  const lang = given ?? detectOrder(text)[0]
  if (lang === 'zh') {
    const [resolved] = await resolveTappableTexts(supabase, lang, [text])
    if (!resolved) return { lang, words: [], phrases: [] }
    const byToken = new Map(resolved.entries)
    return {
      lang,
      words: resolved.segments
        .filter((s) => s.word)
        .map((s) => ({ text: s.text, entry: byToken.get(s.text.toLowerCase()) ?? null })),
      phrases: [],
    }
  }

  // The words and the phrase candidates go to the dictionary in one call.
  const segments = tokenize(lang, text)
  const words = segments.filter((s) => s.word)
  if (words.length === 0) return { lang, words: [], phrases: [] }
  const candidates = lang === 'en' ? phraseCandidates(segments) : []
  const found = await resolveTokens(supabase, lang, [...words.map((w) => w.text), ...candidates.map((c) => c.key)])
  return {
    lang,
    words: words.map((s) => ({ text: s.text, entry: found.get(s.text.toLowerCase()) ?? null })),
    phrases: pickPhrases(candidates, found),
  }
}
