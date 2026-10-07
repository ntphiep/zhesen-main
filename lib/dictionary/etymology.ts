/**
 * Learner notes read from a kaikki (wiktextract) English record: where the word comes from,
 * how it splits into syllables, which words sound the same, and the grammar labels of each
 * sense. The origin is read from the etymology templates, never from the text, because the
 * stored text opens with an "Etymology tree" block and mixes cognates into the chain. Only
 * `scripts/wiktNotes/build.mjs` runs this.
 */
import type { Origin, OriginKind, OriginPart, OriginRel, OriginStep } from './types'

export interface KaikkiTemplate {
  name: string
  args: Record<string, string>
  expansion?: string
}

/** A term of the new etymology syntax: `enm:dixionare<id:dictionary>`,
 *  `porter<alt:porte><t:he carries>`. Modifiers may nest: `<ety:inh<ang:bōcian>>`. */
export interface Term {
  lang: string | null
  word: string
  mods: Record<string, string>
}

const LANG_PREFIX = /^([a-z]{2,3}(?:-[a-z]{2,4}){0,2}):(?=\S)/

/** Splits `abc<x><y<z>>` into `abc` and the bracketed groups `x`, `y<z>`. */
function groups(s: string): { head: string; inner: string[] } {
  const inner: string[] = []
  let depth = 0
  let head = ''
  let cur = ''
  for (const c of s) {
    if (c === '<') {
      if (depth > 0) cur += c
      depth += 1
    } else if (c === '>' && depth > 0) {
      depth -= 1
      if (depth === 0) { inner.push(cur); cur = '' } else cur += c
    } else if (depth > 0) cur += c
    else head += c
  }
  return { head, inner }
}

