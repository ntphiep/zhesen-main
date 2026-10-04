import { getCachedCrossLanguage, getCachedEntryDetail, getCachedSearch, getCachedTermPreviews, getCachedWordOfDay } from '@/lib/dictionary/cached'
import { getCachedLearnerLayer } from '@/lib/dictionary/learnerCached'
import { markHeadword, minorSenses, type LearnerLayer, type LearnerLink } from '@/lib/dictionary/learner'
import { entryPath, splitEntryId } from '@/lib/dictionary/entryId'
import type { DictEntryDetail, DictEntryPreview, DictSense, TermPreview } from '@/lib/dictionary/types'
import { byLang, LANG_CODES, type LangCode } from '@/lib/languages'
import { EXAMPLE_QUERY, PHRASES, PHRASE_VERB, TAKE_ENTRY } from './content'

/** What the landing page reads on the server. Every read is cached, so the page stays static. */

export type Answers = Record<LangCode, DictEntryPreview[]>

/** The hero's example lookup, from the same cache entry as `GET /dictionary/search?q=hoa&dir=vi`.
 *  Null when the read fails; the browser then asks the route itself. */
export async function loadExample(): Promise<Answers | null> {
  try {
    return (await getCachedSearch(EXAMPLE_QUERY, [...LANG_CODES], 'vi')).entries
  } catch (e) {
    console.error('landing example failed', e)
    return null
  }
}

export interface TakeSense {
  terms: string
  level: string | null
  definition: string
  example: { parts: { text: string; mark: boolean }[]; vi: string } | null
  zh: string
  es: string
  collocations: { text: string; pattern: string | null; vi: string | null }[]
  /** The first synonym, then the first antonym or else a second synonym. */
  notes: { text: string; antonym: boolean; note: string | null }[]
}
export interface TakeMap {
  headword: string
  href: string
  senses: TakeSense[]
  /** Every sense the word page lists, read with it, so the heading cannot drift. */
  senseCount: number
  /** The minor senses, one label each. */
  tail: string[]
}

/** Registers the landing page leaves out of take's minor senses. */
const UNSHOWN_REGISTERS = new Set(['vulgar', 'offensive'])

export function takeMap(layer: LearnerLayer, detail: Pick<DictEntryDetail, 'headword' | 'senses'>): TakeMap {
  const terms = (links: LearnerLink[], lang: LangCode) => links.filter((l) => l.lang === lang).map((l) => l.text).join(', ')
  const senses = layer.senses.map((s): TakeSense => {
    const first = s.examples[0]
    const notes = [
      ...s.synonyms.slice(0, 1).map((l) => ({ text: l.text, antonym: false, note: l.noteVi })),
      ...(s.antonyms.length
        ? s.antonyms.slice(0, 1).map((l) => ({ text: l.text, antonym: true, note: l.noteVi }))
        : s.synonyms.slice(1, 2).map((l) => ({ text: l.text, antonym: false, note: l.noteVi }))),
    ]
    return {
      terms: s.viTerms.join(', '),
      level: s.cefr,
      definition: s.viDefinition,
      example: first ? { parts: markHeadword(first.text, detail.headword, 'en'), vi: first.vi } : null,
      zh: terms(s.equivalents, 'zh'),
      es: terms(s.equivalents, 'es'),
      collocations: s.collocations.map((c) => ({ text: c.text, pattern: c.pattern, vi: c.vi })),
      notes,
    }
  })
  const tail = [...new Set(minorSenses(layer, detail.senses).other
    .filter((m) => !UNSHOWN_REGISTERS.has(m.register ?? '') && m.viTerms.length)
    .map((m) => m.viTerms.join(', ')))]
  return { headword: detail.headword, href: entryPath(layer.entryId), senses, senseCount: detail.senses.length, tail }
}

/** Today's word and, for the other two languages, its first equivalent: the signed-in
 *  home's "Từ vựng hôm nay". Null when the word of the day cannot be read. */
export async function loadDaily(): Promise<Record<LangCode, DictEntryPreview | null> | null> {
  try {
    const word = await getCachedWordOfDay()
    if (!word) return null
    const siblings = await getCachedCrossLanguage(word.id)
    const preview = (e: { id: string; lang: LangCode; headword: string; glossVi: string | null }, more: Partial<DictEntryPreview>): DictEntryPreview => ({
      id: e.id, lang: e.lang, headword: e.headword, glossVi: e.glossVi,
      traditional: null, level: null, ipa: null, pos: null, glossEn: null, audioUrl: null, ...more,
    })
    const other = (lang: LangCode) => {
      const s = siblings.find((x) => x.lang === lang)
      return s ? preview(s, { reading: s.reading, pos: s.pos, glossEn: s.glossEn }) : null
    }
    return byLang(({ code }) => (code === word.lang ? preview(word, { ipa: word.ipa, level: word.level }) : other(code)))
  } catch (e) {
    console.error('home daily word failed', e)
    return null
  }
}

