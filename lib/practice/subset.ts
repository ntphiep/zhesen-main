import { isLangCode, type LangCode } from '@/lib/languages'

/** The saved words a round draws from when not the whole notebook: chosen words (the hub's
 *  "Hay sai"), the words of one theory page by entry, one vocabulary level, or every word
 *  whose recognition falls due by the end of the study day. Carried in the mode's URL. */
export type PracticeSubset =
  | { kind: 'words'; ids: string[] }
  | { kind: 'entries'; ids: string[] }
  | { kind: 'level'; lang: LangCode; level: string }
  | { kind: 'due' }

/** As many as one round's pool (`PRACTICE_POOL`). */
const MAX_IDS = 60
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// An entry key may hold a comma (887 on production), so each id is its own parameter.
const ENTRY = /^(en|zh|es):.{1,200}$/

type Params = Record<string, string | string[] | undefined>

const all = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])

/** The subset a mode's URL names, or null for the whole notebook. Anything malformed is
 *  null too, so a hand-edited URL practises everything rather than nothing. */
export function parseSubset(sp: Params): PracticeSubset | null {
  const words = all(sp.word).filter((x) => UUID.test(x)).slice(0, MAX_IDS)
  if (words.length) return { kind: 'words', ids: words }
  const entries = all(sp.entry).filter((x) => ENTRY.test(x)).slice(0, MAX_IDS)
  if (entries.length) return { kind: 'entries', ids: entries }
  const [lang] = all(sp.lang)
  const [level] = all(sp.level)
  if (lang && isLangCode(lang) && level && /^[A-Za-z0-9]{1,8}$/.test(level)) return { kind: 'level', lang, level }
  if (all(sp.due)[0] === 'recognition') return { kind: 'due' }
  return null
}

/** `path` with the subset in its query string. */
export function subsetHref(path: string, subset: PracticeSubset): string {
  const q = new URLSearchParams()
  if (subset.kind === 'words') subset.ids.forEach((id) => q.append('word', id))
  else if (subset.kind === 'entries') subset.ids.forEach((id) => q.append('entry', id))
  else if (subset.kind === 'level') { q.set('lang', subset.lang); q.set('level', subset.level) }
  else q.set('due', 'recognition')
  return `${path}?${q}`
}
