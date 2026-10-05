import type {
  ToeicCefrRow,
  ToeicGrammarItem,
  ToeicGuide,
  ToeicLink,
  ToeicNote,
  ToeicParaphrase,
  ToeicPart,
} from '../types'
import { TOEIC_WORD_TOPICS } from './toeicWords'
import { TOEIC_PRACTICE } from './toeicPractice'

/** The seven parts of the Listening and Reading test in test order. Question counts are
 *  the ones in the ETS test description; the tips and traps are this project's advice. */
const TOEIC_PARTS: readonly ToeicPart[] = [
  {
    number: 1,
    section: 'listening',
    nameEn: 'Photographs',
    titleVi: 'Mô tả tranh',
    questions: 6,
    extras: [],
    formatVi: 'Mỗi câu có một bức ảnh trong đề. Máy đọc bốn câu mô tả, đề không in chữ nào. Chọn câu tả đúng nhất.',
    tips: [
      {
        titleVi: 'Nhìn tranh trước khi máy đọc',
        bodyVi: 'Máy đọc hướng dẫn và một câu ví dụ trước câu 1. Dùng khoảng đó để xem trước các tranh: ai, đang làm gì, vật gì ở đâu. Khi nghe chỉ còn đối chiếu.',
        example: null,
      },
      {
        titleVi: 'Tranh có người thì nghe động từ',
        bodyVi: 'Đáp án thường tả hành động đang diễn ra, dạng is hoặc are cộng V-ing. Tranh chỉ có đồ vật thì đáp án tả vị trí hoặc trạng thái.',
        example: { en: 'Some boxes have been stacked against the wall.', vi: 'Mấy cái hộp đã được xếp chồng sát tường.' },
      },
      {
        titleVi: 'Loại dần từng câu',
        bodyVi: 'Nghe câu nào xét câu đó đúng hay sai ngay. Hết bốn câu thì câu còn lại là đáp án, không cần chắc chắn trước khi nghe hết.',
        example: null,
      },
    ],
    traps: [
      {
        titleVi: 'Putting on và wearing',
        bodyVi: 'Putting on là đang mặc vào, wearing là đang mặc sẵn trên người. Tranh người đứng yên mặc áo khoác thì chỉ wearing đúng.',
        example: { en: 'She is wearing a jacket.', vi: 'Cô ấy đang mặc áo khoác.' },
      },
      {
        titleVi: 'Being cộng V3 cần người đang làm',
        bodyVi: 'Is being cleaned nghĩa là có người đang lau. Tranh không có người thì câu dạng này gần như luôn sai.',
        example: { en: 'The floor is being mopped.', vi: 'Sàn nhà đang được lau.' },
      },
      {
        titleVi: 'Từ nghe giống nhau',
        bodyVi: 'Câu sai hay dùng từ gần âm với vật trong tranh: copy và coffee, walk và work, file và pile. Nghe cả câu, không bắt một từ.',
        example: null,
      },
      {
        titleVi: 'Đúng vật sai quan hệ',
        bodyVi: 'Câu sai nhắc đúng đồ vật có trong tranh nhưng sai vị trí hoặc sai hành động.',
        example: null,
      },
    ],
  },
  {
    number: 2,
    section: 'listening',
    nameEn: 'Question-Response',
    titleVi: 'Hỏi và đáp',
    questions: 25,
    extras: [],
    formatVi: 'Máy đọc một câu hỏi hoặc một câu nói, rồi ba câu đáp, mỗi thứ chỉ một lần. Đề không in gì cả. Sau mỗi câu có 5 giây để chọn.',
    tips: [
      {
        titleVi: 'Làm quen bốn giọng đọc',
        bodyVi: 'Người đọc trong đề có giọng Mỹ, Anh, Canada và Úc. Luyện nghe đủ bốn giọng, không chỉ giọng Mỹ.',
        example: null,
      },
      {
        titleVi: 'Bắt từ để hỏi đầu câu',
        bodyVi: 'Who, When, Where, Why, How quyết định dạng câu đáp. Nghe sót từ này là mất câu, nên tập trung nhất vào ba từ đầu.',
        example: null,
      },
      {
        titleVi: 'Câu đáp gián tiếp thường đúng',
        bodyVi: 'Người bản ngữ ít trả lời thẳng. Hỏi giờ họp mà đáp "Chưa xem email à?" hoặc "Để tôi xem lịch" vẫn là câu đúng.',
        example: { en: 'When does the workshop start? / Let me check the schedule.', vi: 'Hội thảo bắt đầu lúc nào? / Để tôi xem lịch.' },
      },
      {
        titleVi: 'Câu hỏi Yes hoặc No',
        bodyVi: 'Câu đáp đúng không nhất thiết có Yes hoặc No. Câu đáp có No nhưng nói sai chuyện vẫn sai.',
        example: null,
      },
    ],
    traps: [
      {
        titleVi: 'Câu đáp lặp lại từ trong câu hỏi',
        bodyVi: 'Câu đáp lặp đúng từ hoặc từ gần âm với câu hỏi thường là bẫy. Hỏi về printer mà đáp có print hoặc prints thì nghi ngờ trước.',
        example: null,
      },
      {
        titleVi: 'Đáp sai loại câu hỏi',
        bodyVi: 'Hỏi When mà đáp một nơi chốn, hỏi Where mà đáp một mốc giờ. Loại ngay câu đáp không khớp từ để hỏi.',
        example: null,
      },
      {
        titleVi: 'Why don\'t we là lời gợi ý',
        bodyVi: 'Why don\'t we hoặc Why don\'t you là đề nghị, không hỏi lý do. Câu đáp bắt đầu bằng Because thường sai.',
        example: { en: 'Why don\'t we order lunch now? / Good idea, I\'m hungry.', vi: 'Hay mình gọi đồ ăn trưa bây giờ? / Ý hay, tôi đói rồi.' },
      },
      {
        titleVi: 'Từ liên tưởng',
        bodyVi: 'Hỏi ngân hàng ở đâu mà đáp chuyện gửi tiền. Câu đáp cùng chủ đề nhưng không trả lời câu hỏi vẫn sai.',
        example: null,
      },
    ],
  },
  {
    number: 3,
    section: 'listening',
    nameEn: 'Conversations',
    titleVi: 'Hội thoại',
    questions: 39,
    extras: ['paraphrase'],
    formatVi: '13 đoạn hội thoại giữa hai hoặc ba người, mỗi đoạn ba câu hỏi. Câu hỏi và bốn đáp án in trong đề, một số câu kèm bảng hoặc hình.',
    tips: [
      {
        titleVi: 'Đọc trước ba câu hỏi',
        bodyVi: 'Sau mỗi câu hỏi máy chỉ dừng 8 giây, câu có hình 12 giây. Chọn xong trong khoảng đó rồi chuyển mắt sang ba câu hỏi của đoạn sau. Biết trước cần nghe gì thì nghe có đích.',
        example: null,
      },
      {
        titleVi: 'Câu hỏi đi theo thứ tự bài nói',
        bodyVi: 'Câu đầu thường hỏi chủ đề, nơi chốn hoặc nghề của người nói. Câu giữa hỏi chi tiết hoặc vấn đề. Câu cuối hay hỏi việc sẽ làm tiếp theo.',
        example: null,
      },
      {
        titleVi: 'Câu có hình thì nhìn hình trước',
        bodyVi: 'Đáp án thường là thông tin trên hình mà người nói không đọc thẳng. Người nói nêu một cột, đề hỏi cột kia.',
        example: null,
      },
      {
        titleVi: 'Câu hỏi ý của người nói',
        bodyVi: 'Dạng "What does the woman mean when she says ...?" hỏi ý trong ngữ cảnh, không hỏi nghĩa đen của câu được trích.',
        example: null,
      },
    ],
    traps: [
      {
        titleVi: 'Đáp án là cách nói khác',
        bodyVi: 'Đáp án đúng ít khi lặp nguyên từ trong bài. Đáp án lặp nguyên từ thường là bẫy. Mục Paraphrase bên dưới liệt kê các cặp hay gặp.',
        example: null,
      },
      {
        titleVi: 'Thông tin bị sửa lại',
        bodyVi: 'Người nói nêu một giờ hoặc một nơi rồi sửa lại. Đáp án theo thông tin sau cùng.',
        example: { en: 'The meeting is at two. Actually, it\'s been moved to three.', vi: 'Cuộc họp lúc hai giờ. À không, đã dời sang ba giờ.' },
      },
      {
        titleVi: 'Hỏi về người nam hay người nữ',
        bodyVi: 'Đọc kỹ câu hỏi hỏi về man hay woman. Thông tin của người kia là đáp án bẫy.',
        example: null,
      },
      {
        titleVi: 'Kẹt một câu kéo mất cả đoạn sau',
        bodyVi: 'Không nghe được thì chọn một đáp án rồi đọc ngay câu hỏi đoạn sau. Không có điểm trừ nên không bỏ trống.',
        example: null,
      },
    ],
  },
  {
    number: 4,
    section: 'listening',
    nameEn: 'Talks',
    titleVi: 'Bài nói ngắn',
    questions: 30,
    extras: ['paraphrase'],
    formatVi: '10 bài nói của một người: thông báo, tin nhắn thoại, quảng cáo, bản tin, hướng dẫn tham quan, trích đoạn cuộc họp. Mỗi bài ba câu hỏi in trong đề.',
    tips: [
      {
        titleVi: 'Câu mở đầu cho biết loại bài',
        bodyVi: 'Attention passengers là thông báo ở nhà ga hoặc sân bay. Hi, this is ... calling là tin nhắn thoại. Welcome to ... là hướng dẫn tham quan.',
        example: null,
      },
      {
        titleVi: 'Người nói là ai, ở đâu',
        bodyVi: 'Hai câu này gần như luôn nằm ở mấy câu đầu. Nghe hụt đầu bài là mất câu hỏi đầu.',
        example: null,
      },
      {
        titleVi: 'Lời đề nghị nằm cuối bài',
        bodyVi: 'Câu hỏi người nghe được yêu cầu làm gì thường ở cuối, sau các cụm Please, Make sure hoặc I\'d like you to.',
        example: null,
      },
    ],
    traps: [
      {
        titleVi: 'Con số và giờ bị đổi',
        bodyVi: 'Bài nói nêu lịch cũ rồi báo lịch mới, nêu giá gốc rồi giá giảm. Đáp án theo con số sau cùng.',
        example: null,
      },
      {
        titleVi: 'Câu hỏi vì sao người nói nói câu đó',
        bodyVi: 'Dạng "Why does the speaker say ...?" hỏi mục đích của câu trích trong ngữ cảnh. Đọc câu trước và câu sau trong đầu khi nghe tới nó.',
        example: null,
      },
    ],
  },
  {
    number: 5,
    section: 'reading',
    nameEn: 'Incomplete Sentences',
    titleVi: 'Điền vào câu',
    questions: 30,
    extras: ['grammar', 'practice'],
    formatVi: 'Mỗi câu thiếu một từ hoặc một cụm. Chọn một trong bốn đáp án để điền vào chỗ trống.',
    tips: [
      {
        titleVi: 'Nhìn bốn đáp án trước câu hỏi',
        bodyVi: 'Bốn đáp án cùng gốc từ là câu từ loại: chỉ cần xem từ đứng trước và sau chỗ trống, không cần dịch cả câu. Cùng một động từ ở nhiều dạng là câu thì. Bốn từ khác nghĩa là câu từ vựng, phải đọc cả câu.',
        example: null,
      },
      {
        titleVi: 'Câu từ loại làm nhanh nhất',
        bodyVi: 'Sau mạo từ hoặc tính từ sở hữu là danh từ. Sau be hoặc trước danh từ là tính từ. Giữa trợ động từ và động từ chính là trạng từ.',
        example: { en: 'The company has ------- expanded its operations. (significantly)', vi: 'Công ty đã mở rộng hoạt động đáng kể.' },
      },
      {
        titleVi: 'Giữ nhịp khoảng 20 giây một câu',
        bodyVi: 'Part 5 xong trong khoảng 10 phút thì Part 7 còn đủ thời gian. Câu nào quá 40 giây thì chọn tạm và đi tiếp.',
        example: null,
      },
    ],
    traps: [
      {
        titleVi: 'Although và despite',
        bodyVi: 'Although, though, even though cộng một mệnh đề có chủ ngữ và động từ. Despite, in spite of cộng danh từ hoặc V-ing.',
        example: { en: 'Despite the heavy rain, the event started on time.', vi: 'Dù mưa to, sự kiện vẫn bắt đầu đúng giờ.' },
      },
      {
        titleVi: 'Each và every đi với số ít',
        bodyVi: 'Each employee, every applicant và each of the employees đều đi với động từ số ít.',
        example: { en: 'Each of the applicants has been contacted.', vi: 'Từng ứng viên đều đã được liên lạc.' },
      },
      {
        titleVi: 'Tính từ đuôi ed và ing',
        bodyVi: 'Đuôi ed tả cảm giác của người, đuôi ing tả tính chất của vật hoặc việc gây ra cảm giác đó.',
        example: { en: 'The results were disappointing, so the staff were disappointed.', vi: 'Kết quả đáng thất vọng nên nhân viên thất vọng.' },
      },
    ],
  },
  {
    number: 6,
    section: 'reading',
    nameEn: 'Text Completion',
    titleVi: 'Điền vào đoạn văn',
    questions: 16,
    extras: ['grammar'],
    formatVi: 'Bốn đoạn văn như email, thông báo, quảng cáo, mỗi đoạn bốn chỗ trống. Ba chỗ điền từ hoặc cụm, một chỗ chọn cả một câu hợp với đoạn.',
    tips: [
      {
        titleVi: 'Đọc cả đoạn, không chỉ câu có chỗ trống',
        bodyVi: 'Thì của động từ và từ nối thường phụ thuộc vào câu trước và câu sau. Một đáp án đúng ngữ pháp trong câu vẫn có thể sai với cả đoạn.',
        example: null,
      },
      {
        titleVi: 'Câu chèn dựa vào từ nối và đại từ',
        bodyVi: 'Câu cần chèn phải khớp với câu đứng trước và câu đứng sau. However, therefore, also và các đại từ this, they, it là manh mối rõ nhất.',
        example: null,
      },
    ],
    traps: [
      {
        titleVi: 'Thì đúng trong câu, sai trong đoạn',
        bodyVi: 'Email viết trước sự kiện thì dùng tương lai, viết sau sự kiện thì dùng quá khứ. Ngày trên đầu email thường là manh mối.',
        example: null,
      },
      {
        titleVi: 'Từ nối sai quan hệ',
        bodyVi: 'However nối hai ý trái nhau, therefore nối nguyên nhân với kết quả, in addition thêm một ý cùng chiều. Chọn theo quan hệ giữa hai câu, không theo cảm giác quen tai.',
        example: null,
      },
    ],
  },
  {
    number: 7,
    section: 'reading',
    nameEn: 'Reading Comprehension',
    titleVi: 'Đọc hiểu',
    questions: 54,
    extras: ['paraphrase'],
    formatVi: '10 đoạn đơn với 29 câu hỏi, rồi 5 bộ hai hoặc ba đoạn liên quan với 25 câu hỏi. Đoạn đơn gồm email, thư, quảng cáo, chuỗi tin nhắn, bài báo.',
    tips: [
      {
        titleVi: 'Đọc câu hỏi rồi mới đọc bài',
        bodyVi: 'Nhớ từ khóa của câu hỏi như tên người, con số, ngày, rồi dò trong bài. Không đọc kỹ từng chữ trước khi biết cần tìm gì.',
        example: null,
      },
      {
        titleVi: 'Câu hỏi mục đích nằm ở đầu bài',
        bodyVi: 'What is the purpose of the e-mail? thường trả lời bằng một hai câu đầu. Câu hỏi chi tiết thì dò theo từ khóa.',
        example: null,
      },
      {
        titleVi: 'Bộ hai và ba đoạn cần ghép thông tin',
        bodyVi: 'Luôn có câu hỏi mà đáp án cần hai đoạn: giá trong quảng cáo với ngày trong email, tên trong lịch với phòng trong thông báo.',
        example: null,
      },
      {
        titleVi: 'Câu hỏi NOT làm sau cùng',
        bodyVi: 'What is NOT mentioned hoặc What is NOT true bắt kiểm tra cả bốn đáp án. Dạng này tốn thời gian nhất trong một bộ nên để cuối bộ.',
        example: null,
      },
      {
        titleVi: 'Câu hỏi từ đồng nghĩa theo ngữ cảnh',
        bodyVi: 'Dạng "The word ... is closest in meaning to" chọn nghĩa của từ ở đúng câu đó, thường không phải nghĩa phổ biến nhất.',
        example: { en: 'The fee covers lunch and parking. (covers = includes)', vi: 'Phí đã bao gồm bữa trưa và chỗ đỗ xe.' },
      },
    ],
    traps: [
      {
        titleVi: 'Đáp án chép nguyên câu trong bài',
        bodyVi: 'Đáp án dùng đúng từ trong bài nhưng đổi chủ thể hoặc đổi thời gian là bẫy. Đáp án đúng thường là cách nói khác của bài.',
        example: null,
      },
      {
        titleVi: 'Đáp án suy diễn quá xa',
        bodyVi: 'Chỉ chọn điều bài nói hoặc suy ra trực tiếp được. Đáp án nghe hợp lý ngoài đời nhưng bài không nói tới vẫn sai.',
        example: null,
      },
    ],
  },
]

