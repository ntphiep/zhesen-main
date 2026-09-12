/**
 * Ba ngôn ngữ đích của zhesen. Trước đây danh sách này được đọc từ bảng
 * `public.languages` qua một lớp trừu tượng ContentSource, nhưng nó chưa bao giờ
 * thay đổi lúc chạy và mỗi lần đọc lại tốn một vòng gọi mạng. Giữ cứng ở đây,
 * đúng như cách `lib/dictionary/labels.ts` vẫn làm với nhãn và cờ.
 *
 * Giá trị khớp đúng với các dòng trong `public.languages` tính tới 2026-09-12.
 */

export type LangCode = 'zh' | 'es' | 'en'
export type Script = 'han' | 'latin'

export interface Language {
  code: LangCode
  /** Tên hiển thị tiếng Việt, ví dụ "Tiếng Trung". */
  name: string
  /** Tên bản ngữ, ví dụ "中文". */
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
