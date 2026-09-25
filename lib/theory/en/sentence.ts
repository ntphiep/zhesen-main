import type { SentenceTopic } from '../types'

/** Phrases, clauses, the kinds of sentence, and the word order Vietnamese does not have.
 *  Ordered the way the page reads them. */
export const SENTENCE_TOPICS: readonly SentenceTopic[] = [
  {
    id: 'phrase',
    titleVi: 'Cụm từ',
    introVi:
      'Cụm từ là một nhóm từ hoạt động như một từ đơn. Mỗi cụm có một từ trung tâm, và loại của từ trung tâm ' +
      'quyết định loại của cả cụm. Cụm từ không có cặp chủ ngữ và động từ, nên chưa thành câu.',
    items: [
      {
        titleVi: 'Cụm danh từ',
        explainVi:
          'Từ trung tâm là danh từ. Cả cụm đứng ở vị trí của một danh từ, làm chủ ngữ hoặc tân ngữ. Từ hạn định và tính từ đứng trước, phần bổ nghĩa dài đứng sau.',
        formula: '(hạn định) + (tính từ) + N + (bổ nghĩa)',
        examples: [
          { en: 'my very good friend Peter', vi: 'người bạn rất thân của tôi, Peter' },
          { en: 'The book on the table is mine.', vi: 'Quyển sách trên bàn là của tôi.' },
        ],
      },
      {
        titleVi: 'Cụm động từ',
        explainVi:
          'Từ trung tâm là động từ, kèm trợ động từ, tân ngữ và các phần đi sau. Cả cụm nói hành động của chủ ngữ.',
        formula: '(trợ động từ) + V + (tân ngữ) + (bổ ngữ)',
        examples: [
          { en: 'She has finished her homework.', vi: 'Cô ấy đã làm xong bài tập.' },
          { en: 'They were waiting for the bus.', vi: 'Họ đang đợi xe buýt.' },
        ],
      },
      {
        titleVi: 'Cụm tính từ',
        explainVi:
          'Từ trung tâm là tính từ. Trạng từ chỉ mức độ đứng trước, phần bổ nghĩa đứng sau.',
        formula: '(trạng từ) + Adj + (bổ nghĩa)',
        examples: [
          { en: 'This test is very easy.', vi: 'Bài kiểm tra này rất dễ.' },
          { en: 'I am afraid of dogs.', vi: 'Tôi sợ chó.' },
        ],
      },
      {
        titleVi: 'Cụm trạng từ',
        explainVi:
          'Từ trung tâm là trạng từ. Cả cụm nói cách làm, mức độ hoặc thời điểm của hành động.',
        formula: '(trạng từ) + Adv',
        examples: [
          { en: 'He drives very carefully.', vi: 'Anh ấy lái xe rất cẩn thận.' },
          { en: 'She left quite early.', vi: 'Cô ấy về khá sớm.' },
        ],
      },
      {
        titleVi: 'Cụm giới từ',
        explainVi:
          'Từ trung tâm là giới từ, sau nó luôn là một cụm danh từ. Cả cụm thường làm trạng ngữ chỉ nơi chốn hoặc thời gian.',
        formula: 'Prep + cụm danh từ',
        examples: [
          { en: 'The keys are in my bag.', vi: 'Chìa khoá ở trong túi tôi.' },
          { en: 'We meet on Monday morning.', vi: 'Chúng tôi gặp nhau vào sáng thứ Hai.' },
        ],
      },
    ],
    mistakes: [
      {
        wrong: 'I have cat.',
        right: 'I have a cat.',
        whyVi: 'Danh từ đếm được số ít luôn cần một từ hạn định đứng trước.',
      },
      {
        wrong: 'a house very big',
        right: 'a very big house',
        whyVi: 'Cả cụm tính từ đứng trước danh từ, không tách ra sau.',
      },
    ],
  },
  {
    id: 'clause',
    titleVi: 'Mệnh đề',
    introVi:
      'Mệnh đề có động từ và thường có chủ ngữ, cụm từ thì không. Đây là đơn vị nhỏ nhất nói được một sự việc trọn vẹn.',
    items: [
      {
        titleVi: 'Mệnh đề khác cụm từ ở chỗ nào',
        explainVi:
          'Cùng một nhóm từ, thêm động từ đã chia thì thành mệnh đề. Chưa có động từ chia thì vẫn chỉ là cụm.',
        formula: null,
        examples: [
          { en: 'my friend Peter', vi: 'bạn tôi, Peter, mới là một cụm danh từ' },
          { en: 'My friend Peter works in Hue.', vi: 'Bạn tôi Peter làm việc ở Huế, đã thành mệnh đề.' },
        ],
      },
      {
        titleVi: 'Năm thành phần của mệnh đề',
        explainVi:
          'S là chủ ngữ, V là động từ, O là tân ngữ, C là bổ ngữ nói về chủ ngữ hoặc tân ngữ, A là trạng ngữ chỉ thời gian, nơi chốn hoặc cách thức. S và V là bắt buộc, A bỏ được.',
        formula: 'S + V + O + C + A',
        examples: [
          { en: 'Tom washed the car carefully.', vi: 'Tom rửa xe cẩn thận, trong đó the car là O và carefully là A.' },
          { en: 'The soup is cold.', vi: 'Món súp nguội rồi, trong đó cold là C nói về chủ ngữ.' },
        ],
      },
      {
        titleVi: 'Nội động từ, không cần tân ngữ',
        explainVi: 'Mệnh đề đủ nghĩa với chủ ngữ và động từ. Thêm tân ngữ vào là sai.',
        formula: 'S + V',
        examples: [
          { en: 'The baby is sleeping.', vi: 'Em bé đang ngủ.' },
          { en: 'Prices rose last month.', vi: 'Giá tăng vào tháng trước.' },
        ],
      },
      {
        titleVi: 'Ngoại động từ và một tân ngữ',
        explainVi: 'Động từ cần một tân ngữ mới đủ nghĩa. Đây là khuôn thường gặp nhất.',
        formula: 'S + V + O',
        examples: [
          { en: 'She runs the meeting.', vi: 'Cô ấy điều hành cuộc họp.' },
          { en: 'I lost my keys.', vi: 'Tôi làm mất chìa khoá.' },
        ],
      },
      {
        titleVi: 'Động từ nối và bổ ngữ của chủ ngữ',
        explainVi:
          'Động từ nối như be, seem, become, look, smell không có tân ngữ. Phần đứng sau nói về chính chủ ngữ.',
        formula: 'S + V + C',
        examples: [
          { en: 'My sister is a nurse.', vi: 'Chị tôi là y tá.' },
          { en: 'The soup smells good.', vi: 'Món súp thơm.' },
        ],
      },
      {
        titleVi: 'Hai tân ngữ',
        explainVi:
          'Tân ngữ gián tiếp là người nhận và đứng trước. Nếu muốn để người nhận ra sau thì phải thêm to hoặc for.',
        formula: 'S + V + O gián tiếp + O trực tiếp',
        examples: [
          { en: 'He gave the dog a bone.', vi: 'Anh ấy cho con chó một khúc xương.' },
          { en: 'He gave a bone to the dog.', vi: 'Cùng nghĩa, người nhận chuyển ra sau nên phải thêm to.' },
        ],
      },
      {
        titleVi: 'Tân ngữ và bổ ngữ của tân ngữ',
        explainVi:
          'Bổ ngữ ở đây nói về tân ngữ, không nói về chủ ngữ. Tân ngữ và bổ ngữ dính nhau thành một khối.',
        formula: 'S + V + O + C',
        examples: [
          { en: 'They made him happy.', vi: 'Họ làm anh ấy vui, cả cụm him happy mới là thứ họ tạo ra.' },
          { en: 'We call her Mai.', vi: 'Chúng tôi gọi cô ấy là Mai.' },
        ],
      },
      {
        titleVi: 'Mệnh đề chính và mệnh đề phụ',
        explainVi:
          'Mệnh đề chính đứng một mình thành câu. Mệnh đề phụ mở đầu bằng because, when, if, that hoặc một đại từ quan hệ, và phải dựa vào mệnh đề chính.',
        formula: null,
        examples: [
          { en: 'I stayed home because it rained.', vi: 'Tôi ở nhà vì trời mưa.' },
          { en: 'The book that you lent me is good.', vi: 'Quyển sách bạn cho tôi mượn hay lắm.' },
        ],
      },
    ],
    mistakes: [
      {
        wrong: 'Because I was tired.',
        right: 'I went home because I was tired.',
        whyVi: 'Mệnh đề phụ không đứng một mình thành câu.',
      },
      {
        wrong: 'Is raining today.',
        right: 'It is raining today.',
        whyVi: 'Mệnh đề tiếng Anh luôn phải có chủ ngữ, kể cả khi chủ ngữ không chỉ ai.',
      },
    ],
  },
  {
    id: 'sentence-type',
    titleVi: 'Các loại câu',
    introVi:
      'Có hai cách gọi tên một câu. Theo cấu trúc thì đếm số mệnh đề. Theo chức năng thì xem câu dùng để làm gì. ' +
      'Bốn mục đầu là theo cấu trúc, bốn mục sau là theo chức năng.',
    items: [
      {
        titleVi: 'Câu đơn (simple)',
        explainVi:
          'Một mệnh đề độc lập, không có mệnh đề phụ. Câu đơn vẫn dài được nếu chủ ngữ hoặc tân ngữ là một cụm dài.',
        formula: '1 mệnh đề độc lập',
        examples: [
          { en: 'I like trains.', vi: 'Tôi thích tàu hoả.' },
          { en: 'The students in my class study very hard.', vi: 'Học sinh lớp tôi học rất chăm.' },
        ],
      },
      {
        titleVi: 'Câu ghép (compound)',
        explainVi:
          'Từ hai mệnh đề độc lập trở lên, nối bằng liên từ kết hợp hoặc dấu chấm phẩy. Hai mệnh đề ngang hàng nhau.',
        formula: 'mệnh đề độc lập + for, and, nor, but, or, yet, so + mệnh đề độc lập',
        examples: [
          { en: 'I cannot bake, so I buy my bread.', vi: 'Tôi không biết làm bánh nên tôi mua bánh.' },
          { en: 'She called me, but I was asleep.', vi: 'Cô ấy gọi tôi nhưng tôi đang ngủ.' },
        ],
      },
      {
        titleVi: 'Câu phức (complex)',
        explainVi:
          'Một mệnh đề độc lập kèm ít nhất một mệnh đề phụ. Mệnh đề phụ đứng trước thì có dấu phẩy ngăn cách.',
        formula: 'mệnh đề độc lập + mệnh đề phụ',
        examples: [
          { en: 'I enjoyed the cake that you bought.', vi: 'Tôi thích cái bánh bạn mua.' },
          { en: 'When the rain stopped, we went out.', vi: 'Khi mưa tạnh, chúng tôi đi ra ngoài.' },
        ],
      },
      {
        titleVi: 'Câu ghép phức (compound-complex)',
        explainVi:
          'Từ hai mệnh đề độc lập trở lên cộng ít nhất một mệnh đề phụ. Hay gặp trong văn viết, ít gặp khi nói.',
        formula: '2 mệnh đề độc lập trở lên + 1 mệnh đề phụ trở lên',
        examples: [
          { en: 'I was tired, so I went to bed before the film ended.', vi: 'Tôi mệt nên tôi đi ngủ trước khi phim hết.' },
          { en: 'The dog lived outside, but the cat, who was older, slept inside.', vi: 'Con chó sống ngoài sân, còn con mèo, vốn già hơn, ngủ trong nhà.' },
        ],
      },
      {
        titleVi: 'Câu kể (declarative)',
        explainVi: 'Dùng để kể một sự việc. Chủ ngữ đứng trước động từ, câu kết thúc bằng dấu chấm.',
        formula: 'S + V',
        examples: [
          { en: 'This is a tree.', vi: 'Đây là một cái cây.' },
          { en: 'My brother works at a bank.', vi: 'Anh tôi làm ở ngân hàng.' },
        ],
      },
      {
        titleVi: 'Câu hỏi (interrogative)',
        explainVi:
          'Dùng để hỏi. Trợ động từ đảo lên trước chủ ngữ, và nếu động từ chính không có trợ động từ thì mượn do.',
        formula: 'trợ động từ + S + V | từ hỏi + trợ động từ + S + V',
        examples: [
          { en: 'Is this a tree?', vi: 'Đây có phải là cây không?' },
          { en: 'What did you see?', vi: 'Bạn đã thấy gì?' },
        ],
      },
      {
        titleVi: 'Câu cầu khiến (imperative)',
        explainVi:
          'Dùng để sai bảo, đề nghị hoặc hướng dẫn. Không có chủ ngữ, động từ để nguyên thể.',
        formula: 'V + ...',
        examples: [
          { en: 'Close the door, please.', vi: 'Làm ơn đóng cửa lại.' },
          { en: 'Do not touch that.', vi: 'Đừng chạm vào cái đó.' },
        ],
      },
      {
        titleVi: 'Câu cảm thán (exclamative)',
        explainVi:
          'Dùng để bộc lộ cảm xúc. Mở đầu bằng what hoặc how, và không đảo trợ động từ như câu hỏi.',
        formula: 'What + (a/an) + Adj + N + S + V | How + Adj + S + V',
        examples: [
          { en: 'What a tall tree that is!', vi: 'Cây đó cao thật.' },
          { en: 'How cold it is today!', vi: 'Hôm nay lạnh thật.' },
        ],
      },
    ],
    mistakes: [
      {
        wrong: 'The sun was shining, everyone was happy.',
        right: 'The sun was shining, and everyone was happy.',
        whyVi: 'Hai mệnh đề độc lập không nối được bằng mỗi dấu phẩy, phải có liên từ hoặc dấu chấm phẩy.',
      },
      {
        wrong: 'What you are doing?',
        right: 'What are you doing?',
        whyVi: 'Câu hỏi vẫn đảo trợ động từ lên trước chủ ngữ, kể cả khi đã có từ hỏi.',
      },
    ],
  },
  {
    id: 'negation',
    titleVi: 'Câu phủ định',
    introVi:
      'Tiếng Việt đặt một chữ "không" trước động từ là xong. Tiếng Anh đặt not lên trợ động từ, ' +
      'và động từ chính trở về dạng nguyên thể.',
    items: [
      {
        titleVi: 'Động từ thường mượn do',
        explainVi:
          'Động từ thường không tự nhận not được, phải mượn do. do đã mang ngôi và thì rồi, nên động từ chính bỏ s và bỏ dạng quá khứ.',
        formula: 'S + do/does/did + not + V nguyên thể',
        examples: [
          { en: 'She does not like coffee.', vi: 'Cô ấy không thích cà phê.' },
          { en: 'We did not see the film.', vi: 'Chúng tôi không xem bộ phim đó.' },
        ],
      },
      {
        titleVi: 'to be và động từ khuyết thiếu không mượn do',
        explainVi:
          'be, can, will, should và các động từ khuyết thiếu khác nhận not ngay sau chúng. Câu đã có sẵn một trợ động từ như have hoặc is cũng vậy.',
        formula: 'S + be/modal + not + ...',
        examples: [
          { en: 'He is not at home.', vi: 'Anh ấy không có nhà.' },
          { en: 'You should not wait here.', vi: 'Bạn không nên đợi ở đây.' },
        ],
      },
      {
        titleVi: 'Dạng rút gọn và dạng đầy đủ',
        explainVi:
          'Hai dạng cùng nghĩa, chỉ khác mức trang trọng. Khi nói và khi viết thân mật thì rút gọn, văn viết trang trọng giữ dạng đầy đủ.',
        formula: "do not = don't | is not = isn't | will not = won't",
        examples: [
          { en: "I don't know.", vi: 'Tôi không biết.' },
          { en: 'The report does not mention the cost.', vi: 'Báo cáo không nhắc đến chi phí.' },
        ],
      },
      {
        titleVi: 'Trả lời câu hỏi phủ định',
        explainVi:
          'Tiếng Việt trả lời theo câu hỏi, tiếng Anh trả lời theo sự việc. Sự việc không xảy ra thì luôn là No, dù trong câu hỏi có not.',
        formula: null,
        examples: [
          { en: "Don't you like it? No, I don't.", vi: 'Bạn không thích à? Đúng, tôi không thích, nhưng tiếng Anh vẫn nói No.' },
          { en: "Aren't you coming? Yes, I am.", vi: 'Bạn không đến à? Có, tôi có đến.' },
        ],
      },
      {
        titleVi: 'Một mệnh đề chỉ phủ định một lần',
        explainVi:
          'Tiếng Anh chuẩn không đặt hai từ phủ định trong cùng một mệnh đề. Đã có not thì dùng anything, anyone, ever; đã dùng nothing, nobody, never thì bỏ not.',
        formula: null,
        examples: [
          { en: 'I did not see anything.', vi: 'Tôi không thấy gì cả.' },
          { en: 'I saw nothing.', vi: 'Cùng nghĩa, nhưng chỉ chọn một trong hai cách.' },
        ],
      },
    ],
    mistakes: [
      {
        wrong: 'She does not likes coffee.',
        right: 'She does not like coffee.',
        whyVi: 'does đã mang ngôi thứ ba rồi, động từ chính trở về nguyên thể.',
      },
      {
        wrong: 'I not agree.',
        right: 'I do not agree.',
        whyVi: 'Động từ thường cần do đứng trước not, không đặt not thẳng trước động từ.',
      },
    ],
  },
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
          'Khi có từ hai tính từ trở lên, thứ tự giữa chúng là cố định, và sai thứ tự thì nghe rất lạ. Bảng thứ tự đầy đủ nằm ở trang Từ loại, mục tính từ.',
        formula: null,
        examples: [
          { en: 'a lovely little house', vi: 'một ngôi nhà nhỏ xinh' },
          { en: 'a big red balloon', vi: 'một quả bóng bay đỏ to' },
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
