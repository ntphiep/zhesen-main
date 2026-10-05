import { getCachedEntryDetail } from '@/lib/dictionary/cached'
import { getCachedLearnerLayer } from '@/lib/dictionary/learnerCached'
import { buildEntryId } from '@/lib/dictionary/entryId'
import { audioMatchesHeadword } from '@/lib/dictionary/pronunciation'
import { isCleanExample, isOldSense, isSentenceTranslation } from '@/lib/dictionary/textQuality'
import { MODEL_SOURCE } from '@/lib/dictionary/derivedLayer'
import type { DictEntryDetail, DictEntryPreview } from '@/lib/dictionary/types'
import type { LearnerLayer } from '@/lib/dictionary/learner'
import type { LangCode } from '@/lib/languages'
import type { ToeicWordTopic } from './types'

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
}

/** Sources public pages do not show: Cambridge is proprietary and these two carry no
 *  licence in `lex.sources`. Owner's decision, 2026-10-05. */
const CLOSED_SOURCES = new Set(['cambridge', 'cambridge-vi', 'glosbe'])

/** A term as written, without the noun markers one side writes and the other drops:
 *  "sự thăng chức" and "thăng chức". */
const bare = (t: string) => t.trim().replace(/\.$/, '').toLowerCase().replace(/^(?:sự|việc)\s+/, '')

/** "số máy lẻ hoặc sự gia hạn" is two meanings, and either one names the sense. */
const meaningTerms = (vi: string) => new Set(vi.split(/,\s*|\s+hoặc\s+/).map(bare).filter(Boolean))

const sharesTerm = (gloss: string[], terms: Set<string>) => gloss.some((t) => [...terms].some((x) => bare(t).includes(x)))

/** The translation uses the test meaning, so the sentence is of that sense even where the
 *  sense's gloss is wrong: expire's "hết hạn" sense carried "The patient expired in hospital." */
const saysMeaning = (vi: string, terms: Set<string>) => [...terms].some((t) => vi.toLowerCase().includes(t))

const glossTerms = (vi: string | null) => (vi ? vi.replace(/\([^)]*\)/g, '').split(/[,;]/) : [])

/** Longer reads as a quotation from a book rather than a sentence to learn from: the
 *  Wiktionary sentences linked to a sense average 114 characters, Tatoeba's 34. */
const MAX_EXAMPLE = 100

/** A quotation: verse with its line breaks as slashes, a long s, or a cut marked […]. */
const QUOTATION = /\s\/\s|ſ|\[…\]/

/** The shortest clean, translated, open-licence sentence linked to a current sense that
 *  carries the test meaning. Never an unlinked one: branch would then show "cành cây". */
export function pickToeicExample(detail: Pick<DictEntryDetail, 'senses' | 'examples' | 'glossVi'>, vi: string): ToeicExample | null {
  const terms = meaningTerms(vi)
  const senses = new Set(detail.senses
    .filter((s) => s.id && !isOldSense(s) && sharesTerm(glossTerms(s.glossVi), terms))
    .map((s) => s.id))
  const glosses = [detail.glossVi, ...detail.senses.map((s) => s.glossVi)]
  const usable = detail.examples.flatMap((e) => {
    const vi = e.translationVi?.trim()
    const open = Boolean(e.sourceId && !CLOSED_SOURCES.has(e.sourceId))
    const linked = Boolean(e.senseId && senses.has(e.senseId))
    const readable = e.text.length <= MAX_EXAMPLE && !QUOTATION.test(e.text) && isCleanExample(e.text)
    return vi && open && linked && readable && isSentenceTranslation(vi, glosses) && saysMeaning(vi, terms)
      ? [{ text: e.text, vi, byModel: e.sourceId === MODEL_SOURCE }]
      : []
  })
  if (usable.length === 0) return null
  return usable.reduce((a, b) => (b.text.length < a.text.length ? b : a))
}

/** The fallback: a sentence the learner layer's model wrote for the sense with the test
 *  meaning. A sentence the layer copied from `lex.examples` is skipped, because its source
 *  is not read here. */
export function pickLayerExample(layer: Pick<LearnerLayer, 'senses'> | null, vi: string): ToeicExample | null {
  if (!layer) return null
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

/** Every word of one topic, read in parallel from the cache the word pages share. A failed
 *  read throws, so the route cache never stores a topic with words missing. */
export function loadToeicTopic(lang: LangCode, topic: ToeicWordTopic): Promise<ToeicStudyWord[]> {
  return Promise.all(topic.words.map(async ({ word, vi }) => {
    const detail = await getCachedEntryDetail(buildEntryId(lang, word))
    if (!detail) return { word, vi, entry: null, example: null }
    const example = pickToeicExample(detail, vi)
      ?? pickLayerExample(await getCachedLearnerLayer(detail.id), vi)
    return { word, vi, entry: toeicPreview(detail, vi), example }
  }))
}
