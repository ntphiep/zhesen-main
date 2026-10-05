import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from '@/lib/zod'
import { isLangCode, type LangCode } from '@/lib/languages'
import { splitEntryId } from './entryId'
import { isOpenLicence } from './licence'
import type { LearnerDistractors } from '@/lib/practice/quiz'

/**
 * The learner layer of one entry (supabase/migrations/0076_learner_layer.sql): the senses a
 * learner meets most, written by a language model from the Wiktionary senses and reviewed
 * by a second one, plus a label for every other sense. Read with one PostgREST embed and
 * converted to camelCase here only.
 */

export type LinkKind = 'collocation' | 'synonym' | 'antonym' | 'confusable' | 'equivalent'

export interface LearnerLink {
  kind: LinkKind
  text: string
  lang: LangCode
  /** The entry `text` resolves to; null when the dictionary has none. */
  targetEntryId: string | null
  pattern: string | null
  vi: string | null
  noteVi: string | null
  example: string | null
  exampleVi: string | null
  /** Pinyin of `text`. */
  reading: string | null
  /** Pinyin of `example`. */
  exampleReading: string | null
}

export interface LearnerExample {
  text: string
  reading: string | null
  vi: string
  /** On an AI layer, null when the model wrote the sentence; always null on a derived one. */
  sourceExampleId: number | null
  /** A model wrote the sentence rather than a dictionary or a corpus. */
  byModel: boolean
  /** `lex.sources.id` of the sentence on a derived layer; null on an AI layer. */
  sourceId: string | null
}

export interface LearnerSense {
  order: number
  pos: string | null
  viTerms: string[]
  viDefinition: string
  /** True when the Vietnamese came through the English pivot rather than from the entry. */
  pivot: boolean
  enDefinition: string | null
  domain: string | null
  register: string | null
  cefr: string | null
  /** The `lex.senses` ids this sense covers. */
  sourceSenseIds: string[]
  examples: LearnerExample[]
  collocations: LearnerLink[]
  synonyms: LearnerLink[]
  antonyms: LearnerLink[]
  equivalents: LearnerLink[]
}

/** What the layer says about one raw sense. */
export interface SenseLabel {
  senseId: string
  /** The core sense that covers it; null for a minor sense. */
  coreSenseOrder: number | null
  viTerms: string[]
  domain: string | null
  register: string | null
  isInflection: boolean
  lemma: string | null
  lemmaEntryId: string | null
}

export interface LearnerLayer {
  entryId: string
  /** 'ai' for a layer a model wrote, 'dictionary' for one derived from the raw senses. */
  source: 'ai' | 'dictionary'
  gistVi: string[]
  level: string | null
  usageNoteVi: string | null
  status: 'published' | 'hidden'
  senses: LearnerSense[]
  confusables: LearnerLink[]
  labels: SenseLabel[]
}

/** A layer that mentions this entry, read backwards through `target_entry_id`. */
export interface LearnerBacklink {
  entryId: string
  headword: string
  lang: LangCode
  kinds: LinkKind[]
  /** The first note or meaning the mentioning layer gives. */
  note: string | null
}

const linkKind = z.enum(['collocation', 'synonym', 'antonym', 'confusable', 'equivalent'])

const linkRow = z.object({
  sense_order: z.number().nullable(),
  kind: linkKind,
  link_order: z.number(),
  text: z.string(),
  lang: z.string(),
  target_entry_id: z.string().nullable(),
  pattern: z.string().nullable(),
  vi: z.string().nullable(),
  note_vi: z.string().nullable(),
  example: z.string().nullable(),
  example_vi: z.string().nullable(),
  reading: z.string().nullable(),
  example_reading: z.string().nullable().default(null),
})

const layerRow = z.object({
  entry_id: z.string(),
  gist_vi: z.array(z.string()),
  level: z.string().nullable(),
  usage_note_vi: z.string().nullable(),
  status: z.enum(['published', 'hidden']),
  learner_senses: z.array(z.object({
    sense_order: z.number(),
    pos: z.string().nullable(),
    vi_terms: z.array(z.string()),
    vi_definition: z.string(),
    en_definition: z.string().nullable(),
    domain: z.string().nullable(),
    register: z.string().nullable(),
    cefr: z.string().nullable(),
    source_sense_ids: z.array(z.string()),
    learner_examples: z.array(z.object({
      example_order: z.number(),
      text: z.string(),
      reading: z.string().nullable(),
      vi: z.string(),
      source_example_id: z.number().nullable(),
      /** The `lex.examples` row it was copied from, with its source's licence. */
      examples: z.object({ sources: z.object({ license: z.string().nullable() }).nullable() }).nullable().optional(),
    })),
  })),
  learner_links: z.array(linkRow),
  sense_labels: z.array(z.object({
    sense_id: z.string(),
    core_sense_order: z.number().nullable(),
    vi_terms: z.array(z.string()).nullable(),
    domain: z.string().nullable(),
    register: z.string().nullable(),
    is_inflection: z.boolean(),
    lemma: z.string().nullable(),
    lemma_entry_id: z.string().nullable(),
  })),
})