const TOEIC_SCORING: ToeicNote = {
  id: 'score',
  titleVi: 'Cách tính điểm',
  introVi: 'Mỗi kỹ năng Listening và Reading chấm riêng rồi cộng lại.',
  points: [
    'Mỗi kỹ năng từ 5 tới 495 điểm, tổng từ 10 tới 990, điểm tăng theo bước 5.',
    'Câu sai không bị trừ điểm. Không bỏ trống câu nào, kể cả câu phải đoán.',
    'Số câu đúng được quy đổi sang điểm theo độ khó của từng đề, nên cùng số câu đúng có thể ra điểm khác nhau giữa hai đề.',
    'ETS cấp lại phiếu điểm trong vòng 2 năm kể từ ngày thi.',
  ],
}

/** The lowest section scores ETS maps to each CEFR level for the Listening and Reading
 *  test. C2 has no row: too few of the ETS panel judged the test able to place it. */
const TOEIC_CEFR: readonly ToeicCefrRow[] = [
  { level: 'A1', listening: 60, reading: 60 },
  { level: 'A2', listening: 110, reading: 115 },
  { level: 'B1', listening: 275, reading: 275 },
  { level: 'B2', listening: 400, reading: 385 },
  { level: 'C1', listening: 490, reading: 455 },
]

