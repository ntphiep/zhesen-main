import type { Phoneme, PronunciationNote } from '../types'

/**
 * The 44 sounds of English as learner dictionaries transcribe them: 12 monophthongs,
 * 8 diphthongs, 24 consonants. Symbols follow the British set our own entries carry in
 * `lex.pronunciations.ipa`, with `gaSymbol` filled only where General American differs.
 */
export const PHONEMES: readonly Phoneme[] = [
  {
    symbol: 'iː',
    gaSymbol: null,
    kind: 'vowel',
    groupVi: 'Nguyên âm dài',
    keyword: 'FLEECE',
    howVi: 'Lưỡi đưa cao và ra trước, môi dẹt như đang cười, giữ âm dài.',
    trapVi: 'Gần với "i" tiếng Việt nhưng dài hơn. Đọc ngắn lại là thành /ɪ/, và sheep hoá ship.',
    spellings: ['ee', 'ea', 'e_e', 'ie', 'i', 'ey'],
    examples: [
      { word: 'sheep', ipa: '/ʃiːp/', spelling: 'ee' },
      { word: 'eat', ipa: '/iːt/', spelling: 'ea' },
      { word: 'machine', ipa: '/məˈʃiːn/', spelling: 'i' },
    ],
    minimalPair: { a: 'sheep', ipaA: '/ʃiːp/', b: 'ship', ipaB: '/ʃɪp/' },
  },
  {
    symbol: 'ɪ',
    gaSymbol: null,
    kind: 'vowel',
    groupVi: 'Nguyên âm ngắn',
    keyword: 'KIT',
    howVi: 'Lưỡi cao vừa phải, miệng thả lỏng, âm bật ra rồi tắt ngay.',
    trapVi: 'Tiếng Việt không có âm này, nên người học đọc thành "i". Nó nằm giữa "i" và "ê", và luôn ngắn.',
    spellings: ['i', 'y', 'ui', 'e'],
    examples: [
      { word: 'ship', ipa: '/ʃɪp/', spelling: 'i' },
      { word: 'gym', ipa: '/dʒɪm/', spelling: 'y' },
      { word: 'build', ipa: '/bɪld/', spelling: 'ui' },
    ],
    minimalPair: { a: 'ship', ipaA: '/ʃɪp/', b: 'sheep', ipaB: '/ʃiːp/' },
  },
  {
    symbol: 'θ',
    gaSymbol: null,
    kind: 'consonant',
    groupVi: 'Phụ âm xát',
    keyword: 'THINK',
    howVi: 'Đặt đầu lưỡi chạm nhẹ rìa răng cửa trên rồi đẩy hơi qua khe. Dây thanh không rung.',
    trapVi: 'Tiếng Việt không có âm này. Người học thường thay bằng "t" hoặc "th", nên think nghe thành tin.',
    spellings: ['th'],
    examples: [
      { word: 'think', ipa: '/θɪŋk/', spelling: 'th' },
      { word: 'three', ipa: '/θriː/', spelling: 'th' },
      { word: 'bath', ipa: '/bɑːθ/', spelling: 'th' },
    ],
    minimalPair: { a: 'thin', ipaA: '/θɪn/', b: 'tin', ipaB: '/tɪn/' },
  },
  {
    symbol: 'ŋ',
    gaSymbol: null,
    kind: 'consonant',
    groupVi: 'Phụ âm mũi',
    keyword: 'SING',
    howVi: 'Chặn hơi bằng phần sau của lưỡi, cho hơi thoát qua mũi. Chính là "ng" trong "ngang".',
    trapVi: 'Sau nguyên âm tròn môi, tiếng Việt khép môi lại như trong "ông". Giữ môi mở, nếu không song nghe thành "soong-m".',
    spellings: ['ng', 'n trước k hoặc g'],
    examples: [
      { word: 'sing', ipa: '/sɪŋ/', spelling: 'ng' },
      { word: 'long', ipa: '/lɒŋ/', spelling: 'ng' },
      { word: 'think', ipa: '/θɪŋk/', spelling: 'n' },
    ],
    minimalPair: { a: 'sing', ipaA: '/sɪŋ/', b: 'sin', ipaB: '/sɪn/' },
  },
]

export const PRONUNCIATION_NOTES: readonly PronunciationNote[] = [
  {
    id: 'stress',
    titleVi: 'Trọng âm',
    bodyVi:
      'Mỗi từ tiếng Anh có nhiều âm tiết đều có một âm tiết được đọc mạnh hơn, dài hơn và cao giọng hơn. ' +
      'Dấu ˈ trong phiên âm đặt ngay trước âm tiết đó. Đặt sai trọng âm làm người nghe hiểu nhầm nhanh hơn là đọc sai một phụ âm.',
    examples: [
      { en: 'a ˈrecord (danh từ) / to reˈcord (động từ)', vi: 'bản ghi / ghi lại' },
      { en: 'ˈphotograph, phoˈtographer, photoˈgraphic', vi: 'cùng gốc từ, trọng âm chạy theo đuôi' },
    ],
  },
]