const backlinkRow = z.object({
  entry_id: z.string(),
  kind: linkKind,
  vi: z.string().nullable(),
  note_vi: z.string().nullable(),
  learner_entries: z.object({ entries: z.object({ headword: z.string(), lang: z.string() }) }),
})

const LINK_COLUMNS = 'sense_order, kind, link_order, text, lang, target_entry_id, pattern, vi, note_vi, example, example_vi, reading, example_reading'

export const LEARNER_SELECT =
  'entry_id, gist_vi, level, usage_note_vi, status, ' +
  'learner_senses(sense_order, pos, vi_terms, vi_definition, en_definition, domain, register, cefr, source_sense_ids, ' +
  'learner_examples(example_order, text, reading, vi, source_example_id, examples(sources(license)))), ' +
  `learner_links(${LINK_COLUMNS}), ` +
  'sense_labels(sense_id, core_sense_order, vi_terms, domain, register, is_inflection, lemma, lemma_entry_id)'

type LinkRow = z.infer<typeof linkRow>

/** Layers loaded before `example_reading` existed hold the example's pinyin in `reading` in
 *  19 of 30 Chinese links ("wǒmen yào xuéxí xīn zhīshi." on 学习知识). Sentence punctuation,
 *  or more words than the collocation has characters, marks the example's. The same test as
 *  `is_sentence_reading` in supabase/scripts/learner/learner.py: an ellipsis is not a
 *  sentence, and a Latin letter counts as a character (T恤 reads "T xù"). */
export function isExampleReading(text: string, example: string | null, reading: string): boolean {
  if (!example) return false
  const bare = reading.replace(/\.\.\.|…/g, ' ')
  const units = [...text].filter((c) => /\p{Script=Han}|[A-Za-z]/u.test(c)).length
  const words = bare.split(/\s+/).filter((w) => /\p{L}/u.test(w))
  return /[.?!,;:。，？！]/.test(bare) || words.length > units
}

/** The two pattern names the prompt allows beside the N + V notation. */
const PATTERN_VI: Record<string, string> = { 'phrasal verb': 'cụm động từ', idiom: 'thành ngữ' }

function toLink(r: LinkRow & { lang: LangCode }): LearnerLink {
  const ofExample = r.lang === 'zh' && r.example_reading === null && r.reading !== null
    && isExampleReading(r.text, r.example, r.reading)
  const pattern = r.pattern === null ? null : PATTERN_VI[r.pattern.trim().toLowerCase()] ?? r.pattern
  return {
    kind: r.kind, text: r.text, lang: r.lang, targetEntryId: r.target_entry_id, pattern, vi: r.vi,
    noteVi: r.note_vi, example: r.example, exampleVi: r.example_vi,
    reading: ofExample ? null : r.reading, exampleReading: r.example_reading ?? (ofExample ? r.reading : null),
  }
}

const byOrder = <T extends { link_order: number }>(a: T, b: T) => a.link_order - b.link_order

/** An embed arrives in no particular order, so every list is sorted here. A mention in a
 *  language the product does not teach is dropped rather than failing the layer. Chinese
 *  is levelled by HSK on the entry, so the model's CEFR guess for it is dropped. */
