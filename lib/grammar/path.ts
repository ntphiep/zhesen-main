import type { LangCode } from '@/lib/languages'

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

export function grammarPointPath(id: string): string {
  const { lang, key } = splitGrammarPointId(id)
  return `/grammar/${lang}/${encodeURIComponent(key)}`
}

export function grammarLangPath(lang: LangCode): string {
  return `/grammar/${lang}`
}