/** The meaning map of take, or null when either read comes back empty. */
export async function loadTake(): Promise<TakeMap | null> {
  const [layer, detail] = await Promise.all([
    getCachedLearnerLayer(TAKE_ENTRY),
    getCachedEntryDetail(TAKE_ENTRY).catch((e: unknown) => { console.error('landing take failed', e); return null }),
  ])
  return layer && detail && layer.senses.length ? takeMap(layer, detail) : null
}

/** A word in another language with the same meaning, and its page. */
export interface Equivalent {
  text: string
  href: string
}
export interface PhraseItem {
  headword: string
  particle: string
  href: string
  vi: string
  zh: Equivalent | null
  es: Equivalent | null
}
export interface PhraseFamily {
  verb: string
  verbVi: string | null
  href: string
  phrases: PhraseItem[]
}

/** Senses that only point at another entry or at the literal reading. */
const POINTER = /^(used other than figuratively|synonym of|ellipsis of|alternative (form|spelling) of|misspelling of)/i

/** The sense a learner meets first: by sense frequency where the data ranks one, then a
 *  reviewed Vietnamese gloss before a machine one, then dictionary order. A pointer sense
 *  and a Google translation never lead. */
export function leadSense(senses: DictSense[]): DictSense | null {
  const usable = senses.filter((s) => s.glossVi?.trim() && s.glossViSource !== 'mt:google' && !POINTER.test(s.glossEn ?? ''))
  return usable.sort((a, b) =>
    (a.senseFrequency ?? Infinity) - (b.senseFrequency ?? Infinity)
    || Number(a.glossViIsMt ?? false) - Number(b.glossViIsMt ?? false)
    || a.senseOrder - b.senseOrder)[0] ?? null
}

/** "Từ chối, bác bỏ" reads as "từ chối". */
export function firstTerm(gloss: string): string {
  const t = gloss.split(/[,;]/)[0].trim()
  return t.charAt(0).toLocaleLowerCase('vi') + t.slice(1)
}

/** One phrasal verb: its lead meaning, and the Chinese and Spanish entries picked for it,
 *  when the dictionary still holds them. */
export function phraseItem(
  detail: Pick<DictEntryDetail, 'id' | 'headword'>, verb: string, vi: string,
  zh: TermPreview | undefined, es: TermPreview | undefined,
): PhraseItem {
  const link = (e: TermPreview | undefined): Equivalent | null => (e ? { text: e.headword, href: entryPath(e.id) } : null)
  return {
    headword: detail.headword,
    particle: detail.headword.slice(verb.length).trim(),
    href: entryPath(detail.id),
    vi,
    zh: link(zh),
    es: link(es),
  }
}

/** The headwords of these entries in one language, by id. A failed read answers none. */
async function previews(lang: LangCode, ids: string[]): Promise<Map<string, TermPreview>> {
  try {
    const rows = await getCachedTermPreviews(lang, ids.map((id) => splitEntryId(id).key))
    return new Map(rows.filter((r) => ids.includes(r.id)).map((r) => [r.id, r]))
  } catch (e) {
    console.error('landing phrase equivalents failed', lang, e)
    return new Map()
  }
}

/** One verb and its phrasal verbs, each with its Vietnamese meaning and the same meaning in
 *  Chinese and Spanish. A phrase whose read fails is left out; null when fewer than three
 *  remain. The verb keeps the meaning its word page leads with. */
export async function loadPhrases(): Promise<PhraseFamily | null> {
  const read = (id: string) => getCachedEntryDetail(id).catch((e: unknown) => {
    console.error('landing phrase failed', id, e)
    return null
  })
  const [verb, zh, es, ...details] = await Promise.all([
    read(PHRASE_VERB),
    previews('zh', PHRASES.map((p) => p.zh)),
    previews('es', PHRASES.map((p) => p.es)),
    ...PHRASES.map((p) => read(p.id)),
  ])
  if (!verb) return null
  const phrases = details.flatMap((d, i) => {
    const sense = d && leadSense(d.senses)
    return d && sense?.glossVi
      ? [phraseItem(d, verb.headword, firstTerm(sense.glossVi), zh.get(PHRASES[i].zh), es.get(PHRASES[i].es))]
      : []
  })
  return phrases.length >= 3
    ? { verb: verb.headword, verbVi: verb.glossVi, href: entryPath(verb.id), phrases }
    : null
}
