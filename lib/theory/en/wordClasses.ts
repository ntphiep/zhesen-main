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
    grammarKeys: [
      'a1:danh-tu-so-nhieu',
      'a2:danh-tu-dem-duoc-va-khong-dem-duoc',
      'a1:mao-tu-bat-dinh-a-an',
      'a2:luong-tu-a-few-a-little-enough',
      'b2:mao-tu-voi-danh-tu-truu-tuong',
    ],
  },
  {
    key: 'verb',
    titleVi: 'Động từ',
    abbr: 'v.',
    oneLineVi: 'Từ chỉ hành động, sự việc xảy ra hoặc trạng thái tồn tại.',
    roleVi:
      'Là trung tâm của câu. Chia theo chủ ngữ và theo thì, và quyết định câu cần bao nhiêu tân ngữ.',
    forms: [
      {
        titleVi: 'Quá khứ',
        explainVi: 'Thêm -ed vào động từ có quy tắc. Nhóm bất quy tắc đổi hẳn hình và phải học thuộc.',
        examples: ['work → worked', 'go → went', 'buy → bought'],
      },
      {
        titleVi: 'Ngôi thứ ba số ít',
        explainVi: 'Ở hiện tại đơn, chủ ngữ he, she, it kéo theo -s trên động từ.',
        examples: ['he works', 'she goes', 'it costs'],
      },
      {
        titleVi: 'Dạng -ing',
        explainVi: 'Dùng cho các thì tiếp diễn và cho danh động từ.',
        examples: ['work → working', 'run → running', 'write → writing'],
      },
      {
        titleVi: 'Quá khứ phân từ',
        explainVi: 'Dùng cho các thì hoàn thành và cho câu bị động. Giống dạng quá khứ, trừ động từ bất quy tắc.',
        examples: ['worked', 'gone', 'written', 'seen'],
      },
    ],
    subtypes: [
      {
        titleVi: 'Nội động từ và ngoại động từ',
        explainVi: 'Ngoại động từ cần một tân ngữ mới đủ nghĩa. Nội động từ không nhận tân ngữ.',
        examples: ['She brought a book', 'He arrived late'],
      },
      {
        titleVi: 'Động từ hai tân ngữ',
        explainVi: 'Nhận cả tân ngữ gián tiếp và tân ngữ trực tiếp, người nhận đứng trước.',
        examples: ['give me the key', 'send him a letter'],
      },
      {
        titleVi: 'Trợ động từ',
        explainVi:
          'be, do, have và các modal. Dùng để tạo câu hỏi, câu phủ định và các thì, không mang nghĩa chính.',
        examples: ['Has he arrived?', 'I do not know', 'She can swim'],
      },
      {
        titleVi: 'Động từ nối',
        explainVi: 'Nối chủ ngữ với tính từ hoặc danh từ mô tả chính chủ ngữ, nên phần đứng sau không phải tân ngữ.',
        examples: ['be', 'seem', 'become', 'look'],
      },
      {
        titleVi: 'Cụm động từ',
        explainVi: 'Động từ cộng một tiểu từ thành một nghĩa mới, không đoán được từ nghĩa của hai phần.',
        examples: ['give up', 'look after', 'run out of'],
      },
    ],
    mistakes: [
      {
        wrong: 'Yesterday I go to school.',
        right: 'Yesterday I went to school.',
        whyVi: 'Tiếng Anh đánh dấu thì ngay trên động từ, dù câu đã có trạng từ chỉ thời gian.',
      },
      {
        wrong: "She don't like coffee.",
        right: "She doesn't like coffee.",
        whyVi: 'Chủ ngữ ngôi thứ ba số ít dùng does, và động từ chính giữ nguyên dạng.',
      },
      {
        wrong: 'I am agree with you.',
        right: 'I agree with you.',
        whyVi: 'agree đã là động từ, không cần be đứng trước.',
      },
    ],
    grammarKeys: [
      'a1:hien-tai-don-dong-tu-thuong-khang-dinh',
      'a2:past-simple-regular-verbs',
      'a2:past-simple-irregular-verbs',
      'a2:dong-tu-theo-sau-v-ing-hoac-to-v',
      'a2:cum-dong-tu-thong-dung',
      'b1:cau-bi-dong-hien-tai-va-qua-khu-don',
    ],
  },
  {
    key: 'adjective',
    titleVi: 'Tính từ',
    abbr: 'adj.',
    oneLineVi: 'Từ mô tả tính chất của danh từ hoặc đại từ.',
    roleVi:
      'Đứng trước danh từ, hoặc đứng sau động từ nối như be, seem, become. Không đổi hình theo số nhiều của danh từ.',
    forms: [
      {
        titleVi: 'So sánh hơn',
        explainVi:
          'Tính từ một âm tiết thêm -er. Tính từ hai âm tiết tận cùng bằng -y đổi y thành i rồi thêm -er. Các tính từ dài còn lại dùng more đứng trước.',
        examples: ['tall → taller', 'happy → happier', 'expensive → more expensive'],
      },
      {
        titleVi: 'So sánh nhất',
        explainVi: 'Thêm -est hoặc dùng the most. Một nhóm nhỏ bất quy tắc.',
        examples: ['tall → the tallest', 'good → the best', 'bad → the worst'],
      },
    ],
    subtypes: [
      {
        titleVi: 'Có mức độ và không có mức độ',
        explainVi:
          'Tính từ có mức độ đi với very và có dạng so sánh. Tính từ không có mức độ chỉ đúng hoặc sai, đi với absolutely hay completely.',
        examples: ['very cold', 'absolutely perfect', 'completely impossible'],
      },
      {
        titleVi: 'Vị trí trước danh từ và sau động từ',
        explainVi: 'Phần lớn tính từ dùng được cả hai vị trí. Một số chỉ dùng được một vị trí.',
        examples: ['the main reason', 'the baby is asleep', 'the only way'],
      },
      {
        titleVi: 'Tính từ -ed và -ing',
        explainVi: '-ed nói cảm giác của người. -ing nói tính chất của thứ gây ra cảm giác đó.',
        examples: ['I am bored', 'the film is boring', 'she is interested'],
      },
      {
        titleVi: 'Trật tự nhiều tính từ',
        explainVi:
          'Nhiều tính từ trước một danh từ xếp theo tám nhóm, lần lượt là ý kiến, kích thước, tuổi, hình dáng, màu sắc, nguồn gốc, chất liệu, mục đích. Nhóm mục đích nằm sát danh từ và thường là một danh từ hay một dạng -ing nói vật đó dùng để làm gì. Các tài liệu không thống nhất vị trí của tuổi và hình dáng.',
        examples: [
          'a beautiful big old round white Italian marble dining table',
          'a nice little old round white brick house',
        ],
      },
    ],
    mistakes: [
      {
        wrong: 'I bought a car red.',
        right: 'I bought a red car.',
        whyVi: 'Tính từ đứng trước danh từ, ngược với trật tự tiếng Việt.',
      },
      {
        wrong: 'She is more taller than me.',
        right: 'She is taller than me.',
        whyVi: 'Chỉ dùng một cách so sánh, hoặc -er hoặc more, không dùng cả hai.',
      },
      {
        wrong: 'I am very interesting in music.',
        right: 'I am very interested in music.',
        whyVi: '-ed cho cảm giác của người, -ing cho thứ gây ra cảm giác.',
      },
    ],
    grammarKeys: [
      'a2:comparative-short-adjectives',
      'a2:comparative-long-adjectives',
      'a2:superlative-adjectives',
      'a2:tinh-tu-duoi-ed-va-ing',
      'b1:too-enough-so-that',
    ],
  },
  {
    key: 'adverb',
    titleVi: 'Trạng từ',
    abbr: 'adv.',
    oneLineVi: 'Từ bổ nghĩa cho động từ, tính từ, một trạng từ khác hoặc cả câu.',
    roleVi:
      'Nói hành động xảy ra thế nào, ở đâu, khi nào, bao lâu một lần. Vị trí linh hoạt, nhưng không chen vào giữa động từ và tân ngữ.',
    forms: [
      {
        titleVi: 'Tạo từ tính từ',
        explainVi: 'Phần lớn thêm -ly vào tính từ. Một số giữ nguyên hình của tính từ, và good có dạng riêng.',
        examples: ['quick → quickly', 'easy → easily', 'fast → fast', 'good → well'],
      },
      {
        titleVi: 'So sánh',
        explainVi: 'Trạng từ -ly dùng more và the most. Trạng từ ngắn thêm -er và -est.',
        examples: ['more carefully', 'faster', 'the most clearly'],
      },
    ],
    subtypes: [
      {
        titleVi: 'Trạng từ chỉ cách thức',
        explainVi: 'Nói hành động diễn ra thế nào. Thường đứng cuối câu.',
        examples: ['slowly', 'well', 'carefully'],
      },
      {
        titleVi: 'Trạng từ chỉ tần suất',
        explainVi: 'Nói bao lâu một lần. Đứng trước động từ chính, nhưng đứng sau be.',
        examples: ['always', 'often', 'never'],
      },
      {
        titleVi: 'Trạng từ chỉ mức độ',
        explainVi: 'Tăng hoặc giảm cường độ của tính từ hay trạng từ đứng ngay sau.',
        examples: ['very', 'quite', 'extremely'],
      },
      {
        titleVi: 'Trạng từ chỉ thời gian và nơi chốn',
        explainVi: 'Thường đứng cuối câu, nơi chốn đứng trước thời gian.',
        examples: ['here', 'yesterday', 'abroad'],
      },
      {
        titleVi: 'Trạng từ nối câu',
        explainVi: 'Nối ý của câu này với câu trước. Đứng đầu câu và có dấu phẩy theo sau.',
        examples: ['however', 'therefore', 'moreover'],
      },
    ],
    mistakes: [
      {
        wrong: 'He speaks English very good.',
        right: 'He speaks English very well.',
        whyVi: 'Bổ nghĩa cho động từ thì dùng trạng từ well, không dùng tính từ good.',
      },
      {
        wrong: 'I always am late.',
        right: 'I am always late.',
        whyVi: 'Trạng từ tần suất đứng sau be và đứng trước các động từ khác.',
      },
      {
        wrong: 'She speaks well English.',
        right: 'She speaks English well.',
        whyVi: 'Không chen trạng từ vào giữa động từ và tân ngữ của nó.',
      },
    ],
    grammarKeys: [
      'a2:trang-tu-tan-suat-va-vi-tri',
      'a2:trang-tu-chi-cach-thuc',
      'a2:tu-nhan-manh-muc-do',
      'b1:so-sanh-trang-tu',
      'b2:trang-tu-chi-thai-do',
    ],
  },
  {
    key: 'pronoun',
    titleVi: 'Đại từ',
    abbr: 'pron.',
    oneLineVi: 'Từ dùng thay cho một danh từ hoặc một cụm danh từ đã nhắc trước đó.',
    roleVi:
      'Đứng ở vị trí của danh từ, làm chủ ngữ hoặc tân ngữ. Hình thức đổi theo ngôi, theo số và theo vai trò trong câu.',
    forms: [
      {
        titleVi: 'Chủ ngữ và tân ngữ',
        explainVi: 'Đại từ nhân xưng có hai hình khác nhau cho hai vai trò này.',
        examples: ['I → me', 'he → him', 'we → us', 'they → them'],
      },
      {
        titleVi: 'Sở hữu',
        explainVi: 'Dạng đứng trước danh từ khác dạng đứng một mình.',
        examples: ['my book → mine', 'your bag → yours', 'their house → theirs'],
      },
      {
        titleVi: 'Phản thân',
        explainVi: 'Thêm -self cho số ít và -selves cho số nhiều.',
        examples: ['myself', 'himself', 'themselves'],
      },
    ],
    subtypes: [
      {
        titleVi: 'Đại từ nhân xưng',
        explainVi: 'Chỉ người nói, người nghe và người được nhắc tới. Ngôi thứ ba số ít phân biệt giống.',
        examples: ['I', 'you', 'he', 'she', 'it', 'they'],
      },
      {
        titleVi: 'Đại từ chỉ định',
        explainVi: 'this và these chỉ vật ở gần, that và those chỉ vật ở xa.',
        examples: ['this', 'that', 'these', 'those'],
      },
      {
        titleVi: 'Đại từ quan hệ',
        explainVi: 'Mở đầu mệnh đề bổ nghĩa cho danh từ đứng ngay trước nó.',
        examples: ['who', 'which', 'that', 'whose'],
      },
      {
        titleVi: 'Đại từ bất định',
        explainVi: 'Chỉ người hoặc vật không xác định. Đi với động từ số ít.',
        examples: ['someone', 'anything', 'everybody', 'nothing'],
      },
      {
        titleVi: 'Đại từ phản thân',
        explainVi: 'Dùng khi chủ ngữ và tân ngữ là cùng một người.',
        examples: ['I hurt myself', 'he taught himself'],
      },
    ],
    mistakes: [
      {
        wrong: 'Me and my friend went out.',
        right: 'My friend and I went out.',
        whyVi: 'Vị trí chủ ngữ dùng I, vị trí tân ngữ mới dùng me.',
      },
      {
        wrong: 'My sister, she is a doctor.',
        right: 'My sister is a doctor.',
        whyVi: 'Một câu chỉ có một chủ ngữ, không lặp lại chủ ngữ bằng đại từ.',
      },
      {
        wrong: 'Everybody have a phone.',
        right: 'Everybody has a phone.',
        whyVi: 'Đại từ bất định đi với động từ số ít.',
      },
    ],
    grammarKeys: [
      'a1:dai-tu-nhan-xung-va-tinh-tu-so-huu',
      'b1:menh-de-quan-he-xac-dinh',
      'b1:menh-de-quan-he-khong-xac-dinh',
      'b2:menh-de-quan-he-rut-gon',
    ],
  },
  {
    key: 'determiner',
    titleVi: 'Từ hạn định',
    abbr: 'det.',
    oneLineVi: 'Từ đứng trước danh từ để nói danh từ đó thuộc về ai, là cái nào hay có bao nhiêu.',
    roleVi:
      'Đứng đầu cụm danh từ, trước cả tính từ. Danh từ đếm được số ít gần như luôn cần một từ hạn định, và một cụm danh từ chỉ nhận một từ hạn định chính.',
    forms: [
      {
        titleVi: 'Hợp số với danh từ',
        explainVi: 'Từ chỉ định đổi hình theo số của danh từ. Các từ hạn định khác giữ nguyên hình.',
        examples: ['this book → these books', 'that man → those men'],
      },
    ],
    subtypes: [
      {
        titleVi: 'Từ chỉ định',
        explainVi: 'this, that, these, those. Chỉ vật ở gần hay ở xa, và phải hợp số với danh từ.',
        examples: ['this week', 'those days'],
      },
      {
        titleVi: 'Từ sở hữu',
        explainVi: 'my, your, his, her, its, our, their. Đứng thay chỗ của mạo từ, không dùng cùng mạo từ.',
        examples: ['my house', 'their idea'],
      },
      {
        titleVi: 'Từ chỉ lượng',
        explainVi: 'some, any, many, much, few, little, all. Chọn theo danh từ đếm được hay không đếm được.',
        examples: ['many books', 'much time', 'a few days'],
      },
      {
        titleVi: 'Số từ',
        explainVi: 'Số đếm nói số lượng, số thứ tự nói vị trí và đi với the.',
        examples: ['three cats', 'the second floor'],
      },
      {
        titleVi: 'Từ hạn định nghi vấn',
        explainVi: 'which, what, whose đứng trước danh từ trong câu hỏi.',
        examples: ['which bus', 'whose bag'],
      },
    ],
    mistakes: [
      {
        wrong: 'I like these book.',
        right: 'I like these books.',
        whyVi: 'Từ chỉ định phải hợp số với danh từ đứng sau.',
      },
      {
        wrong: 'He has much friends.',
        right: 'He has many friends.',
        whyVi: 'much đi với danh từ không đếm được, many đi với danh từ đếm được.',
      },
      {
        wrong: 'The my car is old.',
        right: 'My car is old.',
        whyVi: 'Từ sở hữu đã thay cho mạo từ, không đứng cùng the.',
      },
    ],
    grammarKeys: [
      'a2:danh-tu-dem-duoc-va-khong-dem-duoc',
      'a2:luong-tu-a-few-a-little-enough',
      'b1:luong-tu-all-most-both',
      'a1:dai-tu-nhan-xung-va-tinh-tu-so-huu',
    ],
  },
  {
    key: 'article',
    titleVi: 'Mạo từ',
    abbr: 'art.',
    oneLineVi: 'Ba từ a, an và the, nói danh từ đứng sau là một cái bất kỳ hay đúng cái người nghe đã biết.',
    roleVi:
      'Đứng đầu cụm danh từ. Tiếng Việt không có mạo từ, nên phần này phải học bằng quy tắc chứ không dịch sang được.',
    forms: [
      {
        titleVi: 'a và an',
        explainVi: 'Chọn theo âm đầu của từ ngay sau, không theo chữ cái. Âm phụ âm dùng a, âm nguyên âm dùng an.',
        examples: ['a book', 'an apple', 'a university', 'an hour'],
      },
    ],
    subtypes: [
      {
        titleVi: 'Mạo từ không xác định',
        explainVi: 'a và an dùng cho danh từ đếm được số ít, khi nhắc lần đầu hoặc khi không cần chỉ rõ cái nào.',
        examples: ['I bought a car', 'She is a nurse'],
      },
      {
        titleVi: 'Mạo từ xác định',
        explainVi:
          'the dùng khi người nghe biết đang nói cái nào: đã nhắc trước, duy nhất, hoặc được xác định ngay trong câu.',
        examples: ['the car I bought', 'the sun', 'the first time'],
      },
      {
        titleVi: 'Không dùng mạo từ',
        explainVi: 'Danh từ số nhiều và danh từ không đếm được mang nghĩa chung thì không có mạo từ.',
        examples: ['Cats are independent', 'Water is cheap', 'I like music'],
      },
      {
        titleVi: 'Mạo từ với tên riêng',
        explainVi:
          'Tên người, tên thành phố và tên phần lớn quốc gia không có the. Tên sông, biển, dãy núi và quốc gia dạng số nhiều thì có.',
        examples: ['Vietnam', 'the Mekong', 'the Philippines'],
      },
    ],
    mistakes: [
      {
        wrong: 'I am student.',
        right: 'I am a student.',
        whyVi: 'Nghề nghiệp ở số ít luôn cần a hoặc an đứng trước.',
      },
      {
        wrong: 'I go to the school every day.',
        right: 'I go to school every day.',
        whyVi: 'Khi nói về hoạt động chính của nơi đó, school, work và home không có the.',
      },
      {
        wrong: 'The music is my hobby.',
        right: 'Music is my hobby.',
        whyVi: 'Danh từ không đếm được mang nghĩa chung thì bỏ mạo từ.',
      },
    ],
    grammarKeys: [
      'a1:mao-tu-bat-dinh-a-an',
      'a1:mao-tu-xac-dinh-the',
      'b2:mao-tu-voi-danh-tu-truu-tuong',
    ],
  },
  {
    key: 'preposition',
    titleVi: 'Giới từ',
    abbr: 'prep.',
    oneLineVi: 'Từ đặt trước danh từ để nói quan hệ về nơi chốn, thời gian hay cách thức.',
    roleVi:
      'Luôn có một tân ngữ là danh từ, đại từ hoặc động từ dạng -ing, và không đổi hình. Tân ngữ đó chuyển lên đầu mệnh đề được, để giới từ đứng lại ở cuối, như trong "What are you talking about?" và "the book I told you about".',
    forms: [],
    subtypes: [
      {
        titleVi: 'Giới từ chỉ nơi chốn',
        explainVi: 'in cho không gian bao quanh, on cho bề mặt, at cho một điểm.',
        examples: ['in the room', 'on the table', 'at the door'],
      },
      {
        titleVi: 'Giới từ chỉ thời gian',
        explainVi: 'in cho tháng và năm, on cho ngày, at cho giờ.',
        examples: ['in July', 'on Monday', 'at seven'],
      },
      {
        titleVi: 'Giới từ chỉ hướng',
        explainVi: 'Nói chuyển động đi từ đâu tới đâu.',
        examples: ['to the office', 'into the box', 'from Hanoi'],
      },
      {
        titleVi: 'Giới từ đi cố định với một từ',
        explainVi: 'Nhiều động từ và tính từ đi với một giới từ cố định. Phải học cả cặp, không suy ra được.',
        examples: ['depend on', 'interested in', 'good at'],
      },
      {
        titleVi: 'Cụm giới từ',
        explainVi: 'Hai hoặc ba từ cùng làm việc của một giới từ.',
        examples: ['in front of', 'because of', 'according to'],
      },
    ],
    mistakes: [
      {
        wrong: 'I am good in English.',
        right: 'I am good at English.',
        whyVi: 'good luôn đi với at. Giới từ theo sau tính từ là cố định.',
      },
      {
        wrong: 'I am looking forward to meet you.',
        right: 'I am looking forward to meeting you.',
        whyVi: 'to ở đây là giới từ, nên động từ theo sau phải ở dạng -ing.',
      },
      {
        wrong: 'We arrived to Hanoi at night.',
        right: 'We arrived in Hanoi at night.',
        whyVi: 'arrive đi với in cho thành phố và at cho một địa điểm, không đi với to.',
      },
    ],
    grammarKeys: [
      'a1:gioi-tu-noi-chon-in-on-at',
      'a1:gioi-tu-thoi-gian-in-on-at',
      'a2:gioi-tu-chi-chuyen-dong',
      'b2:menh-de-quan-he-voi-gioi-tu',
      'a2:to-v-chi-muc-dich',
    ],
  },
  {
    key: 'conjunction',
    titleVi: 'Liên từ',
    abbr: 'conj.',
    oneLineVi: 'Từ nối hai từ, hai cụm từ hoặc hai mệnh đề với nhau.',
    roleVi:
      'Đứng giữa hai phần nó nối, hoặc đứng đầu câu khi mệnh đề phụ đi trước. Một quan hệ chỉ cần một liên từ.',
    forms: [],
    subtypes: [
      {
        titleVi: 'Liên từ đẳng lập',
        explainVi: 'and, but, or, so, yet nối hai phần ngang hàng nhau.',
        examples: ['bread and butter', 'cheap but good'],
      },
      {
        titleVi: 'Liên từ phụ thuộc',
        explainVi: 'because, if, although, while mở đầu mệnh đề phụ. Mệnh đề đó không đứng riêng thành câu được.',
        examples: ['because it rained', 'if you agree'],
      },
      {
        titleVi: 'Liên từ tương liên',
        explainVi: 'Đi thành cặp, và hai vế phải cùng dạng ngữ pháp.',
        examples: ['both ... and', 'either ... or', 'not only ... but also'],
      },
      {
        titleVi: 'Liên từ chỉ thời gian',
        explainVi: 'when, while, before, after, until. Mệnh đề sau chúng dùng thì hiện tại để nói việc tương lai.',
        examples: ['when he arrives', 'until you call'],
      },
    ],
    mistakes: [
      {
        wrong: 'Although it was late, but we continued.',
        right: 'Although it was late, we continued.',
        whyVi: 'Một quan hệ nhượng bộ chỉ dùng một liên từ, không dùng cả although lẫn but.',
      },
      {
        wrong: 'Because he was tired. He went home.',
        right: 'Because he was tired, he went home.',
        whyVi: 'Mệnh đề mở đầu bằng liên từ phụ thuộc không đứng riêng thành một câu.',
      },
      {
        wrong: 'I will call you when I will arrive.',
        right: 'I will call you when I arrive.',
        whyVi: 'Sau liên từ chỉ thời gian dùng thì hiện tại để nói việc tương lai.',
      },
    ],
    grammarKeys: [
      'a2:cau-dieu-kien-loai-0',
      'b1:cau-dieu-kien-loai-1',
      'b1:cau-dieu-kien-loai-2',
      'b1:too-enough-so-that',
    ],
  },
  {
    key: 'interjection',
    titleVi: 'Thán từ',
    abbr: 'interj.',
    oneLineVi: 'Từ thốt ra để biểu lộ cảm xúc hoặc phản ứng tức thì.',
    roleVi:
      'Đứng tách khỏi cấu trúc câu, thường ở đầu và có dấu phẩy theo sau. Bỏ đi thì câu vẫn đúng ngữ pháp.',
    forms: [],
    subtypes: [
      {
        titleVi: 'Biểu lộ cảm xúc',
        explainVi: 'Nói ngạc nhiên, đau, tiếc hay khó chịu.',
        examples: ['wow', 'ouch', 'oops', 'ugh'],
      },
      {
        titleVi: 'Từ chào và từ đáp',
        explainVi: 'Mở đầu hoặc kết thúc một lượt nói.',
        examples: ['hi', 'hey', 'bye', 'thanks'],
      },
      {
        titleVi: 'Từ giữ lượt nói',
        explainVi: 'Lấp chỗ trống khi người nói đang nghĩ. Chỉ có trong lời nói, không viết ra.',
        examples: ['um', 'er', 'well'],
      },
      {
        titleVi: 'Từ thường chuyển thành thán từ',
        explainVi: 'Một số danh từ và cụm từ dùng như thán từ, giữ nguyên hình.',
        examples: ['goodness', 'no way', 'never mind'],
      },
    ],
    mistakes: [
      {
        wrong: 'Wow the view is beautiful.',
        right: 'Wow, the view is beautiful.',
        whyVi: 'Thán từ tách khỏi phần còn lại của câu bằng dấu phẩy.',
      },
      {
        wrong: "Aren't you tired? Yes, I'm not.",
        right: "Aren't you tired? No, I'm not.",
        whyVi: 'yes và no theo nội dung câu trả lời, không theo việc đồng ý với người hỏi như tiếng Việt.',
      },
    ],
    grammarKeys: [
      'b1:cau-hoi-duoi',
      'a1:dong-tu-to-be-phu-dinh-nghi-van',
      'a1:cau-hoi-wh-questions',
    ],
  },
]
