import { z } from '@/lib/zod'
import type { WordView } from './wordView'

/** The wire format of `GET /dictionary/view`, for the side-by-side layout. Parsed, not
 *  cast: a 429 body or a proxy's error page must become "not opened", not a pane that
 *  throws at first render. */

const langCode = z.enum(['zh', 'es', 'en'])
const text = z.string().nullable()

const sense = z.object({
  pos: text, glossVi: text, glossEn: text, senseOrder: z.number(),
  pivotVi: text.optional(), id: z.string().optional(), senseFrequency: z.number().nullable().optional(),
})
const example = z.object({
  text: z.string(), reading: text, translationVi: text, translationEn: text, senseId: text.optional(),
})
const preview = z.object({
  id: z.string(), lang: langCode, headword: z.string(), traditional: text, level: text, ipa: text, pos: text,
  glossVi: text, glossEn: text, audioUrl: text, reading: text.optional(),
  frequencyRank: z.number().nullable().optional(), matchScore: z.number().nullable().optional(),
})
const charInfo = z.object({
  char: z.string(), radical: text, strokeCount: z.number().nullable(), hanViet: z.string().array(),
  pinyin: z.string().array(), gloss: text,
})
const word = z.object({ text: z.string(), href: z.string(), id: text, gloss: text, pos: text, level: text })
const person = z.enum(['1s', '2s', '3s', '1p', '2p', '3p'])
const tense = z.object({
  key: z.enum(['present', 'preterite', 'imperfect', 'conditional', 'future', 'subPresent', 'subImperfect']),
  forms: z.partialRecord(person, z.string()),
})

export const wordViewResponse: z.ZodType<WordView> = z.object({
  head: preview.extend({
    senses: sense.array(),
    pronunciations: z.object({ accent: z.string(), ipa: text, audioUrl: text }).array(),
    examples: example.array(),
    relations: z.object({ relationType: z.string(), relatedText: text, relatedEntryId: text }).array(),
    attributes: z.record(z.string(), z.unknown()),
    senseLinks: z.object({ text: z.string(), senseOrder: z.number(), targetId: z.string() }).array().optional(),
  }),
  hanViet: text,
  lemma: text,
  lemmaPreview: z.object({
    matchText: z.string(), id: z.string(), headword: z.string(), pos: text, ipa: text, reading: text,
    gender: text, glossVi: text, glossEn: text,
  }).nullable(),
  senses: sense.array(),
  summary: text,
  meaningVi: text,
  forms: z.object({ text: z.string(), label: z.string(), kept: z.string(), changed: z.string(), irregular: z.boolean() }).array(),
  conjugation: z.object({
    infinitive: text, gerund: text, pastParticiple: text, indicative: tense.array(), subjunctive: tense.array(),
    imperativeAffirmative: z.string().array(), imperativeNegative: z.string().array(),
  }).nullable(),
  phrases: word.array(),
  family: word.extend({ before: z.string(), stem: z.string(), after: z.string() }).array(),
  senseSynonyms: z.object({ senseOrder: z.number(), label: z.string(), words: word.array() }).array(),
  synonyms: word.array(),
  antonyms: word.array(),
  related: word.array(),
  siblings: z.object({
    id: z.string(), lang: langCode, headword: z.string(), reading: text, gender: text, pos: text, glossVi: text,
    glossEn: text,
  }).array(),
  characters: charInfo.array(),
  examplesBySense: z.record(z.string(), example),
  examples: example.array(),
  resolved: z.object({
    text: z.string(),
    segments: z.object({ text: z.string(), word: z.boolean() }).array(),
    entries: z.tuple([z.string(), preview]).array(),
    chars: z.tuple([z.string(), charInfo]).array(),
  }).array(),
  glosses: text.array(),
  grammarPoints: z.object({
    id: z.string(), lang: langCode, levelScheme: z.enum(['HSK', 'CEFR']).nullable(), level: text,
    categoryVi: text, titleVi: z.string(), pattern: z.string(), sortOrder: z.number(),
  }).array(),
})

/** One word as the page draws it; null when the dictionary has no such entry. Throws on a
 *  refused or malformed answer, which the caller shows as "not opened". */
export async function fetchWordView(id: string, signal?: AbortSignal): Promise<WordView | null> {
  const res = await fetch(`/dictionary/view?id=${encodeURIComponent(id)}`, { signal })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`view ${res.status}`)
  return wordViewResponse.parse(await res.json())
}
