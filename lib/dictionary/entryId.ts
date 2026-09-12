import type { LangCode } from '@/lib/languages'

export function splitEntryId(id: string): { lang: string; key: string } {
  const i = id.indexOf(':')
  if (i === -1) return { lang: '', key: id }
  return { lang: id.slice(0, i), key: id.slice(i + 1) }
}

export function buildEntryId(lang: LangCode, key: string): string {
  return `${lang}:${key}`
}

export function entryPath(id: string): string {
  const { lang, key } = splitEntryId(id)
  return `/dictionary/${lang}/${encodeURIComponent(key)}`
}

export function searchPath(lang: LangCode, q: string): string {
  return `/dictionary?q=${encodeURIComponent(q)}&lang=${lang}`
}