/** The grammar Part 5 and Part 6 return to most, with the lesson for each point. */
const TOEIC_GRAMMAR: readonly ToeicGrammarItem[] = [
  {
    titleVi: 'Từ loại theo vị trí',
    explainVi: 'Nhóm câu nhiều nhất của Part 5. Vị trí chỗ trống quyết định từ loại, không cần hiểu cả câu. Khối Từ loại có bảng đầy đủ.',
    formula: 'the + N | be + Adj | Adj + N | trợ động từ + Adv + V',
    example: { en: 'Please read the instructions carefully before use.', vi: 'Đọc kỹ hướng dẫn trước khi dùng.' },
    grammarKey: null,
  },
  {
    titleVi: 'Thì theo dấu hiệu thời gian',
    explainVi: 'Since, for, over the past ... đi với hiện tại hoàn thành. Yesterday, last, ago đi với quá khứ đơn. By next month đi với tương lai hoàn thành.',
    formula: 'S + have / has + V3 + since / for',
    example: { en: 'Sales have increased since the new manager arrived.', vi: 'Doanh số đã tăng từ khi người quản lý mới đến.' },
    grammarKey: 'b1:hien-tai-hoan-thanh-since-for',
  },
  {
    titleVi: 'Chủ động hay bị động',
    explainVi: 'Chủ ngữ là vật chịu tác động và sau chỗ trống không có tân ngữ thì dùng bị động.',
    formula: 'S + be + V3 (+ by ...)',
    example: { en: 'The documents will be delivered tomorrow.', vi: 'Tài liệu sẽ được giao vào ngày mai.' },
    grammarKey: 'b2:cau-bi-dong-day-du',
  },
  {
    titleVi: 'Liên từ và giới từ',
    explainVi: 'Although, because, while cộng mệnh đề. Despite, because of, during cộng danh từ. Đây là cặp bẫy quen nhất của Part 5.',
    formula: 'although + S + V | despite + N / V-ing',
    example: { en: 'Although the price rose, demand stayed high.', vi: 'Dù giá tăng, nhu cầu vẫn cao.' },
    grammarKey: 'c1:tu-noi-nhuong-bo-va-tuong-phan',
  },
  {
    titleVi: 'Đại từ',
    explainVi: 'Chỗ trống trước danh từ cần tính từ sở hữu, sau động từ cần tân ngữ. By himself nghĩa là tự làm một mình.',
    formula: 'his + N | V + him | by + himself',
    example: { en: 'Ms. Lee prepared the report herself.', vi: 'Cô Lee tự chuẩn bị báo cáo.' },
    grammarKey: 'a1:dai-tu-nhan-xung-va-tinh-tu-so-huu',
  },
  {
    titleVi: 'Mệnh đề quan hệ',
    explainVi: 'Who cho người, which cho vật, whose cộng danh từ chỉ sở hữu. Sau chỗ trống thiếu chủ ngữ thì dùng who hoặc which.',
    formula: 'N (người) + who + V | N (vật) + which + V | N + whose + N',
    example: { en: 'The candidate whose résumé impressed us will be interviewed.', vi: 'Ứng viên có hồ sơ gây ấn tượng sẽ được phỏng vấn.' },
    grammarKey: 'b1:menh-de-quan-he-xac-dinh',
  },
  {
    titleVi: 'Mệnh đề quan hệ rút gọn',
    explainVi: 'V-ing mang nghĩa chủ động, V3 mang nghĩa bị động, đứng ngay sau danh từ.',
    formula: 'N + V-ing | N + V3',
    example: { en: 'The report submitted yesterday contains an error.', vi: 'Báo cáo nộp hôm qua có một lỗi.' },
    grammarKey: 'b2:menh-de-quan-he-rut-gon',
  },
  {
    titleVi: 'V-ing hay to V sau động từ',
    explainVi: 'Consider, avoid, suggest, recommend cộng V-ing. Plan, decide, agree, hope cộng to V.',
    formula: 'avoid + V-ing | decide + to V',
    example: { en: 'We decided to extend the deadline.', vi: 'Chúng tôi quyết định gia hạn hạn chót.' },
    grammarKey: 'a2:dong-tu-theo-sau-v-ing-hoac-to-v',
  },
  {
    titleVi: 'So sánh',
    explainVi: 'Có than thì dùng so sánh hơn, có the và phạm vi như in, of thì dùng so sánh nhất.',
    formula: 'more + Adj + than | the most + Adj + in / of',
    example: { en: 'This model is more reliable than the previous one.', vi: 'Mẫu này đáng tin cậy hơn mẫu trước.' },
    grammarKey: 'a2:comparative-long-adjectives',
  },
  {
    titleVi: 'Lượng từ',
    explainVi: 'Each và every cộng danh từ số ít. Many, several, a few cộng số nhiều. Much, a little cộng không đếm được.',
    formula: 'each + N số ít | several + N số nhiều',
    example: { en: 'Several employees requested time off.', vi: 'Vài nhân viên đăng ký nghỉ phép.' },
    grammarKey: 'a2:danh-tu-dem-duoc-va-khong-dem-duoc',
  },
  {
    titleVi: 'Đảo ngữ với should',
    explainVi: 'Should you have any questions là cách viết trang trọng của if you have any questions, rất hay gặp ở cuối email trong đề.',
    formula: 'Should + S + V, ...',
    example: { en: 'Should you have any questions, please contact us.', vi: 'Nếu có thắc mắc, liên hệ với chúng tôi.' },
    grammarKey: 'c1:dao-ngu-trong-cau-dieu-kien',
  },
  {
    titleVi: 'Thể giả định sau request, require, suggest',
    explainVi: 'Sau các động từ yêu cầu và đề nghị, động từ trong mệnh đề that để nguyên mẫu, không chia theo chủ ngữ.',
    formula: 'S + require / suggest + that + S + V nguyên mẫu',
    example: { en: 'The manager requested that each employee submit a report.', vi: 'Quản lý yêu cầu mỗi nhân viên nộp một báo cáo.' },
    grammarKey: 'c1:the-gia-dinh-sau-suggest-insist',
  },
]

