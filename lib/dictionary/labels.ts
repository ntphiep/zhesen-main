import { byLang, type LangCode } from '@/lib/languages'

/** The Vietnamese name of each language. Derived from LANGUAGES rather than
 * retyped, because the two copies had already started to be edited separately. */
export const LANG_LABELS: Record<LangCode, string> = byLang((l) => l.name)

export const LANG_FLAGS: Record<LangCode, string> = {
  en: '🇬🇧',
  zh: '🇨🇳',
  es: '🇪🇸',
}

const RELATION_LABELS_VI: Record<string, string> = {
  synonym: 'Cận nghĩa',
  antonym: 'Trái nghĩa',
  derived: 'Phái sinh',
  related: 'Liên quan',
}

export function relationLabel(type: string): string {
  return RELATION_LABELS_VI[type] ?? type
}