export function parseLearnerLayer(raw: unknown): LearnerLayer {
  const r = layerRow.parse(raw)
  const cefr = (level: string | null) => (splitEntryId(r.entry_id).lang === 'zh' ? null : level)
  const links = r.learner_links
    .filter((l): l is LinkRow & { lang: LangCode } => isLangCode(l.lang))
    .sort(byOrder)
  const of = (order: number, kind: LinkKind) => links.filter((l) => l.sense_order === order && l.kind === kind).map(toLink)
  return {
    entryId: r.entry_id,
    source: 'ai',
    gistVi: r.gist_vi,
    level: cefr(r.level),
    usageNoteVi: r.usage_note_vi,
    status: r.status,
    senses: [...r.learner_senses].sort((a, b) => a.sense_order - b.sense_order).map((s) => ({
      order: s.sense_order,
      pos: s.pos,
      viTerms: s.vi_terms,
      viDefinition: s.vi_definition,
      pivot: false,
      enDefinition: s.en_definition,
      domain: s.domain,
      register: s.register,
      cefr: cefr(s.cefr),
      sourceSenseIds: s.source_sense_ids,
      // A sentence copied verbatim from a source without an open licence is not shown.
      examples: s.learner_examples.filter((x) => !x.examples?.sources || isOpenLicence(x.examples.sources.license))
        .sort((a, b) => a.example_order - b.example_order).map((x) => ({
        text: x.text, reading: x.reading, vi: x.vi, sourceExampleId: x.source_example_id,
        byModel: x.source_example_id === null, sourceId: null,
      })),
      collocations: of(s.sense_order, 'collocation'),
      synonyms: of(s.sense_order, 'synonym'),
      antonyms: of(s.sense_order, 'antonym'),
      equivalents: of(s.sense_order, 'equivalent'),
    })),
    confusables: links.filter((l) => l.sense_order === null && l.kind === 'confusable').map(toLink),
    labels: r.sense_labels.map((l) => ({
      senseId: l.sense_id,
      coreSenseOrder: l.core_sense_order,
      viTerms: l.vi_terms ?? [],
      domain: l.domain,
      register: l.register,
      isInflection: l.is_inflection,
      lemma: l.lemma,
      lemmaEntryId: l.lemma_entry_id,
    })),
  }
}

/** One row per mentioning entry, in the order read, with every kind of mention it makes. */
export function parseBacklinks(raw: unknown): LearnerBacklink[] {
  const out = new Map<string, LearnerBacklink>()
  for (const r of backlinkRow.array().parse(raw)) {
    const { headword, lang } = r.learner_entries.entries
    if (!isLangCode(lang)) continue
    const b = out.get(r.entry_id) ?? { entryId: r.entry_id, headword, lang, kinds: [], note: null }
    if (!b.kinds.includes(r.kind)) b.kinds.push(r.kind)
    b.note ??= r.note_vi ?? r.vi
    out.set(r.entry_id, b)
  }
  return [...out.values()]
}

/** The published layer of one entry, or null when it has none. A failed read throws, so
 *  the cache keeps nothing and the caller decides. */
export async function getLearnerLayer(supabase: SupabaseClient, entryId: string): Promise<LearnerLayer | null> {
  const { data, error } = await supabase.schema('lex').from('learner_entries')
    .select(LEARNER_SELECT).eq('entry_id', entryId).eq('status', 'published').maybeSingle()
  if (error) throw error
  return data ? parseLearnerLayer(data) : null
}

/** Mentions read per entry; take, the most linked pilot word, has 5. */
const MAX_BACKLINKS = 200

/** The published layers that mention this entry, other than its own. */
export async function getLearnerBacklinks(supabase: SupabaseClient, entryId: string): Promise<LearnerBacklink[]> {
  const { data, error } = await supabase.schema('lex').from('learner_links')
    .select('entry_id, kind, vi, note_vi, learner_entries!inner(entries(headword, lang))')
    .eq('target_entry_id', entryId).neq('entry_id', entryId)
    .eq('learner_entries.status', 'published')
    .order('entry_id').order('link_order')
    .limit(MAX_BACKLINKS)
  if (error) throw error
  return parseBacklinks(data ?? [])
}

/** Vietnamese names of the subject fields and registers the layer writes, as the prototype
 *  the owner approved names them. Anything else shows as written. */
const DOMAIN_VI: Record<string, string> = {
  law: 'luật', finance: 'tài chính', insurance: 'bảo hiểm', commerce: 'thương mại', medicine: 'y học',
  biology: 'sinh học', chemistry: 'hóa học', physics: 'vật lý', mathematics: 'toán học', computing: 'tin học',
  sport: 'thể thao', games: 'trò chơi', music: 'âm nhạc', military: 'quân sự', religion: 'tôn giáo',
  nautical: 'hàng hải', agriculture: 'nông nghiệp', cooking: 'ẩm thực', linguistics: 'ngôn ngữ học',
  politics: 'chính trị', technology: 'kỹ thuật', transport: 'giao thông', other: 'chuyên ngành',
}
const REGISTER_VI: Record<string, string> = {
  formal: 'trang trọng', informal: 'thân mật', slang: 'tiếng lóng', vulgar: 'thô tục', offensive: 'xúc phạm',
  archaic: 'cổ', dated: 'cũ', literary: 'văn chương', regional: 'địa phương', rare: 'hiếm',
}
// Object.hasOwn: the key is database text, and a bare lookup of "constructor" answers a function.
export const domainLabel = (d: string) => (Object.hasOwn(DOMAIN_VI, d) ? DOMAIN_VI[d] : d)
export const registerLabel = (r: string) => (Object.hasOwn(REGISTER_VI, r) ? REGISTER_VI[r] : r)

