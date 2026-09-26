import { byLang, type LangCode } from '@/lib/languages'

/** The blocks a language's theory hub can hold, in the order a learner meets them:
 *  sounds, then words, then sentences, then the rules, then how words pair up, then the
 *  exam that tests all of them, then the vocabulary itself. The key is also the URL
 *  segment. */
export type TheoryBlockKey =
  | 'pronunciation'
  | 'word-class'
  | 'sentence'
  | 'grammar'
  | 'collocation'
  | 'toeic'
  | 'vocabulary'

export interface TheoryBlock {
  key: TheoryBlockKey
  titleVi: string
  blurbVi: string
}

export const THEORY_BLOCKS: readonly TheoryBlock[] = [
  {
    key: 'pronunciation',
    titleVi: 'Phát âm',
    blurbVi: 'Bảng âm với ví dụ, những cách viết tạo ra âm đó, và chỗ người Việt hay đọc chệch.',
  },
  {
    key: 'word-class',
    titleVi: 'Từ loại',
    blurbVi: 'Mỗi loại từ đứng ở đâu trong câu, đổi hình thế nào, đi với giới từ nào.',
  },
  {
    key: 'sentence',
    titleVi: 'Câu và cụm từ',
    blurbVi: 'Cụm từ, mệnh đề, bốn kiểu câu, và trật tự từ mà tiếng Việt không có.',
  },
  {
    key: 'grammar',
    titleVi: 'Ngữ pháp',
    blurbVi: 'Điểm ngữ pháp theo trình độ, có công thức, ví dụ và lỗi hay mắc.',
  },
  {
    key: 'collocation',
    titleVi: 'Collocation',
    blurbVi: 'Những từ quen đi với nhau. Đúng ngữ pháp mà sai collocation thì vẫn lạ tai.',
  },
  {
    key: 'toeic',
    titleVi: 'Luyện thi TOEIC',
    blurbVi: 'Cấu trúc đề, mẹo và bẫy từng part, từ vựng theo chủ đề, 30 câu luyện Part 5 và quy định ngày thi.',
  },
  {
    key: 'vocabulary',
    titleVi: 'Từ vựng',
    blurbVi: 'Từ thông dụng và danh sách từ theo từng trình độ, mở thẳng sang sổ tay.',
  },
]

/** Grammar and vocabulary read the dictionary, so all three languages have them. The
 *  others are written by hand and English is the only one written so far. */
const WRITTEN: Partial<Record<LangCode, TheoryBlockKey[]>> = {
  en: ['pronunciation', 'word-class', 'sentence', 'collocation', 'toeic'],
}

const FROM_DICTIONARY: TheoryBlockKey[] = ['grammar', 'vocabulary']

export const BLOCKS_BY_LANG: Record<LangCode, TheoryBlock[]> = byLang((language) => {
  const keys = new Set<TheoryBlockKey>([...(WRITTEN[language.code] ?? []), ...FROM_DICTIONARY])
  return THEORY_BLOCKS.filter((b) => keys.has(b.key))
})

export function hasBlock(lang: LangCode, key: TheoryBlockKey): boolean {
  return BLOCKS_BY_LANG[lang].some((b) => b.key === key)
}
