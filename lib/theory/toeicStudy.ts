import { getCachedEntryDetail, getCachedInflections } from '@/lib/dictionary/cached'
import { buildEntryId } from '@/lib/dictionary/entryId'
import { audioMatchesHeadword } from '@/lib/dictionary/pronunciation'
import { isCleanExample, isSentenceTranslation } from '@/lib/dictionary/textQuality'
import { MODEL_SOURCE } from '@/lib/dictionary/derivedLayer'
import { draftFromDictEntry } from '@/lib/wordlist/store'
import type { DictEntryDetail, DictEntryPreview, DictSense } from '@/lib/dictionary/types'
import type { WordDraft } from '@/lib/wordlist/types'
import type { LangCode } from '@/lib/languages'
import { getCachedToeicLayer, type ToeicLayer } from './toeicLayer'
import type { ToeicWordTopic } from './types'

/** The tag every word saved from a TOEIC topic carries. */
export const TOEIC_TAG = 'toeic'

/** The sentence a topic page shows under one word, with its translation. */
export interface ToeicExample {
  text: string
  vi: string
  /** A model wrote it, so the page labels it as the word page does. */
  byModel: boolean
}

export interface ToeicStudyWord {
  word: string
  vi: string
  /** Null when the dictionary has no entry for the word. */
  entry: DictEntryPreview | null
  example: ToeicExample | null
  /** What a save from the topic writes; null with no entry. */
  draft: WordDraft | null
}

/** Sources public pages do not show: Cambridge is proprietary and these two carry no
 *  licence in `lex.sources`. Owner's decision, 2026-10-05. */
const CLOSED_SOURCES = new Set(['cambridge', 'cambridge-vi', 'glosbe'])

/** Senses a test never means. Wiktionary joins tags with commas and varies their case. */
const OFF_REGISTER = /\b(?:colloquial|informal|internet|slang|vulgar|offensive|dated|obsolete|archaic|rare|dialect(?:al)?)\b/i

const offRegister = (s: Pick<DictSense, 'register'>) => OFF_REGISTER.test(s.register ?? '')

/** A term as written, without the noun markers one side writes and the other drops:
 *  "sự thăng chức" and "thăng chức". */
const bare = (t: string) => t.trim().replace(/\.$/, '').toLowerCase().replace(/^(?:sự|việc)\s+/, '')

/** "số máy lẻ hoặc sự gia hạn" is two meanings, and either one names the sense. */
const meaningTerms = (vi: string) => new Set(vi.split(/,\s*|\s+hoặc\s+/).map(bare).filter(Boolean))

/** A whole term of the gloss, not a part of one: "đăng ký" is not "giấy đăng ký xe". */
const sharesTerm = (gloss: readonly string[], terms: Set<string>) => gloss.some((t) => terms.has(bare(t)))

const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `text` holds one of `words` with no letter touching it on either side. */
const hasWord = (text: string, words: Iterable<string>) => [...words].some((w) =>
  new RegExp(`(?<![\\p{L}\\p{M}])${escape(w)}(?![\\p{L}\\p{M}])`, 'iu').test(text))

const glossTerms = (vi: string | null) => (vi ? vi.replace(/\([^)]*\)/g, '').split(/[,;]/) : [])

/** Longer reads as a quotation from a book rather than a sentence to learn from: the
 *  Wiktionary sentences linked to a sense average 114 characters, Tatoeba's 34. */
const MAX_EXAMPLE = 100

/** A quotation: verse with its line breaks as slashes, a long s, or a cut marked […]. */
const QUOTATION = /\s\/\s|ſ|\[…\]/

const shortest = (xs: ToeicExample[]) => (xs.length ? xs.reduce((a, b) => (b.text.length < a.text.length ? b : a)) : null)

/** The shortest clean, translated, open-licence sentence whose translation uses the test
 *  meaning as a whole term: first one linked to a current sense with that meaning, then one
 *  linked to no sense whose English holds the headword or one of `forms`. The translation
 *  check catches a wrong gloss: expire's "hết hạn" sense carried "The patient expired." */
