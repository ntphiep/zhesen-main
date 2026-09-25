import type { CollocationPattern, CollocationSet } from '../types'

/** The shapes a collocation takes, then the pairs around the verbs that cause the most
 *  trouble. A learner does not look up "verb plus noun"; they look up whether it is make
 *  or do, so both halves are needed. */
export const COLLOCATION_PATTERNS: readonly CollocationPattern[] = [
  {
    id: 'verb-noun',
    formula: 'V + N',
    titleVi: 'Động từ đi với danh từ',
    explainVi:
      'Dạng hay sai nhất, vì tiếng Việt dùng một động từ chung cho nhiều danh từ còn tiếng Anh thì không. ' +
      'Cùng là "làm", nhưng tiếng Anh chia ra make, do, take, have và give.',
    examples: [
      { en: 'make a decision', vi: 'ra quyết định' },
      { en: 'do the homework', vi: 'làm bài tập' },
      { en: 'take a photo', vi: 'chụp ảnh' },
      { en: 'have breakfast', vi: 'ăn sáng' },
    ],
    mistakes: [
      {
        wrong: 'do a mistake',
        right: 'make a mistake',
        whyVi: 'Lỗi là thứ mình tạo ra, nên đi với make.',
      },
      {
        wrong: 'make my homework',
        right: 'do my homework',
        whyVi: 'Việc được giao sẵn thì đi với do.',
      },
    ],
  },
]

export const COLLOCATION_SETS: readonly CollocationSet[] = [
  {
    head: 'make',
    titleVi: 'make: tạo ra một thứ chưa có',
    noteVi: 'Dùng khi kết quả là thứ mới xuất hiện sau hành động: một quyết định, một tiếng động, một lỗi sai.',
    items: [
      { en: 'make a decision', vi: 'ra quyết định' },
      { en: 'make a mistake', vi: 'mắc lỗi' },
      { en: 'make noise', vi: 'gây ồn' },
      { en: 'make progress', vi: 'tiến bộ' },
      { en: 'make an appointment', vi: 'hẹn gặp' },
      { en: 'make money', vi: 'kiếm tiền' },
    ],
  },
]
