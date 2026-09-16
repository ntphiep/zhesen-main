/**
 * The three languages zhesen targets, and the single source of truth for them.
 *
 * This list is fixed and does not change at runtime. Anything that needs one
 * value per language should derive it from LANGUAGES via `byLang` rather than
 * writing the codes out again.
 */

export type LangCode = 'zh' | 'es' | 'en'
export type Script = 'han' | 'latin'

export interface Language {
  code: LangCode
  /** Vietnamese display name, e.g. "Tiếng Trung". */
  name: string
  /** Endonym, e.g. "中文". */
  nativeName: string
  script: Script
}

export const LANGUAGES: readonly Language[] = [
  { code: 'en', name: 'Tiếng Anh', nativeName: 'English', script: 'latin' },
  { code: 'es', name: 'Tiếng Tây Ban Nha', nativeName: 'Español', script: 'latin' },
  { code: 'zh', name: 'Tiếng Trung', nativeName: '中文', script: 'han' },
]

export const LANG_CODES: readonly LangCode[] = LANGUAGES.map((l) => l.code)

export function getLanguage(code: string): Language | undefined {
  return LANGUAGES.find((l) => l.code === code)
}

export function isLangCode(code: string): code is LangCode {
  return LANGUAGES.some((l) => l.code === code)
}

/** BCP47 tag for the speech-synthesis voice of each language. Used both by the
 * audio button's TTS fallback and by speech recognition in the speaking drill. */
const SPEECH_LANG: Record<LangCode, string> = { en: 'en-US', es: 'es-ES', zh: 'zh-CN' }

export function speechLang(lang: LangCode): string {
  return SPEECH_LANG[lang]
}

/**
 * A record keyed by every language code, derived from LANGUAGES. Anything that
 * needs one value per language builds it through here, so adding a language is a
 * single edit rather than a hunt for the places that spelled the list out again.
 */
export function byLang<T>(pick: (language: Language) => T): Record<LangCode, T> {
  // The seed is empty by construction and filled for every code in the same
  // statement; the Record type is what the loop makes true.
  const out = {} as Record<LangCode, T>
  for (const language of LANGUAGES) out[language.code] = pick(language)
  return out
}
