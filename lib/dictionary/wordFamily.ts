/**
 * English word families from Open English WordNet's morphological links: decide gives
 * decision, decisive, decisively, indecisive. Wiktionary files decision under "Related
 * terms" beside unrelated thesaurus words, and its "Derived terms" are mostly compounds, so
 * neither yields a family. A family is every word one link away, then every word two links
 * away that still shares the stem, so a polysemous member cannot pull in another root.
 * WordNet's pertainyms are semantic as often as morphological (photic for light, puerile for
 * child), so one counts only when the two words share a stem. Only
 * `scripts/wordFamily/build.mjs` runs this.
 */

export type FamilyLinkKind = 'derivation' | 'pertainym' | 'participle' | 'antonym'

export interface FamilyLink {
  a: string
  b: string
  kind: FamilyLinkKind
}

/** Members kept per word, the most a word page lists in one block. */
export const FAMILY_MAX = 12

const NEGATIVE = ['un', 'in', 'im', 'il', 'ir', 'dis', 'non', 'non-'] as const
const WORD = /^[a-z]+(?:-[a-z]+)*$/

/** An antonym belongs to the family only when it is the word with a negative prefix:
 *  indecisive for decisive, never weak for strong. */
export function negates(a: string, b: string): boolean {
  return NEGATIVE.some((p) => b === p + a || a === p + b)
}

const lcp = (a: string, b: string) => {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1
  return i
}

/** The word without a negative prefix, when what is left is a word itself. */
function core(word: string, words: ReadonlySet<string>): string {
  for (const p of NEGATIVE) {
    const rest = word.slice(p.length)
    if (word.startsWith(p) && rest.length >= 4 && words.has(rest)) return rest
  }
  return word
}

/** Whether two words share a stem: four letters, or the whole of a shorter word. */
function sharesStem(a: string, b: string, words: ReadonlySet<string>): boolean {
  const x = core(a, words)
  const y = core(b, words)
  return lcp(x, y) >= Math.min(4, x.length, y.length)
}

/** Each word's family, nearest first, then shorter first. Words that are not one lowercase
 *  token (names, phrases) take no part. */
export function wordFamilies(links: readonly FamilyLink[], max = FAMILY_MAX): Map<string, string[]> {
  const near = new Map<string, Set<string>>()
  const add = (a: string, b: string) => {
    if (!near.has(a)) near.set(a, new Set())
    near.get(a)!.add(b)
  }
  for (const { a, b, kind } of links) {
    if (a === b || !WORD.test(a) || !WORD.test(b)) continue
    if (kind === 'antonym' && !negates(a, b)) continue
    if ((kind === 'pertainym' || kind === 'participle') && lcp(a, b) < Math.min(4, a.length, b.length)) continue
    add(a, b)
    add(b, a)
  }
  const words = new Set(near.keys())
  const out = new Map<string, string[]>()
  const order = (a: string, b: string) => a.length - b.length || a.localeCompare(b)
  for (const [word, first] of near) {
    const second = new Set<string>()
    for (const m of first) {
      for (const x of near.get(m) ?? []) {
        if (x !== word && !first.has(x) && sharesStem(word, x, words)) second.add(x)
      }
    }
    out.set(word, [...[...first].sort(order), ...[...second].sort(order)].slice(0, max))
  }
  return out
}
