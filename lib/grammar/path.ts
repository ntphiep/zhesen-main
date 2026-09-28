import type { LangCode } from '@/lib/languages'
import { percentDecode } from '@/lib/http/percentDecode'

/** Grammar point ids look like `zh:hsk1:cau-vi-ngu-dong-tu` (lang, then a level+slug
 * key that itself contains a colon) -- same split/build/path shape as
 * `lib/dictionary/entryId.ts`, just with a two-part key instead of one. */
export function splitGrammarPointId(id: string): { lang: string; key: string } {
  const i = id.indexOf(':')
  if (i === -1) return { lang: '', key: id }
  return { lang: id.slice(0, i), key: id.slice(i + 1) }
}

export function buildGrammarPointId(lang: LangCode, key: string): string {
  return `${lang}:${key}`
}

/** The key's colon is written `_` in the URL: Next names the prerender cache file after
 *  the segment and Windows forbids `:` in a file name (#25). All 179 keys on production
 *  use only `a-z`, `0-9`, `-` and one colon, so `_` cannot collide. `next.config.ts`
 *  redirects the old `hsk1:slug` and `hsk1%3Aslug` forms. */
export function grammarPointPath(id: string): string {
  const { lang, key } = splitGrammarPointId(id)
  return `/theory/${lang}/grammar/${encodeURIComponent(key.replace(':', '_'))}`
}

export function grammarKeyFromPath(segment: string): string {
  return percentDecode(segment).replace('_', ':')
}

export function grammarLangPath(lang: LangCode): string {
  return `/theory/${lang}/grammar`
}
