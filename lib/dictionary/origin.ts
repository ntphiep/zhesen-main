import { posGroup } from './pos'
import languages from './originLanguages.json'
import type { EntryNotes, Origin, OriginStep } from './types'

/** Vietnamese names of the languages English words come from most. Any other code shows
 *  the English name Wiktionary gives it. */
const LANG_VI: Record<string, string> = languages

/** The language a step is in, in Vietnamese when the table names it. */
export function langLabel(step: Pick<OriginStep, 'lang' | 'name'>): string {
  return (Object.hasOwn(LANG_VI, step.lang) ? LANG_VI[step.lang] : null) ?? step.name ?? step.lang
}

/** What each step says about the one before it. A learner needs only whether the word was
 *  borrowed: inherited and derived read the same. */
export const REL_VI: Record<OriginStep['rel'], string> = {
  inh: 'từ', der: 'từ', bor: 'mượn từ', lbor: 'mượn từ', calque: 'dịch sát từ',
}

/** How the word was made: a line, then the word it was made from when there is one. */
export function kindLine(kind: NonNullable<Origin['kind']>): { text: string; word?: string; linked?: boolean } {
  switch (kind.type) {
    case 'clipping': return { text: 'Rút gọn từ', word: kind.word, linked: kind.e }
    case 'back-formation': return { text: 'Tạo ngược từ', word: kind.word, linked: kind.e }
    case 'onomatopoeia': return { text: 'Từ tượng thanh' }
    case 'coinage': return { text: [kind.by ? `${kind.by} đặt ra` : 'Từ mới đặt ra', kind.year && `năm ${kind.year}`].filter(Boolean).join(' ') }
  }
}

/** The etymologies to show, the one covering the leading part of speech first, and at most
 *  three: deal has three, set more. */
export function shownOrigins(notes: Pick<EntryNotes, 'origins'> | null | undefined, leadPos: string | null | undefined): Origin[] {
  const origins = notes?.origins ?? []
  const lead = posGroup(leadPos)?.key
  const covers = (o: Origin) => (lead && o.pos.some((p) => posGroup(p)?.key === lead) ? 0 : 1)
  return [...origins].sort((a, b) => covers(a) - covers(b)).slice(0, 3)
}

/** The parts of speech an etymology covers, as the word page names them. */
export function originPosLabel(o: Origin): string {
  return [...new Set(o.pos.map((p) => posGroup(p)?.labelVi.toLocaleLowerCase('vi')).filter(Boolean))].join(', ')
}

/** Grammar labels in the order a learner reads them, with the pairs Wiktionary tags
 *  separately said once: countable and uncountable, transitive and intransitive. */
const GRAMMAR_VI: [string, string][] = [
  ['countable', 'đếm được'],
  ['uncountable', 'không đếm được'],
  ['plural-only', 'chỉ dùng số nhiều'],
  ['in-plural', 'thường dùng số nhiều'],
  ['plural-normally', 'thường dùng số nhiều'],
  ['singular-only', 'chỉ dùng số ít'],
  ['with-definite-article', 'đi với the'],
  ['transitive', 'ngoại động từ'],
  ['intransitive', 'nội động từ'],
  ['ambitransitive', 'nội và ngoại động từ'],
  ['ditransitive', 'có hai tân ngữ'],
  ['reflexive', 'phản thân'],
  ['copulative', 'động từ nối'],
  ['auxiliary', 'trợ động từ'],
  ['passive', 'thường ở bị động'],
  ['not-comparable', 'không so sánh'],
  ['attributive', 'đứng trước danh từ'],
  ['predicative', 'đứng sau động từ nối'],
  ['negative', 'thường ở câu phủ định'],
]
const GRAMMAR_ORDER = new Map(GRAMMAR_VI.map(([k], i) => [k, i]))
const GRAMMAR_LABEL = new Map(GRAMMAR_VI)

/** The Vietnamese grammar labels of one or more senses, each said once: `with the` and
 *  `with-definite-article` read the same. */
export function grammarLabels(notes: Pick<EntryNotes, 'senseGrammar'> | null | undefined, senseIds: (string | undefined)[]): string[] {
  const tags = new Set(senseIds.flatMap((id) => (id && notes && Object.hasOwn(notes.senseGrammar, id) ? notes.senseGrammar[id] : [])))
  const pair = (a: string, b: string, both: string) => {
    if (tags.has(a) && tags.has(b)) { tags.delete(a); tags.delete(b); tags.add(both) }
  }
  pair('countable', 'uncountable', 'countable-uncountable')
  pair('transitive', 'intransitive', 'ambitransitive')
  // An ergative verb takes an object or not: the door opened, she opened the door.
  if (tags.delete('ergative')) tags.add('ambitransitive')
  if (tags.has('ambitransitive')) { tags.delete('transitive'); tags.delete('intransitive') }
  if (tags.has('plural-normally')) tags.delete('in-plural')
  const labels: { at: number; text: string }[] = []
  for (const t of tags) {
    if (t === 'countable-uncountable') labels.push({ at: 0, text: 'đếm được và không đếm được' })
    else if (t.startsWith('with ')) labels.push({ at: GRAMMAR_VI.length, text: `đi với ${t.slice(5)}` })
    else if (GRAMMAR_LABEL.has(t)) labels.push({ at: GRAMMAR_ORDER.get(t) ?? 0, text: GRAMMAR_LABEL.get(t) ?? t })
  }
  return [...new Set(labels.sort((a, b) => a.at - b.at).map((l) => l.text))]
}
