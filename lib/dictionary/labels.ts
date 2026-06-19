import type { LangCode } from '@/lib/content/types'

export const LANG_LABELS: Record<LangCode, string> = {
  en: 'Tiếng Anh',
  zh: 'Tiếng Trung',
  es: 'Tiếng Tây Ban Nha',
}

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