export const LINK_KIND_VI: Record<LinkKind, string> = {
  collocation: 'kết hợp', synonym: 'đồng nghĩa', antonym: 'trái nghĩa', confusable: 'dễ nhầm', equivalent: 'tương đương',
}

/** "#5, #1": the Wiktionary sense numbers a core sense came from, which are the raw
 *  senses' `sense_order`. An id the entry no longer has is left out. */
export function sourceNumbers(ids: string[], senses: { id?: string; senseOrder: number }[]): string {
  const order = new Map(senses.map((s) => [s.id, s.senseOrder]))
  return ids.flatMap((id) => {
    const n = order.get(id)
    return n === undefined ? [] : [`#${n}`]
  }).join(', ')
}

export interface MinorSense extends SenseLabel {
  pos: string | null
  glossEn: string | null
}

/** The senses no core sense covers, split into real meanings and forms of another word,
 *  each with the part of speech and English of the raw sense it labels. A row that reads
 *  the same as one before it is left out, and so is Wiktionary's "inflection of casar:"
 *  line when forms of that lemma follow it: on casa it heads #3 and #4. */
export function minorSenses(
  layer: Pick<LearnerLayer, 'labels'>,
  senses: { id?: string; pos: string | null; glossEn: string | null; senseOrder: number }[],
): { other: MinorSense[]; inflections: MinorSense[] } {
  const raw = new Map(senses.map((s) => [s.id, s]))
  const rank = (id: string) => raw.get(id)?.senseOrder ?? 0
  const minor = layer.labels
    .filter((l) => l.coreSenseOrder === null)
    .sort((a, b) => rank(a.senseId) - rank(b.senseId))
    .map((l) => ({ ...l, pos: raw.get(l.senseId)?.pos ?? null, glossEn: raw.get(l.senseId)?.glossEn ?? null }))
  const heading = (m: MinorSense) => m.isInflection && /:\s*$/.test(m.glossEn ?? '')
    && minor.some((o) => o !== m && o.isInflection && o.lemma === m.lemma && !/:\s*$/.test(o.glossEn ?? ''))
  const key = (m: MinorSense) => JSON.stringify([m.isInflection, m.viTerms, m.lemma, m.pos, m.domain, m.register, m.glossEn])
  const keys = new Set<string>()
  const kept = minor.filter((m) => !heading(m) && !keys.has(key(m)) && keys.add(key(m)))
  return { other: kept.filter((m) => !m.isInflection), inflections: kept.filter((m) => m.isInflection) }
}

/** Wiktionary's grammar terms for a word form, longest first so "past participle" wins over "past". */
const FORM_TERMS_VI: [string, string][] = [
  ['past participle', 'phân từ quá khứ'], ['present participle', 'phân từ hiện tại'], ['simple past', 'quá khứ đơn'],
  ['past tense', 'quá khứ'], ['present tense', 'hiện tại'], ['first-person', 'ngôi thứ nhất'],
  ['second-person', 'ngôi thứ hai'], ['third-person', 'ngôi thứ ba'], ['singular', 'số ít'], ['plural', 'số nhiều'],
  ['present', 'hiện tại'], ['preterite', 'quá khứ đơn'], ['imperfect', 'quá khứ chưa hoàn thành'],
  ['future', 'tương lai'], ['conditional', 'điều kiện'], ['pluperfect', 'quá khứ hoàn thành'], ['past', 'quá khứ'],
  ['indicative', 'thức chỉ định'], ['subjunctive', 'thức giả định'], ['imperative', 'thức mệnh lệnh'],
  ['participle', 'phân từ'], ['gerund', 'danh động từ'], ['infinitive', 'nguyên mẫu'],
  ['masculine', 'giống đực'], ['feminine', 'giống cái'], ['neuter', 'giống trung'],
  ['comparative', 'so sánh hơn'], ['superlative', 'so sánh nhất'], ['affirmative', 'khẳng định'],
  ['negative', 'phủ định'], ['formal', 'trang trọng'], ['informal', 'thân mật'], ['form', 'dạng'],
  ['and', 'và'], ['or', 'hoặc'], ['tense', ''],
]
const FORM_TERM = new RegExp(`(?<![\\p{L}-])(?:${FORM_TERMS_VI.map(([en]) => en).join('|')})(?![\\p{L}-])`, 'giu')

