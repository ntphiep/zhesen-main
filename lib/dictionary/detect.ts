import type { LangCode } from '@/lib/content/types'

const HAN = /\p{Script=Han}/u
const SPANISH = /[ñáéíóúü¿¡]/iu

/**
 * Order the supported languages by how likely the query belongs to each, so a
 * "search all languages" UI can show the most relevant group first. Heuristic:
 * Han script -> Chinese; Spanish-only letters/punctuation -> Spanish; else English.
 * Always returns all three (results are grouped, never filtered out).
 */
export function detectOrder(query: string): LangCode[] {
  const q = query.trim()
  if (HAN.test(q)) return ['zh', 'en', 'es']
  if (SPANISH.test(q)) return ['es', 'en', 'zh']
  return ['en', 'es', 'zh']
}
