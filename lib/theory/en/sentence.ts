import type { SentenceTopic } from '../types'

/** Phrases, clauses, the kinds of sentence, and the word order Vietnamese does not have.
 *  Ordered the way the page reads them. */
export const SENTENCE_TOPICS: readonly SentenceTopic[] = [
  {
    id: 'word-order',
    titleVi: 'Trật tự từ',
    introVi:
      'Tiếng Anh dựa vào vị trí để biết ai làm gì, vì danh từ và động từ gần như không đổi hình. ' +
      'Đổi chỗ hai từ là đổi nghĩa, hoặc làm câu sai hẳn.',
    items: [
      {
        titleVi: 'Chủ ngữ, động từ, tân ngữ',
        explainVi: 'Thứ tự mặc định của câu kể. Không đảo được như tiếng Việt vẫn đảo để nhấn.',
        formula: 'S + V + O',
        examples: [
          { en: 'The dog chased the cat.', vi: 'Con chó đuổi con mèo.' },
          { en: 'The cat chased the dog.', vi: 'Con mèo đuổi con chó, nghĩa ngược hẳn.' },
        ],
      },
      {
        titleVi: 'Tính từ đứng trước danh từ',
        explainVi: 'Ngược với tiếng Việt. Tính từ chỉ đứng sau danh từ khi có động từ nối ở giữa.',
        formula: 'Adj + N',
        examples: [
          { en: 'a red car', vi: 'một chiếc xe màu đỏ' },
          { en: 'The car is red.', vi: 'Chiếc xe màu đỏ.' },
        ],
      },
      {
        titleVi: 'Nhiều tính từ thì xếp theo thứ tự',
        explainVi:
          'Khi có từ hai tính từ trở lên, người bản ngữ xếp theo ý kiến, kích thước, tuổi, hình dáng, màu sắc, nguồn gốc, chất liệu, mục đích. Không ai học thuộc bảng này, nhưng sai thứ tự thì nghe rất lạ.',
        formula: 'ý kiến → kích thước → tuổi → hình dáng → màu → nguồn gốc → chất liệu → mục đích',
        examples: [
          { en: 'a beautiful small old round brown Italian wooden dining table', vi: 'đủ tám bậc, hiếm gặp trong đời thực' },
          { en: 'a lovely little house', vi: 'một ngôi nhà nhỏ xinh' },
        ],
      },
      {
        titleVi: 'Trạng từ chỉ tần suất',
        explainVi: 'Đứng trước động từ thường, nhưng đứng sau động từ to be.',
        formula: 'S + adv + V | S + be + adv',
        examples: [
          { en: 'She always arrives early.', vi: 'Cô ấy luôn đến sớm.' },
          { en: 'She is always early.', vi: 'Cô ấy lúc nào cũng sớm.' },
        ],
      },
    ],
    mistakes: [
      {
        wrong: 'I like very much this book.',
        right: 'I like this book very much.',
        whyVi: 'Không chen trạng từ vào giữa động từ và tân ngữ.',
      },
      {
        wrong: 'a car red',
        right: 'a red car',
        whyVi: 'Tính từ đứng trước danh từ, không đứng sau như tiếng Việt.',
      },
    ],
  },
]
