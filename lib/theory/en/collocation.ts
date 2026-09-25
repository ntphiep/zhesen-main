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
      'Cùng là "làm", nhưng tiếng Anh chia ra make, do, take và have. Phần cuối trang liệt kê các cặp quanh bốn động từ này, thêm get và give.',
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
  {
    id: 'adjective-noun',
    formula: 'Adj + N',
    titleVi: 'Tính từ đi với danh từ',
    explainVi:
      'Dạng phổ biến nhất trong tiếng Anh học thuật viết, chiếm khoảng 72% một danh sách 2.469 collocation đã đo. ' +
      'Nhiều tính từ có nghĩa gần nhau nhưng chỉ một tính từ đi được với danh từ đó.',
    examples: [
      { en: 'heavy rain', vi: 'mưa to' },
      { en: 'strong coffee', vi: 'cà phê đậm' },
      { en: 'a close friend', vi: 'một người bạn thân' },
      { en: 'a major problem', vi: 'một vấn đề lớn' },
      { en: 'a quick shower', vi: 'một lần tắm nhanh' },
    ],
    mistakes: [
      {
        wrong: 'big rain',
        right: 'heavy rain',
        whyVi: 'Mưa nhiều thì đi với heavy, không đi với big.',
      },
      {
        wrong: 'a fast shower',
        right: 'a quick shower',
        whyVi: 'Những việc làm trong chốc lát đi với quick: a quick shower, a quick break, a quick look. Đây là cặp phải nhớ.',
      },
    ],
  },
  {
    id: 'adverb-adjective',
    formula: 'Adv + Adj',
    titleVi: 'Trạng từ đi với tính từ',
    explainVi:
      'Trạng từ ở đây nói mức độ của tính từ. Mỗi tính từ nhận một nhóm trạng từ riêng, nên không thay very vào mọi chỗ được.',
    examples: [
      { en: 'fully aware', vi: 'nhận thức đầy đủ' },
      { en: 'highly recommended', vi: 'rất được khuyên dùng' },
      { en: 'widely known', vi: 'được biết đến rộng rãi' },
      { en: 'happily married', vi: 'kết hôn hạnh phúc' },
    ],
    mistakes: [
      {
        wrong: 'very delicious',
        right: 'absolutely delicious',
        whyVi: 'Tính từ đã mang nghĩa cực mạnh thì không đi với very.',
      },
      {
        wrong: 'high recommended',
        right: 'highly recommended',
        whyVi: 'Đứng trước tính từ phải là dạng trạng từ, không phải tính từ.',
      },
    ],
  },
  {
    id: 'verb-adverb',
    formula: 'V + Adv',
    titleVi: 'Động từ đi với trạng từ',
    explainVi:
      'Trạng từ nói cách làm hoặc mức độ của hành động, và thường đứng sau động từ. Chọn sai trạng từ thì câu vẫn đúng ngữ pháp nhưng nghe không tự nhiên.',
    examples: [
      { en: 'drive carefully', vi: 'lái xe cẩn thận' },
      { en: 'speak clearly', vi: 'nói rõ ràng' },
      { en: 'work hard', vi: 'làm việc chăm chỉ' },
      { en: 'rain heavily', vi: 'mưa to' },
    ],
    mistakes: [
      {
        wrong: 'He works hardly.',
        right: 'He works hard.',
        whyVi: 'hardly nghĩa là hầu như không, không phải dạng trạng từ của hard.',
      },
      {
        wrong: 'She speaks English very good.',
        right: 'She speaks English very well.',
        whyVi: 'Sau động từ dùng trạng từ well, không dùng tính từ good.',
      },
    ],
  },
  {
    id: 'noun-noun',
    formula: 'a + N đơn vị + of + N | N + N',
    titleVi: 'Danh từ đi với danh từ',
    explainVi:
      'Hai kiểu. Kiểu thứ nhất là khuôn "a ... of ...", dùng để đếm những thứ không đếm được. Kiểu thứ hai là hai danh từ ghép thẳng, trong đó danh từ đứng trước bổ nghĩa cho danh từ đứng sau.',
    examples: [
      { en: 'a piece of advice', vi: 'một lời khuyên' },
      { en: 'a bottle of water', vi: 'một chai nước' },
      { en: 'a slice of bread', vi: 'một lát bánh mì' },
      { en: 'a bus station', vi: 'bến xe buýt' },
      { en: 'a post office', vi: 'bưu điện' },
    ],
    mistakes: [
      {
        wrong: 'an advice',
        right: 'a piece of advice',
        whyVi: 'advice không đếm được, muốn đếm thì mượn một danh từ chỉ đơn vị.',
      },
      {
        wrong: 'a station bus',
        right: 'a bus station',
        whyVi: 'Danh từ đứng sau mới là từ trung tâm, danh từ đứng trước chỉ bổ nghĩa.',
      },
    ],
  },
  {
    id: 'verb-preposition',
    formula: 'V + prep',
    titleVi: 'Động từ đi với giới từ',
    explainVi:
      'Giới từ đi sau động từ không suy ra được từ nghĩa, phải học liền cả cặp. Có động từ bắt buộc giới từ, có động từ cấm giới từ.',
    examples: [
      { en: 'depend on the weather', vi: 'tuỳ thời tiết' },
      { en: 'listen to music', vi: 'nghe nhạc' },
      { en: 'wait for the bus', vi: 'đợi xe buýt' },
      { en: 'look after a child', vi: 'trông một đứa trẻ' },
      { en: 'belong to someone', vi: 'thuộc về ai đó' },
    ],
    mistakes: [
      {
        wrong: 'discuss about the plan',
        right: 'discuss the plan',
        whyVi: 'discuss đã có sẵn nghĩa bàn về, không thêm about.',
      },
      {
        wrong: 'listen music',
        right: 'listen to music',
        whyVi: 'listen luôn cần to trước tân ngữ.',
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
  {
    head: 'do',
    titleVi: 'do: làm một việc đã có sẵn',
    noteVi: 'Dùng cho việc được giao, việc lặp lại hằng ngày, và công việc nói chung khi không nêu tên kết quả.',
    items: [
      { en: 'do the homework', vi: 'làm bài tập' },
      { en: 'do the washing-up', vi: 'rửa bát' },
      { en: 'do the shopping', vi: 'đi chợ' },
      { en: 'do exercise', vi: 'tập thể dục' },
      { en: 'do research', vi: 'nghiên cứu' },
      { en: 'do someone a favour', vi: 'giúp ai một việc' },
      { en: 'do your best', vi: 'cố hết sức' },
    ],
  },
  {
    head: 'take',
    titleVi: 'take: nhóm không có tiêu chí chung',
    noteVi: 'Nhóm này không quy về một tiêu chí nào: take a photo xong trong một giây, còn take an exam kéo dài hàng giờ. Học thẳng từng cặp một.',
    items: [
      { en: 'take a photo', vi: 'chụp ảnh' },
      { en: 'take a break', vi: 'nghỉ giải lao' },
      { en: 'take the bus', vi: 'đi xe buýt' },
      { en: 'take notes', vi: 'ghi chép' },
      { en: 'take medicine', vi: 'uống thuốc' },
      { en: 'take an exam', vi: 'đi thi' },
      { en: 'take a seat', vi: 'ngồi xuống' },
    ],
  },
  {
    head: 'have',
    titleVi: 'have: đang ở trong một trạng thái',
    noteVi: 'Dùng cho bữa ăn, trải nghiệm và trạng thái mình đang có; riêng have a shower là cách nói của người Anh, người Mỹ nói take a shower.',
    items: [
      { en: 'have breakfast', vi: 'ăn sáng' },
      { en: 'have a shower', vi: 'tắm' },
      { en: 'have a rest', vi: 'nghỉ một lát' },
      { en: 'have a good time', vi: 'chơi vui' },
      { en: 'have a look', vi: 'xem thử' },
      { en: 'have a problem', vi: 'gặp rắc rối' },
      { en: 'have a cold', vi: 'bị cảm' },
    ],
  },
  {
    head: 'get',
    titleVi: 'get: chuyển sang một trạng thái khác',
    noteVi: 'Dùng khi trạng thái đổi từ chưa sang rồi, hoặc khi mình nhận được một thứ gì đó.',
    items: [
      { en: 'get a job', vi: 'xin được việc' },
      { en: 'get married', vi: 'kết hôn' },
      { en: 'get lost', vi: 'lạc đường' },
      { en: 'get dressed', vi: 'mặc quần áo' },
      { en: 'get better', vi: 'đỡ hơn' },
      { en: 'get a message', vi: 'nhận được tin nhắn' },
      { en: 'get home', vi: 'về đến nhà' },
    ],
  },
  {
    head: 'give',
    titleVi: 'give: chuyển một thứ sang cho người khác',
    noteVi: 'Dùng khi một thứ đi từ mình sang người khác, kể cả thứ không cầm nắm được như lời khuyên hay sự cho phép.',
    items: [
      { en: 'give a speech', vi: 'phát biểu' },
      { en: 'give advice', vi: 'cho lời khuyên' },
      { en: 'give someone a hand', vi: 'giúp ai một tay' },
      { en: 'give someone a call', vi: 'gọi cho ai' },
      { en: 'give permission', vi: 'cho phép' },
      { en: 'give an example', vi: 'nêu một ví dụ' },
    ],
  },
]