/** A form description in Vietnamese: "third-person singular present indicative of casar"
 *  reads "ngôi thứ ba số ít hiện tại thức chỉ định của casar". The word after "of" and any
 *  term without a translation stay as Wiktionary wrote them. */
export function formDescriptionVi(glossEn: string): string {
  const cut = glossEn.search(/\sof\s/i)
  const head = cut < 0 ? glossEn : glossEn.slice(0, cut)
  const tail = cut < 0 ? '' : ` của ${glossEn.slice(cut).replace(/^\s+of\s+/i, '')}`
  const vi = head.replace(FORM_TERM, (m) => FORM_TERMS_VI.find(([en]) => en === m.toLowerCase())?.[1] ?? m)
  return `${vi.replace(/\s{2,}/g, ' ').trim()}${tail}`
}

/** English endings a stem takes: "stat" makes states and stating, never station. */
const EN_ENDINGS = '(?:s|es|ed|d|ing|y|ies|ied|er|ers|est)?'

/** A sentence cut around the headword and its forms, so a layout can set them in bold.
 *  Chinese matches the characters. Elsewhere the headword and its listed forms match
 *  whole, and a stem of at least 4 letters also takes endings, so "warranties" and "took"
 *  (a listed form) are caught while dar leaves "de" and go leaves "good" alone. */
/** Where the parts `markHeadword` sets in bold sit in the text, as `[start, end)` ranges. */
export function markedRanges(parts: { text: string; mark: boolean }[]): [number, number][] {
  const out: [number, number][] = []
  let at = 0
  for (const p of parts) {
    if (p.mark) out.push([at, at + p.text.length])
    at += p.text.length
  }
  return out
}

export function markHeadword(text: string, headword: string, lang: LangCode, forms: string[] = []): { text: string; mark: boolean }[] {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const h = headword.toLowerCase()
  let pattern: string
  if (lang === 'zh') {
    pattern = escape(headword)
  } else {
    const stem = lang === 'es' && /(ar|er|ir)$/.test(h) ? h.slice(0, -2) : h.length > 4 && /[eyo]$/.test(h) ? h.slice(0, -1) : h
    const words = [...new Set([h, ...forms.map((f) => f.toLowerCase())])].filter(Boolean).map(escape)
    if ([...stem].length >= 4) words.push(`${escape(stem)}${lang === 'es' ? '\\p{L}{0,5}' : EN_ENDINGS}`)
    pattern = `(?<!\\p{L})(?:${words.join('|')})(?!\\p{L})`
  }
  const out: { text: string; mark: boolean }[] = []
  let last = 0
  for (const m of text.matchAll(new RegExp(pattern, 'giu'))) {
    const at = m.index ?? 0
    if (at > last) out.push({ text: text.slice(last, at), mark: false })
    out.push({ text: m[0], mark: true })
    last = at + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), mark: false })
  return out
}

const distractorLinkRow = z.object({
  entry_id: z.string(),
  kind: z.enum(['confusable', 'synonym']),
  target_entry_id: z.string(),
})
const gistRow = z.object({ entry_id: z.string(), gist_vi: z.array(z.string()) })

/** Each entry's confusables and synonyms as their first published Vietnamese gist, for quiz
 *  distractors. Two reads: those links carry no `vi` of their own. */
export async function listLearnerDistractors(
  supabase: SupabaseClient, entryIds: string[],
): Promise<Map<string, LearnerDistractors>> {
  if (entryIds.length === 0) return new Map()
  const lex = supabase.schema('lex')
  const { data, error } = await lex.from('learner_links').select('entry_id, kind, target_entry_id')
    .in('entry_id', entryIds).in('kind', ['confusable', 'synonym']).not('target_entry_id', 'is', null)
    .order('link_order')
  if (error) throw error
  const links = distractorLinkRow.array().parse(data ?? [])
  if (links.length === 0) return new Map()
  const { data: gists, error: gistError } = await lex.from('learner_entries').select('entry_id, gist_vi')
    .in('entry_id', [...new Set(links.map((l) => l.target_entry_id))]).eq('status', 'published')
  if (gistError) throw gistError
  const gist = new Map(gistRow.array().parse(gists ?? [])
    .flatMap((g): [string, string][] => (g.gist_vi[0] ? [[g.entry_id, g.gist_vi[0]]] : [])))
  const out = new Map<string, LearnerDistractors>()
  for (const l of links) {
    const text = gist.get(l.target_entry_id)
    if (!text) continue
    const d = out.get(l.entry_id) ?? { confusable: [], synonym: [] }
    d[l.kind].push(text)
    out.set(l.entry_id, d)
  }
  return out
}
