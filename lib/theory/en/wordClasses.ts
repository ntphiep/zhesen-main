import type { WordClass } from '../types'

/**
 * The word classes English entries are tagged with. `key` is what `posGroup`
 * (`lib/dictionary/pos.ts`) returns, so the tag on a word links straight to its class.
 * `article` is kept apart from `determiner` because our senses are tagged that way and
 * because Vietnamese has no articles at all, which makes it the harder of the two.
 */
export const WORD_CLASSES: readonly WordClass[] = [
  {
    key: 'noun',
    titleVi: 'Danh từ',
    abbr: 'n.',
    oneLineVi: 'Tên gọi của người, vật, nơi chốn, sự việc hay khái niệm.',
    roleVi:
      'Làm chủ ngữ hoặc tân ngữ của câu. Đứng sau mạo từ, số từ và tính từ, và quyết định động từ chia số ít hay số nhiều.',
    forms: [
      {
        titleVi: 'Số nhiều',
        explainVi: 'Thêm -s, hoặc -es sau s, x, ch, sh. Một nhóm nhỏ đổi hẳn hình.',
        examples: ['book → books', 'box → boxes', 'child → children', 'foot → feet'],
      },
      {
        titleVi: 'Sở hữu cách',
        explainVi: "Thêm 's cho danh từ số ít, chỉ thêm dấu ' cho danh từ số nhiều đã có -s.",
        examples: ["my brother's car", "the students' room"],
      },
    ],
    subtypes: [
      {
        titleVi: 'Đếm được và không đếm được',
        explainVi:
          'Đếm được thì có số nhiều và đi với a, many, few. Không đếm được thì không có số nhiều và đi với much, little, some.',
        examples: ['three apples', 'much water', 'some advice'],
      },
      {
        titleVi: 'Danh từ riêng',
        explainVi: 'Tên riêng của một người, một nơi, một tổ chức. Luôn viết hoa và thường không có mạo từ.',
        examples: ['Hanoi', 'Mary', 'Google'],
      },
      {
        titleVi: 'Danh từ trừu tượng',
        explainVi: 'Chỉ khái niệm không sờ được. Phần lớn không đếm được.',
        examples: ['freedom', 'knowledge', 'happiness'],
      },
      {
        titleVi: 'Danh từ ghép',
        explainVi: 'Hai từ ghép thành một nghĩa mới. Trọng âm thường rơi vào phần đầu.',
        examples: ['bus stop', 'toothbrush', 'swimming pool'],
      },
    ],
    mistakes: [
      {
        wrong: 'I have many informations.',
        right: 'I have a lot of information.',
        whyVi: 'information không đếm được, nên không có -s và không đi với many.',
      },
      {
        wrong: 'She is teacher.',
        right: 'She is a teacher.',
        whyVi: 'Danh từ đếm được số ít luôn cần mạo từ hoặc từ hạn định đứng trước.',
      },
    ],
    grammarKeys: [],
  },
]
