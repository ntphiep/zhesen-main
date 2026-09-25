import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from '@/lib/zod'
import { detectOrder } from './detect'
import { resolveTappableTexts } from './tappable'
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
}

export async function lookUpText(supabase: SupabaseClient, text: string): Promise<TextLookup> {
  // The same heuristic the search box uses, at passage length: Han script anywhere means
  // Chinese, a Spanish-only letter means Spanish, otherwise English. Tokenization is all
  // it decides, and `tokenizeLatin` treats English and Spanish alike.
  const lang = detectOrder(text)[0]
  const [resolved] = await resolveTappableTexts(supabase, lang, [text])
  if (!resolved) return { lang, words: [] }

  const byToken = new Map(resolved.entries)
  return {
    lang,
    words: resolved.segments
      .filter((s) => s.word)
      .map((s) => ({ text: s.text, entry: byToken.get(s.text.toLowerCase()) ?? null })),
  }
}

/** The wire format of `POST /dictionary/text/lookup`, parsed by the browser rather than cast. */
const langCode = z.enum(['zh', 'es', 'en'])

const entryPreview = z.object({
  id: z.string(),
  lang: langCode,
  headword: z.string(),
  traditional: z.string().nullable(),
  level: z.string().nullable(),
  ipa: z.string().nullable(),
  pos: z.string().nullable(),
  glossVi: z.string().nullable(),
  glossEn: z.string().nullable(),
  audioUrl: z.string().nullable(),
  frequencyRank: z.number().nullable().optional(),
  matchScore: z.number().nullable().optional(),
})

export const textLookupResponse = z.object({
  lang: langCode,
  words: z.object({ text: z.string(), entry: entryPreview.nullable() }).array(),
})

export type TextLookupOutcome =
  | { status: 'ok'; data: TextLookup }
  | { status: 'refused'; message: string }

/** Layer one, through the route: the browser holds no Supabase credentials for `lex` and
 *  the per-address budget lives on the server. */
export async function fetchTextLookup(text: string, signal?: AbortSignal): Promise<TextLookupOutcome> {
  const res = await fetch('/dictionary/text/lookup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  })
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error
    return { status: 'refused', message: message ?? 'Chưa tra được đoạn này. Thử lại.' }
  }
  return { status: 'ok', data: textLookupResponse.parse(body) }
}