export function parseTerm(raw: string): Term {
  const { head, inner } = groups(raw.trim())
  const mods: Record<string, string> = {}
  for (const g of inner) {
    const i = g.indexOf(':')
    if (i > 0 && !(g.slice(0, i) in mods)) mods[g.slice(0, i)] = g.slice(i + 1)
  }
  const m = LANG_PREFIX.exec(head)
  // Spellings of one ancestor come separated, the usual one first: nighte,night and werre//wyrre.
  const word = (m ? head.slice(m[0].length) : head).replace(/\[\[|\]\]/g, '').split(/,|\/\//)[0].trim()
  return { lang: m ? m[1] : null, word, mods }
}

/** The keyword and terms of an `ety` modifier body: `inh<ang:bōcian>`, `af<a><b>`. */
function parseEtyBody(body: string): { keyword: string; terms: Term[] } {
  const { head, inner } = groups(body)
  return { keyword: head.trim(), terms: inner.map(parseTerm) }
}

const REL: Record<string, OriginRel> = {
  inh: 'inh', 'inh+': 'inh', 'inh-lite': 'inh',
  der: 'der', 'der+': 'der', 'der-lite': 'der', uder: 'der', from: 'der',
  bor: 'bor', 'bor+': 'bor', ubor: 'bor', obor: 'bor', psm: 'bor',
  lbor: 'lbor', slbor: 'lbor',
  calque: 'calque', cal: 'calque', clq: 'calque', sl: 'calque',
}

const PARTS = new Set(['af', 'affix', 'suffix', 'prefix', 'confix', 'compound', 'com', 'blend', 'surf'])
const KINDS: Record<string, OriginKind> = {
  clipping: 'clipping', clip: 'clipping',
  'back-form': 'back-formation', 'back-formation': 'back-formation', bf: 'back-formation',
  onomatopoeic: 'onomatopoeia', onom: 'onomatopoeia',
  coinage: 'coinage', coin: 'coinage',
}
const DOUBLETS = new Set(['doublet', 'dbt'])

const NON_LATIN = /[^\p{Script=Latin}\p{N}\p{P}\p{S}\p{M}\s]/u

/** Most chain steps carry no `tr`: the expansion has the reading generated in brackets
 *  after the word, `Ancient Greek ἐγκύκλιος (enkúklios, “circular”)`. */
function translit(word: string, args: Record<string, string>, expansion: string | undefined): string | undefined {
  if (args.tr) return args.tr
  if (!NON_LATIN.test(word) || !expansion) return undefined
  const at = expansion.indexOf(word)
  if (at < 0) return undefined
  const m = /^\s*\(([^,“”()]+?)(?:,|\))/.exec(expansion.slice(at + word.length))
  return m?.[1].trim() || undefined
}

/** A gloss as text: no HTML, Wiktionary's private-use brackets as parentheses, and nothing
 *  after a closing quote, where a second gloss of the expansion begins. */
const clean = (s: string | undefined) => {
  const t = s?.replace(/<[^>]+>/g, '').replace(/\u{10203F}/gu, '(').replace(/\u{102040}/gu, ')')
    .split('”')[0].replace(/“/g, '').replace(/\[\[|\]\]/g, '').replace(/\s+/g, ' ').trim()
  return t || undefined
}

function stepOf(t: KaikkiTemplate): OriginStep | null {
  const rel = REL[t.name]
  const a = t.args
  if (!rel || a['1'] !== 'en' || !a['2']) return null
  const term = parseTerm(a['3'] || a['4'] || '')
  if (!term.word || term.word === '-') return null
  const gloss = clean(a.t || a.gloss || a['5'] || term.mods.t)
  const tr = translit(term.word, a, t.expansion)
  return { rel, lang: a['2'], word: term.word, ...(gloss && { gloss }), ...(tr && { tr }) }
}

/** The chain an `ety` or `etymon` term carries in its nested `ety` modifier:
 *  `enm:booken<ety:inh<ang:bōcian>>` gives booken then bōcian. */
function nestedChain(rel: OriginRel, term: Term, out: OriginStep[]) {
  if (!term.lang || !term.word || term.word === '-' || term.lang === 'en') return
  const gloss = clean(term.mods.t)
  const tr = clean(term.mods.tr)
  out.push({ rel, lang: term.lang, word: term.word, ...(gloss && { gloss }), ...(tr && { tr }) })
  if (!term.mods.ety || out.length >= 8) return
  const { keyword, terms } = parseEtyBody(term.mods.ety)
  const next = REL[keyword]
  if (next && terms[0]) nestedChain(next, terms[0], out)
}

/** Positional arguments of an `ety` template grouped under the keyword before them:
 *  `:inh enm:dixionare :afeq diction -ary`. */
function etyGroups(args: Record<string, string>): { keyword: string; terms: Term[] }[] {
  const out: { keyword: string; terms: Term[] }[] = []
  const keys = Object.keys(args).filter((k) => /^\d+$/.test(k) && k !== '1').sort((a, b) => Number(a) - Number(b))
  for (const k of keys) {
    const v = args[k]
    if (v.startsWith(':')) out.push({ keyword: v.slice(1).split('<')[0], terms: [] })
    else if (out.length && v) out[out.length - 1].terms.push(parseTerm(v))
  }
  return out
}

const letters = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')

/** Parts that spell the start or the end of the word, so a template about another word in a
 *  "Compare" sentence is not taken for this one's. */
function partsFit(word: string, parts: OriginPart[]): boolean {
  const w = letters(word)
  const first = letters(parts[0].word)
  const last = letters(parts[parts.length - 1].word)
  return (first.length >= 2 && w.startsWith(first.slice(0, 2))) || (last.length >= 2 && w.endsWith(last.slice(-2)))
}

function partsOf(t: KaikkiTemplate): OriginPart[] | null {
  const a = t.args
  if (!PARTS.has(t.name) || a['1'] !== 'en') return null
  const raw = Object.keys(a).filter((k) => /^\d+$/.test(k) && k !== '1').sort((x, y) => Number(x) - Number(y)).map((k) => a[k])
  const words = raw.map((r) => parseTerm(r))
  // A part an editor left as [Term?] is not known yet.
  if (words.length < 2 || words.some((w) => !w.word || w.lang || /[[\]?]/.test(w.word))) return null
  if (t.name === 'suffix' && !words[1].word.startsWith('-')) words[1].word = `-${words[1].word}`
  if (t.name === 'prefix' && !words[0].word.endsWith('-')) words[0].word = `${words[0].word}-`
  return words.map((w, i) => {
    const gloss = clean(a[`t${i + 1}`] || a[`gloss${i + 1}`] || w.mods.t)
    return { word: w.word, ...(gloss && { gloss }) }
  })
}

/** The prose after an "Etymology tree" block, which ends on the line naming the word. */
export function etymologyProse(text: string | undefined, word: string): string {
  if (!text) return ''
  if (!text.startsWith('Etymology tree')) return text
  const lines = text.split('\n')
  const end = lines.lastIndexOf(`English ${word}`)
  return end >= 0 ? lines.slice(end + 1).join('\n') : lines[lines.length - 1]
}

/** The opening sentence, which is where a statement about the whole word lives; later lines
 *  qualify one sense, as abduct's "(physiology): Back-formation from abduction". */
function firstSentence(prose: string): string {
  const m = /^[\s\S]*?\.(?=\s|$)/.exec(prose)
  return (m ? m[0] : prose).split('\n')[0].toLowerCase()
}

function kindOf(t: KaikkiTemplate, opening: string): Origin['kind'] | null {
  const type = KINDS[t.name]
  const a = t.args
  if (!type || a['1'] !== 'en' || !t.expansion) return null
  if (!opening.includes(t.expansion.toLowerCase().slice(0, 40))) return null
  if (type === 'onomatopoeia') return { type }
  const target = clean(a['2'] && parseTerm(a['2']).word)
  if (!target) return null
  if (type === 'coinage') {
    const year = clean(a.in)
    return { type, ...(!/^Q\d+$/.test(target) && { by: target }), ...(year && { year }) }
  }
  return { type, word: target.split(',')[0].trim() }
}

/** The origin of one etymology of a word, from its templates. Null when they say nothing a
 *  learner can use. */
export function originOf(word: string, templates: KaikkiTemplate[], text: string | undefined, pos: string[]): Origin | null {
  const chain: OriginStep[] = []
  const seen = new Set<string>()
  // The chain ends at Proto-Indo-European, the deepest a step goes, and at a language it has
  // already passed through, which is a second theory: sea goes back to *sh₂ey- and then
  // offers Proto-Germanic *sīhwaną.
  let closed = false
  const add = (s: OriginStep) => {
    const key = `${s.lang}|${s.word}`
    if (seen.has(key) || closed) return
    if (chain.some((c) => c.lang === s.lang)) { closed = true; return }
    seen.add(key)
    chain.push(s)
    closed = s.lang === 'ine-pro' || chain.length >= 8
  }
  let parts: OriginPart[] | null = null
  let kind: Origin['kind'] | null = null
  const doublets: string[] = []
  const opening = firstSentence(etymologyProse(text, word))

  for (const t of templates) {
    const step = stepOf(t)
    if (step) { add(step); continue }
    if (!parts) {
      const p = partsOf(t)
      if (p && partsFit(word, p)) { parts = p; continue }
    }
    if (!kind) {
      const k = kindOf(t, opening)
      if (k) { kind = k; continue }
    }
    if (DOUBLETS.has(t.name) && t.args['1'] === 'en') {
      for (const k of Object.keys(t.args).filter((x) => /^\d+$/.test(x) && x !== '1')) {
        const d = parseTerm(t.args[k]).word
        if (d && d !== word && !doublets.includes(d)) doublets.push(d)
      }
    }
  }

  // Records written in the new syntax carry everything in one `ety` or `etymon` template.
  for (const t of templates) {
    if ((t.name !== 'ety' && t.name !== 'etymon') || t.args['1'] !== 'en') continue
    for (const g of etyGroups(t.args)) {
      const rel = REL[g.keyword]
      if (rel && chain.length === 0 && g.terms[0]) {
        const steps: OriginStep[] = []
        nestedChain(rel, g.terms[0], steps)
        steps.forEach(add)
      } else if (['af', 'afeq', 'compound', 'blend', 'surf'].includes(g.keyword) && !parts && g.terms.length >= 2) {
        const p = g.terms.map((x) => ({ word: x.word, ...(clean(x.mods.t) && { gloss: clean(x.mods.t) }) }))
        if (g.terms.every((x) => x.word && (!x.lang || x.lang === 'en')) && partsFit(word, p)) parts = p
      } else if ((g.keyword === 'clip' || g.keyword === 'clipping' || g.keyword === 'bf') && !kind && g.terms[0]?.word) {
        kind = { type: g.keyword === 'bf' ? 'back-formation' : 'clipping', word: g.terms[0].word }
      }
    }
  }

  if (!chain.length && !parts && !kind) return null
  return {
    pos,
    chain,
    ...(parts && { parts }),
    ...(kind && { kind }),
    ...(doublets.length && { doublets: doublets.slice(0, 5) }),
  }
}

/** The English name kaikki writes before a chain step's word, `Medieval Latin` in
 *  `Medieval Latin dictiōnārium`, or null when the expansion does not show it. */
export function langNameOf(t: KaikkiTemplate): string | null {
  const step = stepOf(t)
  if (!step || !t.expansion) return null
  const at = t.expansion.indexOf(step.word)
  if (at <= 0) return null
  const name = t.expansion.slice(0, at).replace(/^.*\b(?:from|of)\s+/i, '').trim()
  return /^[A-Z][\p{L} '-]{1,40}$/u.test(name) ? name : null
}

/** Sense tags a learner reads as grammar: count, valency, number, comparison, position. */
const GRAMMAR_TAGS = new Set([
  'countable', 'uncountable', 'transitive', 'intransitive', 'ditransitive', 'ambitransitive',
  'reflexive', 'ergative', 'copulative', 'auxiliary', 'plural-only', 'in-plural',
  'plural-normally', 'singular-only', 'not-comparable', 'attributive', 'predicative',
  'with-definite-article', 'passive',
])
const PREPOSITIONS = new Set([
  'about', 'after', 'against', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'off', 'on',
  'onto', 'out', 'over', 'to', 'towards', 'up', 'upon', 'with', 'down', 'around', 'through',
])

/** The grammar labels of one sense: its learner-facing tags plus the word it is used with,
 *  `with to` from raw tags written `with to`, `followed by to` or `with "to"`. */
export function senseGrammar(tags: string[] | undefined, rawTags: string[] | undefined): string[] {
  const out = (tags ?? []).filter((t) => GRAMMAR_TAGS.has(t))
  for (const raw of rawTags ?? []) {
    const r = raw.replace(/[“”"'‘’]/g, '').trim().toLowerCase()
    const m = /^(?:with|followed by|used with) (the|a|an|[a-z]+)$/.exec(r)
    if (m && m[1] === 'the') out.push('with-definite-article')
    else if (m && PREPOSITIONS.has(m[1])) out.push(`with ${m[1]}`)
    else if (r === 'in the negative' || r === 'in negative constructions' || r === 'usually in the negative') out.push('negative')
    else if (r === 'with the definite article') out.push('with-definite-article')
  }
  return [...new Set(out)]
}

/** The written syllables kaikki gives, kept only when they spell the word. */
export function syllablesOf(word: string, hyphenations: { parts?: string[] }[] | undefined): string[] | null {
  const parts = hyphenations?.[0]?.parts
  if (!parts || parts.length < 2 || parts.join('') !== word) return null
  return parts
}

/** Homophones a learner can trust: unqualified, not the word in another case, and with an
 *  entry of their own. Naming the etymology meant, as one does with won (etymology 1), is
 *  no qualifier. */
export function homophonesOf(word: string, sounds: { homophone?: string }[] | undefined, exists: (w: string) => boolean): string[] {
  const out: string[] = []
  for (const s of sounds ?? []) {
    const h = s.homophone?.replace(/\s*\(etymolog(?:y|ies)\b[^)]*\)$/i, '').trim()
    if (!h || /[()]/.test(h) || h.toLowerCase() === word.toLowerCase() || out.includes(h)) continue
    if (exists(h)) out.push(h)
  }
  return out.slice(0, 6)
}

export interface KaikkiSound { ipa?: string; tags?: string[]; raw_tags?: string[]; note?: string }

const UK_TAGS = new Set(['Received-Pronunciation', 'UK', 'British', 'Standard', 'Southern'])
const US_TAGS = new Set(['General-American', 'US', 'American'])
const ACCENT_TAGS = new Set([...UK_TAGS, ...US_TAGS, 'Canada', 'Australia', 'General-Australian', 'New-Zealand'])

/** A pronunciation of a standard accent: tent /tɪnt/ in the pin-pen merger, what /hɒt/ in
 *  Canadian dialect and the weak form of are are not. */
const standardRow = (s: KaikkiSound) => Boolean(s.ipa?.startsWith('/')) && !s.raw_tags?.length
  && (s.tags ?? []).every((t) => ACCENT_TAGS.has(t)) && !/merger|weak|dialect/i.test(s.note ?? '')

/** Every phonemic form of a word in a standard accent. */
export function standardForms(sounds: KaikkiSound[] | undefined): string[] {
  return [...new Set((sounds ?? []).filter(standardRow).flatMap((s) => phonemicForms(s.ipa)))]
}

/** The forms a learner reads first: the first standard UK row and the first US one, an
 *  untagged row counting for both. are lists /ɛə(ɹ)/ among its strong forms, after /ɑː/. */
export function leadForms(sounds: KaikkiSound[] | undefined): string[] {
  const rows = (sounds ?? []).filter(standardRow)
  const first = (accent: Set<string>) => rows.find((s) => !s.tags?.length || s.tags.some((t) => accent.has(t)))
  return [...new Set([first(UK_TAGS), first(US_TAGS)].flatMap((s) => (s ? phonemicForms(s.ipa) : [])))]
}

/** The phonemic transcriptions of a sound row, flattened for comparing two words: stress,
 *  syllable and non-syllabic marks dropped, an optional sound both kept and dropped. A
 *  narrow [phonetic] transcription gives none. */
export function phonemicForms(ipa: string | undefined): string[] {
  const out = new Set<string>()
  for (const [, inner] of (ipa ?? '').matchAll(/\/([^/]+)\//g)) {
    const flat = inner.normalize('NFD').replace(/[ˈˌ.‿\s̯͡]/g, '').replace(/ɹ/g, 'r').replace(/ɡ/g, 'g').replace(/ɫ/g, 'l')
    for (const f of [flat.replace(/\([^)]*\)/g, ''), flat.replace(/[()]/g, '')]) if (f) out.add(f)
  }
  return [...out]
}
