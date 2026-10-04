import type { SupabaseClient } from '@supabase/supabase-js'
import { searchEntries } from './search'
import type { DictEntryPreview } from './types'
import type { LangCode } from '@/lib/languages'

/**
 * The words built on the same stem: adjourn to adjourned, adjourning, adjournment.
 * `lex.lex_relations` holds no row at all for `en:adjourned`, so this asks `lex.search`
 * with the stem and keeps only the prefix matches, which is what a derived word is. The
 * caller must exclude Chinese: a Chinese prefix is a compound, `getEntriesContaining`.
 */
const SHORT_STEM = 3
/** What a stem of three letters or fewer takes: goes, gone, goer, seen, sadly, useful. go
 *  otherwise listed good and god, and UN under and until. */
const SHORT_STEM_ENDINGS = /^(?:s|es|ed|ing|ings|n|ne|en|er|ers|est|ly|ful|less|ness|ment|able)$/

/** Whether `word` is `stem` plus an ending, after a doubled last consonant (runner, sadder)
 *  or, past a final e, a bare d, r or st (used, user). */
function shortStemKin(word: string, stem: string): boolean {
  let rest = word.slice(stem.length)
  if (rest[0] === stem.at(-1) && /[^aeiou]/.test(rest[0])) rest = rest.slice(1)
  return SHORT_STEM_ENDINGS.test(rest) || (stem.endsWith('e') && /^(?:d|r|rs|st)$/.test(rest))
}

export async function getWordKin(
  supabase: SupabaseClient, lang: LangCode, stem: string, headword: string, limit = 12,
): Promise<DictEntryPreview[]> {
  const s = stem.trim().toLowerCase()
  if (!s) return []
  // Asked for more than are kept: the search returns fuzzy neighbours too
  // ("contact" for "contract"), and those are dropped below.
  const rows = await searchEntries(supabase, lang, stem, limit * 3)
  const seen = new Set<string>([headword.toLowerCase()])
  const kin: DictEntryPreview[] = []
  for (const r of rows) {
    const h = r.headword.toLowerCase()
    if (seen.has(h) || !h.startsWith(s)) continue
    // A capital the stem lacks is a name (Goh for go).
    if (r.headword !== h && stem.trim() === s) continue
    if (s.length <= SHORT_STEM && !shortStemKin(h, s)) continue
    seen.add(h)
    kin.push(r)
    if (kin.length >= limit) break
  }
  return kin
}