export function pickToeicExample(
  detail: Pick<DictEntryDetail, 'headword' | 'senses' | 'examples' | 'glossVi'>,
  vi: string,
  forms: readonly string[] = [],
): ToeicExample | null {
  const terms = meaningTerms(vi)
  const senses = new Set(detail.senses
    .filter((s) => s.id && !offRegister(s) && sharesTerm(glossTerms(s.glossVi), terms))
    .map((s) => s.id))
  const glosses = [detail.glossVi, ...detail.senses.map((s) => s.glossVi)]
  const words = [detail.headword, ...forms]
  const linked: ToeicExample[] = []
  const unlinked: ToeicExample[] = []
  for (const e of detail.examples) {
    const vi = e.translationVi?.trim()
    const open = Boolean(e.sourceId && !CLOSED_SOURCES.has(e.sourceId))
    const readable = e.text.length <= MAX_EXAMPLE && !QUOTATION.test(e.text) && isCleanExample(e.text)
    if (!vi || !open || !readable || !isSentenceTranslation(vi, glosses) || !hasWord(vi, terms)) continue
    const x = { text: e.text, vi, byModel: e.sourceId === MODEL_SOURCE }
    if (!e.senseId && hasWord(e.text, words)) unlinked.push(x)
    else if (e.senseId && senses.has(e.senseId)) linked.push(x)
  }
  return shortest(linked) ?? shortest(unlinked)
}

/** Models whose writing never reaches a page. Owner's rule: Claude never writes product data. */
const BARRED_MODEL = /claude/i

/** The fallback: a sentence the learner layer's model wrote for the sense with the test
 *  meaning. A sentence the layer copied from `lex.examples` is skipped, because its source
 *  is not read here. */
export function pickLayerExample(layer: ToeicLayer | null, vi: string): ToeicExample | null {
  if (!layer || BARRED_MODEL.test(layer.model) || BARRED_MODEL.test(layer.reviewer ?? '')) return null
  const terms = meaningTerms(vi)
  for (const s of layer.senses) {
    if (!sharesTerm(s.viTerms, terms)) continue
    const x = s.examples.find((e) => e.byModel && e.text.length <= MAX_EXAMPLE && isCleanExample(e.text) && e.vi.trim())
    if (x) return { text: x.text, vi: x.vi.trim(), byModel: true }
  }
  return null
}

/** The entry as the topic shows and saves it: the test meaning in place of the dictionary's
 *  first gloss, and no examples, so `draftFromDictEntry` keeps that meaning. */
export function toeicPreview(detail: DictEntryPreview, vi: string): DictEntryPreview {
  return {
    id: detail.id, lang: detail.lang, headword: detail.headword, traditional: detail.traditional,
    level: detail.level, ipa: detail.ipa, pos: detail.pos, glossVi: vi, glossEn: detail.glossEn,
    audioUrl: audioMatchesHeadword(detail.audioUrl, detail.headword) ? detail.audioUrl : null,
  }
}

/** The notebook row a topic saves, by the topic's button or the word's own: the test
 *  meaning, the sentence shown and the TOEIC tag. */
export function toeicDraft(entry: DictEntryPreview, example: ToeicExample | null): WordDraft {
  return {
    ...draftFromDictEntry(entry),
    example: example?.text ?? null,
    exampleTranslation: example?.vi ?? null,
    tags: [TOEIC_TAG],
  }
}

/** Every word of one topic, read in parallel from the cache the word pages share. A failed
 *  read throws, so the route cache never stores a topic with words or sentences missing. */
export function loadToeicTopic(lang: LangCode, topic: ToeicWordTopic): Promise<ToeicStudyWord[]> {
  return Promise.all(topic.words.map(async ({ word, vi }) => {
    const id = buildEntryId(lang, word)
    const [detail, forms] = await Promise.all([getCachedEntryDetail(id), getCachedInflections(id)])
    if (!detail) return { word, vi, entry: null, example: null, draft: null }
    const example = pickToeicExample(detail, vi, forms.map((f) => f.formText))
      ?? pickLayerExample(await getCachedToeicLayer(detail.id), vi)
    const entry = toeicPreview(detail, vi)
    return { word, vi, entry, example, draft: toeicDraft(entry, example) }
  }))
}