/** Pairs the right option rewords. Part 3, Part 4 and Part 7 rarely repeat the words of
 *  the audio or the passage, so the ear has to know both halves. */
const TOEIC_PARAPHRASES: readonly ToeicParaphrase[] = [
  { heard: 'The meeting has been pushed back.', answer: 'The meeting was postponed.', vi: 'Cuộc họp bị hoãn.' },
  { heard: 'We\'re out of that item.', answer: 'A product is unavailable.', vi: 'Món hàng đã hết.' },
  { heard: 'My car broke down.', answer: 'He had vehicle trouble.', vi: 'Xe bị hỏng.' },
  { heard: 'The copier is jammed again.', answer: 'Some equipment is not working.', vi: 'Máy photocopy lại kẹt giấy.' },
  { heard: 'We\'re short-staffed this week.', answer: 'There are not enough employees.', vi: 'Tuần này thiếu người.' },
  { heard: 'It\'s free of charge.', answer: 'It is complimentary.', vi: 'Miễn phí.' },
  { heard: 'Could you give me a hand?', answer: 'The man asks for help.', vi: 'Nhờ giúp một tay.' },
  { heard: 'Fill out this form.', answer: 'Complete a document.', vi: 'Điền vào mẫu đơn.' },
  { heard: 'Hand in the report by Friday.', answer: 'Submit the report by Friday.', vi: 'Nộp báo cáo trước thứ Sáu.' },
  { heard: 'Let\'s go over the figures.', answer: 'Review the numbers.', vi: 'Xem lại số liệu.' },
  { heard: 'I\'ll look into it.', answer: 'He will investigate the problem.', vi: 'Tôi sẽ tìm hiểu vụ đó.' },
  { heard: 'They turned down our offer.', answer: 'The proposal was rejected.', vi: 'Họ từ chối đề nghị.' },
  { heard: 'The position has been filled.', answer: 'Someone was hired.', vi: 'Vị trí đã có người.' },
  { heard: 'I\'ll be out of the office next week.', answer: 'She will be away.', vi: 'Tuần sau tôi không có ở văn phòng.' },
  { heard: 'The store is closed for renovations.', answer: 'The building is being remodeled.', vi: 'Cửa hàng đóng cửa để sửa sang.' },
  { heard: 'Sign up at the front desk.', answer: 'Register at the reception desk.', vi: 'Đăng ký ở quầy lễ tân.' },
  { heard: 'The shipment will arrive a day late.', answer: 'A delivery is delayed.', vi: 'Lô hàng tới trễ một ngày.' },
  { heard: 'Our boss wants to see us.', answer: 'The supervisor asked for a meeting.', vi: 'Sếp muốn gặp cả nhóm.' },
  { heard: 'We ran out of brochures.', answer: 'There are no brochures left.', vi: 'Hết tờ giới thiệu.' },
  { heard: 'Set up the projector before the talk.', answer: 'Prepare some equipment.', vi: 'Lắp máy chiếu trước buổi nói chuyện.' },
]

/** Rendered in order after the practice set. */
const TOEIC_NOTES: readonly ToeicNote[] = [
  {
    id: 'timing',
    titleVi: 'Phân bổ thời gian',
    introVi: 'Listening chạy theo máy đọc. Reading 75 phút tự chia. Part 7 là phần hay thiếu giờ nhất.',
    points: [
      'Part 5 khoảng 10 phút, Part 6 khoảng 8 phút, Part 7 còn khoảng 55 phút.',
      'Tô đáp án lên phiếu trả lời ngay sau mỗi câu. Chỉ đáp án tô trên phiếu mới được tính điểm.',
      'Không dừng quá 2 phút cho một câu Part 7. Chọn tạm, nhớ số câu, còn giờ thì quay lại.',
      'Còn 3 phút mà chưa xong thì tô hết các câu còn trống. Câu sai không bị trừ điểm.',
      'Không được mang đồng hồ vào phòng thi. Tập nhịp Part 5, Part 6 và Part 7 ở nhà cho quen.',
    ],
  },
  {
    id: 'plan',
    titleVi: 'Lộ trình ôn',
    introVi: 'Biết điểm hiện tại trước, rồi dồn giờ vào phần mất nhiều điểm nhất.',
    points: [
      'Làm một đề hoàn chỉnh đúng 2 tiếng để biết điểm hiện tại và phần yếu nhất.',
      'Mỗi ngày lưu 15 tới 20 từ theo chủ đề vào sổ tay, rồi ôn trong mục Luyện tập.',
      'Nghe Part 2 và Part 3 mỗi ngày. Câu nghe sai thì nghe lại và chép chính tả từng câu.',
      'Ngữ pháp bắt đầu từ câu từ loại. Đây là nhóm nhiều câu nhất và nhanh có điểm nhất.',
      'Mỗi tuần làm một đề hoàn chỉnh. Với mỗi câu sai, ghi lại bẫy đã mắc và quy tắc đúng.',
      'Mục tiêu 450 tới 600: chắc Part 1, Part 2, Part 5 và từ vựng theo chủ đề.',
      'Mục tiêu 600 tới 800: thêm Part 3, Part 4, Part 6 và tốc độ đọc Part 7.',
      'Mục tiêu trên 800: bộ hai và ba đoạn của Part 7, câu hỏi ý của người nói, không để sai câu từ loại.',
    ],
  },
  {
    id: 'last-week',
    titleVi: 'Tuần cuối trước khi thi',
    introVi: 'Tuần cuối để làm quen nhịp thi và củng cố, không học phần mới.',
    points: [
      'Làm hai đề hoàn chỉnh đúng giờ, cùng khung giờ với buổi thi thật.',
      'Đọc lại sổ lỗi đã ghi. Không học thêm điểm ngữ pháp mới.',
      'Ôn các từ đã lưu trong sổ tay mỗi ngày.',
      'Kiểm tra giấy tờ tùy thân còn hạn và xem trước đường tới điểm thi.',
      'Ngủ đủ đêm trước ngày thi. Hai tiếng tập trung liền cần sức hơn một buổi học.',
    ],
  },
  {
    id: 'test-day',
    titleVi: 'Ngày thi',
    introVi: 'Thiếu giấy tờ hoặc sai tên là không được thi và mất lệ phí.',
    points: [
      'Mang bản gốc giấy tờ tùy thân còn hạn, có ảnh và chữ ký. Không có loại có chữ ký thì mang hai giấy tờ có ảnh.',
      'Bản sao và giấy tờ hết hạn không được chấp nhận.',
      'Tên lúc đăng ký phải giống hệt tên trên giấy tờ. Kiểm tra lại trên xác nhận đăng ký.',
      'Đến sớm. Đề đã phát thì không ai được vào phòng nữa.',
      'Phiếu trả lời chỉ tô bằng bút chì số 2. Bút mực, bút chì bấm, bút dạ quang, đồng hồ, điện thoại, từ điển và giấy đều không được mang vào.',
      'Không được gạch chân hay đánh dấu trong đề thi. Không ghi chú lên đề thi hoặc phiếu trả lời.',
      'Không có giờ nghỉ giữa Listening và Reading. Ra khỏi phòng phải được giám thị cho phép.',
      'Máy đọc hướng dẫn trước mỗi part của Listening. Hướng dẫn in sẵn trong đề mẫu của ETS, đọc trước ở nhà thì lúc thi dùng khoảng đó để xem tranh Part 1 hoặc đọc trước câu hỏi Part 3.',
    ],
  },
  {
    id: 'speaking-writing',
    titleVi: 'TOEIC Speaking và Writing',
    introVi: 'Bài thi riêng, làm trên máy tính, chấm thang điểm riêng.',
    points: [
      'Speaking có 11 câu trong khoảng 20 phút: đọc to đoạn văn, tả tranh, trả lời câu hỏi, trả lời theo thông tin cho sẵn, nêu ý kiến.',
      'Writing có 8 câu trong khoảng 1 tiếng: 5 câu viết theo tranh, 2 email trả lời, 1 bài nêu ý kiến.',
      'Bài nêu ý kiến có 30 phút và nên dài ít nhất 300 từ.',
      'Mỗi kỹ năng từ 0 tới 200 điểm, bước 10, không có điểm tổng.',
      'Mốc B1 là 120 điểm cho cả hai kỹ năng. Mốc B2 là 160 điểm Speaking và 150 điểm Writing.',
    ],
  },
]

const TOEIC_LINKS: readonly ToeicLink[] = [
  {
    titleVi: 'Đề mẫu Listening và Reading',
    url: 'https://www.pt.ets.org/pdfs/toeic/toeic-listening-reading-sample-test.pdf',
    noteVi: 'Đề mẫu của ETS, đơn vị ra đề, đủ 7 part, kèm lời thoại phần nghe và đáp án.',
  },
  {
    titleVi: 'Cẩm nang thí sinh',
    url: 'https://www.ets.org/content/dam/ets-india/pdfs/toeic/toeic-listening-reading-test-examinee-handbook.pdf',
    noteVi: 'Quy định phòng thi, giấy tờ tùy thân và cách tính điểm của ETS.',
  },
  {
    titleVi: 'Quy đổi điểm TOEIC sang CEFR',
    url: 'https://www.eu.ets.org/content/dam/ets-org/eu/pdfs/toeic/toeic-mapping-cefr-reference.pdf',
    noteVi: 'Bảng mốc điểm tối thiểu cho từng trình độ của cả bốn kỹ năng.',
  },
  {
    titleVi: 'Đề mẫu Speaking và Writing',
    url: 'https://www.pt.ets.org/pdfs/toeic/toeic-speaking-writing-sample-tests.pdf',
    noteVi: 'Từng dạng câu, thời gian chuẩn bị và thời gian trả lời.',
  },
  {
    titleVi: 'Tài liệu ôn của ETS',
    url: 'https://www.ets.org/toeic/test-takers/prepare.html',
    noteVi: 'Đề mẫu và cẩm nang miễn phí, cùng khóa ôn chính thức có phí.',
  },
  {
    titleVi: 'IIG Việt Nam',
    url: 'https://iigvietnam.com',
    noteVi: 'Đơn vị tổ chức thi TOEIC tại Việt Nam, nơi xem lịch thi và đăng ký.',
  },
]

export const TOEIC_GUIDE: ToeicGuide = {
  parts: TOEIC_PARTS,
  scoring: TOEIC_SCORING,
  cefr: TOEIC_CEFR,
  notes: TOEIC_NOTES,
  grammar: TOEIC_GRAMMAR,
  paraphrases: TOEIC_PARAPHRASES,
  wordTopics: TOEIC_WORD_TOPICS,
  practice: TOEIC_PRACTICE,
  links: TOEIC_LINKS,
}
