-- 0066_grammar_en_rewrite.sql
-- Rewrites every English grammar point and fills the levels that were short.
--
-- The 34 existing `en` rows carried a two-sentence explanation_vi and two examples each,
-- which is thinner than the detail page renders well: GrammarPointDetailView prints
-- explanation_vi with `whitespace-pre-line`, so it is built for paragraphs. All 34 rows
-- are rewritten. explanation_vi becomes two to four short paragraphs saying when the
-- structure is used and what it contrasts with, common_mistake_vi names a mistake a
-- Vietnamese speaker actually makes, and every point carries three to five examples.
--
-- 49 points are added so that each level covers the per-level list of the British
-- Council / EAQUALS Core Inventory for General English: 5 at A1, 16 at A2, 13 at B1 and
-- 15 at B2, which had no rows at all. That inventory has no open licence, so only its
-- point labels are used, as a checklist of which structures belong to which level. Every
-- Vietnamese explanation and every example sentence below is written for this project.
--
-- Counts after this migration: A1 17, A2 28, B1 23, B2 15; 83 points and 296 examples.
-- No row whose lang is not 'en' is read or written.
--
-- TO ROLL BACK: restore the `en` rows of lex.grammar_points and lex.grammar_examples
-- from a backup. This migration overwrites them in place.

insert into lex.grammar_points
  (id, lang, level_scheme, level, category_vi, title_vi, pattern, explanation_vi, common_mistake_vi, sort_order)
values

-- A1
('en:a1:dong-tu-to-be-khang-dinh', 'en', 'CEFR', 'A1', 'Động từ to be',
 'Động từ to be ở thì hiện tại đơn (Khẳng định)',
 'S + am / is / are + Danh từ / Tính từ',
 E'Động từ to be nối chủ ngữ với một danh từ hoặc một tính từ mô tả chủ ngữ đó. Tiếng Việt không cần động từ ở vị trí này: câu "Tôi mệt" chỉ có chủ ngữ và tính từ. Tiếng Anh luôn cần to be.\n\nDạng của to be phụ thuộc vào chủ ngữ. I đi với am. He, she, it và danh từ số ít đi với is. You, we, they và danh từ số nhiều đi với are.\n\nTrong văn nói và tin nhắn, to be thường rút gọn thành I''m, you''re, he''s. Dạng đầy đủ dùng khi viết trang trọng hoặc khi muốn nhấn mạnh.',
 'Bỏ hẳn động từ to be, vì tiếng Việt không cần động từ trước tính từ. Người học viết "I happy" hoặc "She a student" thay vì "I am happy" và "She is a student".',
 0),

('en:a1:dong-tu-to-be-phu-dinh-nghi-van', 'en', 'CEFR', 'A1', 'Động từ to be',
 'Động từ to be ở thì hiện tại đơn (Phủ định và Nghi vấn)',
 'S + am / is / are + not + N / Adj | Am / Is / Are + S + N / Adj?',
 E'Câu phủ định của to be thêm not ngay sau am, is hoặc are. Không dùng trợ động từ do hay does, vì bản thân to be đã giữ vai trò đó.\n\nCâu hỏi đảo to be lên trước chủ ngữ. Trật tự đổi từ "You are ready" thành "Are you ready?".\n\nDạng rút gọn của phủ định là isn''t và aren''t. Ngôi thứ nhất không có dạng rút gọn chuẩn, nên viết "I am not" hoặc "I''m not".',
 'Dùng do hoặc does chung với to be. Người học viết "I don''t am tired" hoặc "Do you are a teacher?" thay vì "I am not tired" và "Are you a teacher?".',
 1),

('en:a1:hien-tai-don-dong-tu-thuong-khang-dinh', 'en', 'CEFR', 'A1', 'Thì hiện tại đơn',
 'Thì hiện tại đơn với động từ thường (Khẳng định)',
 'S + V (nguyên thể) / V-s / V-es',
 E'Thì hiện tại đơn nói về thói quen, lịch trình cố định và những điều luôn đúng. Đây là thì mặc định khi kể việc mình làm hằng ngày.\n\nVới chủ ngữ he, she, it hoặc một danh từ số ít, động từ thêm -s hoặc -es. Các chủ ngữ còn lại giữ nguyên dạng nguyên thể.\n\nThì này khác hiện tại tiếp diễn ở chỗ nó không mô tả việc đang xảy ra lúc nói. "I work in a bank" là nghề nghiệp, còn "I am working" là việc đang làm ngay lúc này.',
 'Quên -s ở ngôi thứ ba số ít, vì động từ tiếng Việt không đổi theo chủ ngữ. Người học viết "He go to school" thay vì "He goes to school".',
 2),

('en:a1:hien-tai-don-dong-tu-thuong-phu-dinh-nghi-van', 'en', 'CEFR', 'A1', 'Thì hiện tại đơn',
 'Thì hiện tại đơn với động từ thường (Phủ định và Nghi vấn)',
 'S + do / does + not + V (nguyên thể) | Do / Does + S + V (nguyên thể)?',
 E'Phủ định và câu hỏi của động từ thường cần trợ động từ do hoặc does. Does đi với he, she, it và danh từ số ít; do đi với các chủ ngữ còn lại.\n\nKhi đã có do hoặc does, động từ chính trở về dạng nguyên thể. Dấu hiệu ngôi thứ ba chỉ nằm ở does và không lặp lại trên động từ chính.\n\nCâu trả lời ngắn dùng lại trợ động từ: "Yes, I do" hoặc "No, she doesn''t".',
 'Giữ -s trên động từ chính sau does. Người học viết "She doesn''t likes coffee" thay vì "She doesn''t like coffee".',
 3),

('en:a1:danh-tu-so-nhieu', 'en', 'CEFR', 'A1', 'Danh từ',
 'Danh từ số nhiều có quy tắc và bất quy tắc',
 'Danh từ số ít + -s / -es',
 E'Danh từ đếm được trong tiếng Anh bắt buộc đổi dạng khi số nhiều. Tiếng Việt giữ nguyên danh từ và chỉ thêm từ chỉ số lượng, nên bước này rất dễ bị bỏ quên.\n\nPhần lớn danh từ thêm -s. Danh từ tận cùng bằng -s, -x, -ch, -sh hoặc -o thêm -es. Danh từ tận cùng bằng phụ âm cộng -y đổi y thành i rồi thêm -es.\n\nMột nhóm nhỏ có dạng số nhiều bất quy tắc và phải nhớ riêng: man thành men, woman thành women, child thành children, foot thành feet, tooth thành teeth.',
 'Để danh từ ở dạng số ít sau một số đếm, vì tiếng Việt không đổi danh từ. Người học viết "three book" thay vì "three books".',
 4),

('en:a1:mao-tu-bat-dinh-a-an', 'en', 'CEFR', 'A1', 'Mạo từ',
 'Mạo từ không xác định A và An',
 'a / an + Danh từ số ít đếm được',
 E'A và an giới thiệu một vật chưa xác định: vật được nhắc tới lần đầu, hoặc vật mà không quan trọng là cái nào. Tiếng Việt không có từ tương ứng bắt buộc, nên vị trí này hay bị bỏ trống.\n\nChọn a hay an theo âm đầu của từ đi ngay sau, không theo chữ cái. An đứng trước âm nguyên âm: an apple, an hour. A đứng trước âm phụ âm: a book, a university.\n\nA và an chỉ đi với danh từ đếm được số ít. Danh từ số nhiều và danh từ không đếm được không dùng chúng.',
 'Bỏ mạo từ trước danh từ đếm được số ít. Người học viết "I am student" thay vì "I am a student".',
 5),

('en:a1:mao-tu-xac-dinh-the', 'en', 'CEFR', 'A1', 'Mạo từ',
 'Mạo từ xác định The',
 'the + Danh từ (số ít / số nhiều / không đếm được)',
 E'The dùng khi người nghe biết chính xác vật đang được nhắc tới: vật đã xuất hiện ở câu trước, vật duy nhất trong hoàn cảnh đó, hoặc vật được mô tả rõ ngay sau đó.\n\nKhác a và an, the đi được với mọi loại danh từ, kể cả số nhiều và không đếm được.\n\nKhông dùng the khi nói về một loại vật nói chung ở dạng số nhiều. "I like dogs" nói về chó nói chung, còn "I like the dogs" nói về những con chó cụ thể mà cả hai bên đều biết.',
 'Dùng the trước danh từ số nhiều mang nghĩa chung. Người học viết "The children need sleep" khi muốn nói về trẻ em nói chung, đúng ra là "Children need sleep".',
 6),

('en:a1:dai-tu-nhan-xung-va-tinh-tu-so-huu', 'en', 'CEFR', 'A1', 'Đại từ & Tính từ',
 'Đại từ nhân xưng chủ ngữ và Tính từ sở hữu',
 'Tính từ sở hữu (my / your / his / her / its / our / their) + Danh từ',
 E'Đại từ nhân xưng chủ ngữ thay cho danh từ ở đầu câu: I, you, he, she, it, we, they. Tiếng Anh không cho phép bỏ chủ ngữ, kể cả khi hoàn cảnh đã rõ.\n\nTính từ sở hữu luôn đứng trước một danh từ và không đổi theo danh từ đó. My book và my books đều dùng my.\n\nHis và her chọn theo người sở hữu, không theo vật được sở hữu. Sách của một người nam là his book, bất kể book là vật gì.',
 'Bỏ chủ ngữ vì tiếng Việt cho phép bỏ. Người học viết "Is very hot today" thay vì "It is very hot today".',
 7),

('en:a1:gioi-tu-thoi-gian-in-on-at', 'en', 'CEFR', 'A1', 'Giới từ',
 'Giới từ chỉ thời gian: In, On, At',
 'at + giờ / on + ngày / in + tháng, năm, mùa',
 E'Ba giới từ này chia theo độ rộng của mốc thời gian. At đi với giờ và các thời điểm hẹp: at 7 o''clock, at noon, at night.\n\nOn đi với ngày trong tuần và ngày tháng cụ thể: on Monday, on 2 September, on my birthday.\n\nIn đi với khoảng rộng hơn một ngày: in July, in 2026, in the morning, in summer.\n\nKhông dùng giới từ trước today, tomorrow, yesterday, next week và last week.',
 'Thêm giới từ trước những từ chỉ thời gian đã tự đủ nghĩa. Người học viết "in yesterday" hoặc "on last week" thay vì "yesterday" và "last week".',
 8),

('en:a1:gioi-tu-noi-chon-in-on-at', 'en', 'CEFR', 'A1', 'Giới từ',
 'Giới từ chỉ nơi chốn: In, On, At',
 'at + địa điểm cụ thể / on + bề mặt / in + không gian kín, khu vực lớn',
 E'At chỉ một điểm trong không gian, coi địa điểm là một vị trí chứ không phải một khối: at the bus stop, at the door, at school.\n\nOn chỉ sự tiếp xúc với một bề mặt: on the table, on the wall, on the second floor.\n\nIn chỉ vật nằm bên trong một không gian có ranh giới: in the box, in the room, in Hanoi.\n\nCùng một địa điểm có thể đi với hai giới từ khác nhau tuỳ cách nhìn. "At the office" là đang làm việc ở đó, "in the office" là đang ở bên trong căn phòng.',
 'Dịch thẳng chữ "ở" thành in trong mọi trường hợp. Người học viết "in the bus stop" thay vì "at the bus stop".',
 9),

('en:a1:cau-truc-there-is-there-are', 'en', 'CEFR', 'A1', 'Cấu trúc câu',
 'Cấu trúc chỉ sự tồn tại: There is và There are',
 'There is + N (số ít / không đếm được) | There are + N (số nhiều)',
 E'Cấu trúc này giới thiệu sự tồn tại của một vật ở đâu đó, tương ứng với chữ "có" trong tiếng Việt. There ở đây không mang nghĩa nơi chốn, nó chỉ giữ vị trí chủ ngữ.\n\nĐộng từ chia theo danh từ đứng ngay sau nó, không theo there. "There is a book" và "There are three books".\n\nKhi liệt kê nhiều vật, động từ chia theo vật đầu tiên trong danh sách: "There is a laptop and two phones on the desk".',
 'Dùng have để dịch chữ "có". Người học viết "In my room have a window" thay vì "There is a window in my room".',
 10),

('en:a1:cau-hoi-wh-questions', 'en', 'CEFR', 'A1', 'Câu hỏi',
 'Câu hỏi có từ để hỏi (Wh-questions) ở hiện tại đơn',
 'Wh- + do / does + S + V (nguyên thể)? | Wh- + am / is / are + S?',
 E'Câu hỏi bắt đầu bằng what, where, when, who, why hoặc how dùng để hỏi thông tin, không hỏi đúng sai. Từ để hỏi luôn đứng đầu câu.\n\nSau từ để hỏi là trật tự của câu hỏi yes/no: trợ động từ do hoặc does với động từ thường, hoặc am, is, are với to be.\n\nKhi chính từ để hỏi là chủ ngữ, câu không cần trợ động từ. Viết "Who lives here?", không viết "Who does live here?".',
 'Giữ trật tự câu kể sau từ để hỏi. Người học viết "Where you are from?" thay vì "Where are you from?".',
 11),

('en:a1:cau-menh-lenh', 'en', 'CEFR', 'A1', 'Cấu trúc câu',
 'Câu mệnh lệnh (Imperatives)',
 'V (nguyên mẫu) + ... | Don''t + V (nguyên mẫu) + ...',
 E'Câu mệnh lệnh dùng để yêu cầu, hướng dẫn, mời hoặc cảnh báo. Câu bắt đầu thẳng bằng động từ nguyên mẫu và không có chủ ngữ, vì người nghe luôn là you.\n\nPhủ định thêm don''t trước động từ: "Don''t touch the stove". Dạng này giữ nguyên dù người nghe là một người hay nhiều người.\n\nCâu mệnh lệnh không kèm từ nào khác nghe khá thẳng. Thêm please ở đầu hoặc cuối câu làm lời yêu cầu nhẹ hơn. Let''s cộng động từ nguyên mẫu dùng khi rủ người nghe cùng làm.',
 'Dịch chữ "đừng" thành not và đặt thẳng trước động từ, vì tiếng Việt chỉ cần thêm một từ phủ định. Người học viết "Not touch the stove" hoặc "You not go out" thay vì "Don''t touch the stove" và "Don''t go out".',
 12),

('en:a1:cau-truc-have-got', 'en', 'CEFR', 'A1', 'Cấu trúc câu',
 'Have got chỉ sự sở hữu',
 'S + have / has got + N | S + haven''t / hasn''t got + N | Have / Has + S + got + N?',
 E'Have got nghĩa là "có", dùng cho đồ vật sở hữu, quan hệ gia đình, đặc điểm ngoại hình và bệnh nhẹ. Cấu trúc này phổ biến trong tiếng Anh Anh, nhất là trong văn nói. Nghĩa của nó giống have, dù hình thức trông giống thì hiện tại hoàn thành.\n\nHas got đi với he, she, it và danh từ số ít; have got đi với các chủ ngữ còn lại. Văn nói thường rút gọn thành I''ve got và she''s got.\n\nPhủ định và câu hỏi không dùng do: thêm not sau have hoặc has, hoặc đảo have hoặc has lên trước chủ ngữ. Have đứng một mình thì ngược lại, cần do. "Have you got a pen?" và "Do you have a pen?" cùng nghĩa.\n\nHave got chỉ dùng ở hiện tại. Nói về sự sở hữu trong quá khứ thì dùng had.',
 'Ghép do với have got, vì người học đã quen dùng do cho mọi câu hỏi có động từ thường. Người học viết "Do you have got a car?" hoặc "I don''t have got time" thay vì "Have you got a car?" và "I haven''t got time".',
 13),

('en:a1:so-huu-cach-s', 'en', 'CEFR', 'A1', 'Danh từ',
 'Sở hữu cách với ''s',
 'Danh từ (người sở hữu) + ''s + Danh từ (vật được sở hữu)',
 E'Sở hữu cách ''s gắn vào người sở hữu để nói vật đó là của ai: Lan''s bike, my father''s car. Trật tự ngược với tiếng Việt: người sở hữu đứng trước, vật được sở hữu đứng sau.\n\nDanh từ số nhiều đã tận cùng bằng -s chỉ thêm dấu nháy: my parents'' house. Danh từ số nhiều bất quy tắc vẫn thêm ''s: the children''s room.\n\n''s dùng chủ yếu cho người và con vật. Với đồ vật, tiếng Anh thường dùng of hoặc ghép hai danh từ: the door of the car, the car door.',
 'Giữ trật tự của tiếng Việt và dùng of cho người, vì dịch từng chữ cụm "xe đạp của Lan". Người học viết "the bike of Lan" hoặc "the house of my parents" thay vì "Lan''s bike" và "my parents'' house".',
 14),

('en:a1:tu-chi-dinh-this-that-these-those', 'en', 'CEFR', 'A1', 'Đại từ & Tính từ',
 'Từ chỉ định: This, That, These, Those',
 'this / that + N (số ít / không đếm được) | these / those + N (số nhiều)',
 E'Bốn từ này chỉ ra vật nào đang được nói tới, theo hai tiêu chí: gần hay xa người nói, và số ít hay số nhiều. This và these chỉ vật ở gần, tương ứng với "này". That và those chỉ vật ở xa, tương ứng với "kia" hoặc "đó".\n\nThis và that đi với danh từ số ít hoặc không đếm được. These và those đi với danh từ số nhiều, và động từ theo sau cũng chia số nhiều.\n\nCả bốn từ đứng được một mình như đại từ khi vật đã rõ: "This is my brother", "Those are too expensive". Khi gọi điện thoại, người nói tự giới thiệu bằng "This is Nam", không dùng "I am Nam".',
 'Dùng this hoặc that với danh từ số nhiều, vì "này" và "kia" trong tiếng Việt không đổi theo số lượng. Người học viết "this shoes" hoặc "that books" thay vì "these shoes" và "those books".',
 15),

('en:a1:dai-tu-tan-ngu', 'en', 'CEFR', 'A1', 'Đại từ & Tính từ',
 'Đại từ tân ngữ (Object pronouns)',
 'V / giới từ + me / you / him / her / it / us / them',
 E'Đại từ tân ngữ đứng sau động từ hoặc sau giới từ, ở vị trí của người hay vật chịu tác động: me, you, him, her, it, us, them. Tiếng Việt dùng cùng một từ ở cả hai vị trí: "tôi" trong "tôi gọi" và "gọi tôi" không đổi. Tiếng Anh đổi I thành me, he thành him.\n\nYou và it giữ nguyên dạng ở cả hai vị trí. Các đại từ còn lại cần nhớ theo cặp: I và me, he và him, she và her, we và us, they và them.\n\nSau giới từ luôn là dạng tân ngữ: with me, for them, between us. Câu trả lời ngắn trong văn nói cũng dùng dạng này: hỏi "Who wants tea?" thì đáp "Me".',
 'Dùng dạng chủ ngữ sau động từ hoặc giới từ, vì đại từ tiếng Việt không đổi theo vị trí trong câu. Người học viết "Please call I" hoặc "She lives with they" thay vì "Please call me" và "She lives with them".',
 16),

-- A2
('en:a2:present-continuous-actions-now', 'en', 'CEFR', 'A2', 'Thì hiện tại tiếp diễn',
 'Hiện tại tiếp diễn diễn tả hành động đang diễn ra',
 'S + am / is / are + V-ing + ...',
 E'Thì hiện tại tiếp diễn mô tả việc đang xảy ra ngay lúc nói, hoặc đang diễn ra trong giai đoạn này dù lúc nói không làm.\n\nCấu trúc gồm hai phần và thiếu phần nào câu cũng sai: to be chia theo chủ ngữ, cộng động từ chính thêm -ing.\n\nThì này đối lập với hiện tại đơn. "She works at a hospital" là nghề nghiệp lâu dài, "She is working in Da Nang this month" là việc tạm thời.\n\nMột số động từ chỉ trạng thái không dùng ở tiếp diễn: know, like, want, need, believe, belong.',
 'Chia to be sai hoặc bỏ to be, chỉ để lại động từ thêm -ing. Người học viết "I going to school now" thay vì "I am going to school now".',
 0),

('en:a2:present-continuous-future-plans', 'en', 'CEFR', 'A2', 'Thì hiện tại tiếp diễn',
 'Hiện tại tiếp diễn diễn tả kế hoạch tương lai',
 'S + am / is / are + V-ing + trạng từ chỉ thời gian tương lai',
 E'Hiện tại tiếp diễn còn dùng cho kế hoạch đã sắp xếp xong: đã đặt vé, đã hẹn giờ, đã báo người khác. Trạng từ chỉ thời gian tương lai trong câu cho biết đây không phải việc đang xảy ra.\n\nCách nói này khác will ở mức độ chắc chắn. Will là quyết định ngay lúc nói, còn hiện tại tiếp diễn là việc đã thu xếp trước.\n\nNó cũng khác be going to ở chỗ be going to chỉ cần ý định, còn hiện tại tiếp diễn ngụ ý đã có hẹn cụ thể.',
 'Dùng thì này cho dự đoán thay vì cho lịch hẹn. Người học viết "It is raining tomorrow" để dự đoán thời tiết, đúng ra là "It is going to rain tomorrow".',
 1),

('en:a2:past-simple-to-be', 'en', 'CEFR', 'A2', 'Thì quá khứ đơn',
 'Động từ to be ở quá khứ: Was / Were',
 'Khẳng định: S + was / were + ... | Phủ định: S + was not (wasn''t) / were not (weren''t) + ...',
 E'Was và were mô tả trạng thái, vị trí hoặc thông tin của người và vật tại một thời điểm đã kết thúc trong quá khứ.\n\nI, he, she, it và danh từ số ít đi với was. You, we, they và danh từ số nhiều đi với were.\n\nPhủ định thêm not ngay sau was hoặc were, câu hỏi đảo was hoặc were lên trước chủ ngữ. Không dùng did với to be.',
 'Dùng did trong câu hỏi và câu phủ định của to be. Người học viết "Did you were tired?" thay vì "Were you tired?".',
 2),

('en:a2:past-simple-regular-verbs', 'en', 'CEFR', 'A2', 'Thì quá khứ đơn',
 'Động từ có quy tắc thì quá khứ đơn',
 'S + V-ed + ...',
 E'Quá khứ đơn kể lại việc đã xảy ra và đã kết thúc, thường đi kèm một mốc thời gian như yesterday, last week hoặc in 2020.\n\nĐộng từ có quy tắc thêm -ed. Động từ tận cùng bằng -e chỉ thêm -d. Động từ tận cùng bằng phụ âm cộng -y đổi y thành i rồi thêm -ed. Động từ một âm tiết tận cùng bằng nguyên âm cộng một phụ âm thì gấp đôi phụ âm đó: stop thành stopped.\n\nDạng quá khứ giống nhau cho mọi chủ ngữ, không có biến đổi theo ngôi như hiện tại đơn.',
 'Để động từ ở dạng nguyên thể và chỉ dựa vào trạng từ thời gian, như tiếng Việt dùng "đã". Người học viết "I watch a film yesterday" thay vì "I watched a film yesterday".',
 3),

('en:a2:past-simple-irregular-verbs', 'en', 'CEFR', 'A2', 'Thì quá khứ đơn',
 'Động từ bất quy tắc thì quá khứ đơn',
 'S + V2 (quá khứ) + ...',
 E'Nhiều động từ thông dụng nhất tiếng Anh không thêm -ed mà đổi hẳn dạng: go thành went, see thành saw, buy thành bought, take thành took.\n\nKhông có quy tắc suy ra được dạng này, nên bảng động từ bất quy tắc phải học thuộc. Bù lại, số động từ cần nhớ không lớn và chúng xuất hiện liên tục.\n\nDạng bất quy tắc chỉ dùng ở câu khẳng định. Khi câu có did, động từ trở lại nguyên thể: "Did you go?", không phải "Did you went?".',
 'Thêm -ed vào động từ bất quy tắc theo thói quen. Người học viết "He buyed a new phone" thay vì "He bought a new phone".',
 4),

('en:a2:past-simple-negative-questions', 'en', 'CEFR', 'A2', 'Thì quá khứ đơn',
 'Thể phủ định và nghi vấn với trợ động từ did',
 'Phủ định: S + did not (didn''t) + V (nguyên mẫu) | Nghi vấn: Did + S + V (nguyên mẫu)?',
 E'Phủ định và câu hỏi ở quá khứ đơn dùng trợ động từ did cho mọi chủ ngữ.\n\nDid đã mang dấu hiệu quá khứ, nên động từ chính trở về dạng nguyên thể. Câu chỉ được đánh dấu quá khứ một lần.\n\nCâu trả lời ngắn dùng lại did: "Yes, I did" hoặc "No, they didn''t".',
 'Chia quá khứ hai lần, giữ động từ ở dạng quá khứ sau did. Người học viết "I didn''t went" thay vì "I didn''t go".',
 5),

('en:a2:used-to', 'en', 'CEFR', 'A2', 'Thì quá khứ đơn',
 'Used to: thói quen và trạng thái đã chấm dứt',
 'S + used to + V (nguyên mẫu) | S + didn''t use to + V (nguyên mẫu)',
 E'Used to nói về thói quen hoặc trạng thái kéo dài trong quá khứ nhưng nay không còn. Bản thân cấu trúc đã hàm ý "bây giờ thì khác", nên không cần nói thêm điều đó.\n\nNó khác quá khứ đơn ở chỗ quá khứ đơn kể một lần xảy ra, còn used to kể một giai đoạn. "I went to Hue last year" là một chuyến đi, "I used to go to Hue every summer" là một thói quen cũ.\n\nTrong câu phủ định và câu hỏi có did, dạng đúng là use to, không còn -d: "I didn''t use to like coffee", "Did you use to live here?".',
 'Nhầm used to với be used to. "I used to drive" là trước đây hay lái xe, còn "I am used to driving" là đã quen với việc lái xe. Người học dùng lẫn hai cấu trúc này.',
 6),

('en:a2:qua-khu-tiep-dien', 'en', 'CEFR', 'A2', 'Thì quá khứ tiếp diễn',
 'Thì quá khứ tiếp diễn và mốc cắt ngang',
 'S + was / were + V-ing | While + S + was / were + V-ing, S + V2',
 E'Quá khứ tiếp diễn mô tả việc đang diễn ra tại một thời điểm trong quá khứ. Nó thường làm nền cho một việc khác xen vào.\n\nViệc làm nền chia ở quá khứ tiếp diễn, việc xen vào chia ở quá khứ đơn. "I was cooking when the lights went out": nấu ăn là nền, mất điện là việc cắt ngang.\n\nWhile thường đi với quá khứ tiếp diễn, when thường đi với quá khứ đơn. Hai mệnh đề cùng ở quá khứ tiếp diễn thì diễn tả hai việc xảy ra song song.',
 'Dùng quá khứ tiếp diễn cho cả hai vế, làm mất mốc cắt ngang. Người học viết "I was cooking when the lights were going out" thay vì "when the lights went out".',
 7),

('en:a2:tuong-lai-will-va-be-going-to', 'en', 'CEFR', 'A2', 'Thì tương lai',
 'Tương lai với Will và Be going to',
 'S + will + V (nguyên mẫu) | S + am / is / are + going to + V (nguyên mẫu)',
 E'Will dùng cho quyết định đưa ra ngay lúc nói, cho lời hứa và cho dự đoán dựa trên cảm nhận cá nhân.\n\nBe going to dùng cho ý định đã có từ trước, và cho dự đoán dựa trên bằng chứng nhìn thấy được. Trời đầy mây thì nói "It is going to rain" vì có bằng chứng trước mắt.\n\nCả hai đều nói về tương lai nên nhiều câu chấp nhận cả hai. Khác biệt nằm ở chỗ quyết định có từ trước hay vừa mới nảy ra.\n\nSau will và sau going to, động từ luôn ở dạng nguyên mẫu không chia.',
 'Dùng will cho kế hoạch đã định sẵn. Được hỏi về kỳ nghỉ đã đặt vé, người học trả lời "I will go to Da Lat" thay vì "I am going to Da Lat".',
 8),

('en:a2:wh-questions-qua-khu', 'en', 'CEFR', 'A2', 'Câu hỏi',
 'Câu hỏi có từ để hỏi ở thì quá khứ',
 'Wh- + did + S + V (nguyên mẫu)? | Wh- + was / were + S?',
 E'Câu hỏi thông tin ở quá khứ giữ nguyên trật tự của hiện tại, chỉ đổi trợ động từ thành did.\n\nSau did, động từ chính ở dạng nguyên mẫu. Với to be thì không có did, mà đảo was hoặc were lên trước chủ ngữ.\n\nKhi từ để hỏi là chủ ngữ của câu, không dùng did và động từ giữ dạng quá khứ: "Who called you?", không phải "Who did called you?".',
 'Giữ động từ ở dạng quá khứ sau did. Người học viết "What did you bought?" thay vì "What did you buy?".',
 9),

('en:a2:dong-tu-theo-sau-v-ing-hoac-to-v', 'en', 'CEFR', 'A2', 'Động từ nguyên mẫu và V-ing',
 'Động từ theo sau bởi V-ing hoặc to V',
 'S + V1 + V-ing | S + V1 + to + V (nguyên mẫu)',
 E'Khi hai động từ đi liền nhau, động từ thứ hai phải đổi dạng. Dạng nào là do động từ thứ nhất quyết định, không do nghĩa của câu.\n\nNhóm đi với V-ing gồm enjoy, finish, avoid, mind, practise, suggest. Nhóm đi với to V gồm want, need, decide, hope, promise, learn.\n\nMột số động từ nhận cả hai mà nghĩa gần như không đổi: like, love, hate, start, begin, continue.\n\nSau would like thì luôn là to V: "I would like to book a table".',
 'Để động từ thứ hai ở dạng nguyên thể trần, vì tiếng Việt ghép hai động từ mà không đổi dạng. Người học viết "I enjoy read books" thay vì "I enjoy reading books".',
 10),

('en:a2:to-v-chi-muc-dich', 'en', 'CEFR', 'A2', 'Động từ nguyên mẫu và V-ing',
 'To V diễn tả mục đích',
 'S + V + to + V (nguyên mẫu) + ... | in order to / so as to + V (nguyên mẫu)',
 E'Để trả lời câu hỏi "làm việc đó để làm gì", tiếng Anh dùng to cộng động từ nguyên mẫu. Đây là cách diễn đạt mục đích thông dụng nhất và ngắn nhất.\n\nIn order to và so as to mang nghĩa giống hệt nhưng trang trọng hơn, thường gặp trong văn viết.\n\nKhông dùng for cộng động từ để chỉ mục đích. For chỉ đi với danh từ: "I came here for the training", nhưng "I came here to learn English".',
 'Dùng for trước động từ để dịch chữ "để". Người học viết "I go to school for learn English" thay vì "I go to school to learn English".',
 11),

('en:a2:cau-dieu-kien-loai-0', 'en', 'CEFR', 'A2', 'Câu điều kiện',
 'Câu điều kiện loại 0',
 'If + S + V (hiện tại đơn), S + V (hiện tại đơn)',
 E'Câu điều kiện loại 0 nói về những việc luôn đúng: quy luật tự nhiên, phản ứng máy móc, quy định cố định. Kết quả không phụ thuộc vào thời điểm.\n\nCả hai mệnh đề đều ở hiện tại đơn. Ở loại này, if thay được bằng when mà nghĩa gần như không đổi, vì điều kiện chắc chắn lặp lại.\n\nĐiểm khác loại 1 nằm ở đó: loại 1 nói về một lần cụ thể trong tương lai và có will, loại 0 nói về việc lặp lại và không có will.\n\nMệnh đề if đứng trước thì có dấu phẩy, đứng sau thì không.',
 'Thêm will vào mệnh đề kết quả, do nhầm với câu điều kiện loại 1. Người học viết "If you heat ice, it will melt" khi đang nói về một quy luật, đúng ra là "it melts".',
 12),

('en:a2:modal-verbs-can-could', 'en', 'CEFR', 'A2', 'Động từ khuyết thiếu',
 'Động từ khuyết thiếu: Can và Could',
 'Khả năng: S + can / could + V (nguyên mẫu) | Đề nghị: Can / Could + you + V (nguyên mẫu)...?',
 E'Can nói về khả năng ở hiện tại, could nói về khả năng trong quá khứ. "I can swim" là biết bơi bây giờ, "I could swim when I was six" là biết bơi hồi sáu tuổi.\n\nCả hai còn dùng để xin phép và nhờ vả. Could lịch sự hơn can, nên dùng với người lạ hoặc trong hoàn cảnh trang trọng.\n\nSau can và could, động từ luôn ở dạng nguyên mẫu không to và không chia theo chủ ngữ. Phủ định là cannot, viết liền, rút gọn thành can''t.',
 'Thêm to sau can hoặc chia động từ theo chủ ngữ. Người học viết "She can to swim" hoặc "He cans help" thay vì "She can swim" và "He can help".',
 13),

('en:a2:modal-verbs-may-might', 'en', 'CEFR', 'A2', 'Động từ khuyết thiếu',
 'Động từ khuyết thiếu: May và Might',
 'S + may / might + V (nguyên mẫu) | S + may not / might not + V (nguyên mẫu)',
 E'May và might nói về khả năng xảy ra mà người nói không chắc. Mức độ chắc chắn của chúng thấp hơn will và thấp hơn must.\n\nTrong nghĩa phỏng đoán, hai từ gần như thay thế được cho nhau. Might nghiêng về ít chắc chắn hơn một chút.\n\nMay còn dùng để xin phép trong hoàn cảnh trang trọng: "May I come in?". Might hiếm khi dùng theo nghĩa này.\n\nCác trạng từ perhaps, maybe, possibly và probably diễn đạt cùng ý nhưng đứng ở vị trí khác trong câu, thường ở đầu câu hoặc trước động từ chính.',
 'Viết maybe liền và may be tách rời lẫn lộn nhau. "Maybe he is busy" dùng trạng từ, còn "He may be busy" dùng động từ khuyết thiếu cộng be.',
 14),

('en:a2:modal-verbs-should-advice', 'en', 'CEFR', 'A2', 'Động từ khuyết thiếu',
 'Động từ khuyết thiếu: Should và Shouldn''t',
 'S + should / shouldn''t + V (nguyên mẫu) + ...',
 E'Should đưa ra lời khuyên hoặc nêu điều nên làm theo ý người nói. Nó nhẹ hơn must, vì không có sự bắt buộc nào đứng sau.\n\nShouldn''t nêu điều không nên làm. Nó không mang nghĩa cấm, chỉ là khuyến cáo.\n\nCâu hỏi với should dùng để xin lời khuyên: "What should I do?".\n\nSau should, động từ ở dạng nguyên mẫu. Should không đổi dạng theo chủ ngữ.',
 'Thêm to sau should do quen với cấu trúc "nên làm gì đó". Người học viết "You should to rest" thay vì "You should rest".',
 15),

('en:a2:modal-verbs-must-have-to', 'en', 'CEFR', 'A2', 'Động từ khuyết thiếu',
 'Động từ khuyết thiếu: Must và Have to',
 'S + must / have to + V (nguyên mẫu) + ...',
 E'Must và have to đều diễn tả sự bắt buộc, nhưng nguồn của sự bắt buộc khác nhau. Must là do chính người nói thấy cần, have to là do quy định hoặc hoàn cảnh bên ngoài.\n\nPhủ định của hai từ này khác hẳn nhau. Mustn''t là cấm, không được làm. Don''t have to là không bắt buộc, làm hay không đều được.\n\nMust không có dạng quá khứ. Khi nói về quá khứ, dùng had to.',
 'Coi mustn''t và don''t have to là một. Người học viết "You mustn''t come if you are busy" khi ý là không bắt buộc, đúng ra là "You don''t have to come".',
 16),

('en:a2:cum-dong-tu-thong-dung', 'en', 'CEFR', 'A2', 'Cụm động từ',
 'Cụm động từ thông dụng (Phrasal Verbs)',
 'V + tiểu từ (up / on / off / out / in ...)',
 E'Cụm động từ là một động từ cộng một tiểu từ, và cả cụm mang nghĩa riêng không suy ra được từ từng phần. Look nghĩa là nhìn, nhưng look after nghĩa là chăm sóc.\n\nVì nghĩa không suy ra được, cụm động từ phải học như một từ vựng chứ không phải như một quy tắc ngữ pháp.\n\nCụm động từ rất thông dụng trong văn nói. Văn viết trang trọng thường chọn một động từ đơn tương đương: find out và discover, put off và postpone.',
 'Dịch từng phần của cụm rồi ghép lại. Người học hiểu "turn down the offer" là xoay cái gì đó xuống, trong khi nghĩa là từ chối lời đề nghị.',
 17),

('en:a2:danh-tu-dem-duoc-va-khong-dem-duoc', 'en', 'CEFR', 'A2', 'Danh từ',
 'Danh từ đếm được và không đếm được',
 'some / any + N | How much + N (không đếm được)? | How many + N (số nhiều)?',
 E'Danh từ đếm được có dạng số nhiều và đi được với số đếm. Danh từ không đếm được không có dạng số nhiều và không đi với số đếm: water, rice, money, information, advice.\n\nSome dùng trong câu khẳng định và trong lời mời. Any dùng trong câu phủ định và câu hỏi.\n\nHow much hỏi về danh từ không đếm được, how many hỏi về danh từ số nhiều. A lot of đi được với cả hai.\n\nĐể đếm danh từ không đếm được, thêm một đơn vị: a glass of water, two kilos of rice, a piece of advice.',
 'Thêm -s vào danh từ không đếm được, vì tiếng Việt đếm được những từ này. Người học viết "many informations" hoặc "three advices" thay vì "a lot of information" và "three pieces of advice".',
 18),

('en:a2:luong-tu-a-few-a-little-enough', 'en', 'CEFR', 'A2', 'Lượng từ',
 'Lượng từ: A few, A little, Enough, All, None',
 'a few + N (số nhiều) | a little + N (không đếm được) | enough + N',
 E'A few đi với danh từ đếm được số nhiều, a little đi với danh từ không đếm được. Cả hai mang nghĩa tích cực: có một ít, đủ dùng.\n\nBỏ mạo từ a thì nghĩa đảo sang tiêu cực. "I have a few friends here" là có vài người bạn, "I have few friends here" là gần như không có ai.\n\nEnough đứng trước danh từ nhưng đứng sau tính từ: "enough time" và "big enough".\n\nAll đi với toàn bộ, none đi với không một chút nào. Sau none of, động từ thường chia số ít trong văn viết trang trọng.',
 'Dùng a little với danh từ đếm được. Người học viết "a little books" thay vì "a few books".',
 19),

('en:a2:tinh-tu-duoi-ed-va-ing', 'en', 'CEFR', 'A2', 'Tính từ',
 'Tính từ đuôi -ed và đuôi -ing',
 'S + be + Adj-ed (cảm xúc của người) | S + be + Adj-ing (tính chất của vật)',
 E'Tính từ đuôi -ed mô tả cảm giác của người: interested, bored, tired, excited. Tính từ đuôi -ing mô tả tính chất của vật hoặc việc gây ra cảm giác đó: interesting, boring, tiring, exciting.\n\nHai dạng cùng gốc nhưng không thay nhau được. "I am bored" là tôi thấy chán, "I am boring" là tôi là người nhạt nhẽo.\n\nCách kiểm tra nhanh: nếu chủ ngữ là người đang cảm thấy điều gì đó thì dùng -ed; nếu chủ ngữ là nguyên nhân thì dùng -ing.',
 'Dùng dạng -ing cho cảm xúc của bản thân, vì tiếng Việt chỉ có một từ cho cả hai nghĩa. Người học viết "I am very interesting in music" thay vì "I am very interested in music".',
 20),

('en:a2:comparative-short-adjectives', 'en', 'CEFR', 'A2', 'So sánh',
 'So sánh hơn với tính từ ngắn',
 'S1 + be + Tính từ ngắn-er + than + S2',
 E'Tính từ một âm tiết, và tính từ hai âm tiết tận cùng bằng -y, dùng đuôi -er để so sánh hơn.\n\nQuy tắc chính tả: tận cùng bằng -e chỉ thêm -r; tận cùng bằng phụ âm cộng -y đổi y thành i rồi thêm -er; một âm tiết tận cùng bằng nguyên âm cộng một phụ âm thì gấp đôi phụ âm, như big thành bigger.\n\nMột số tính từ có dạng so sánh bất quy tắc: good thành better, bad thành worse, far thành further.\n\nThan đứng trước vế được đem ra so sánh và không bỏ được khi đã nêu cả hai vế.',
 'Ghép more với tính từ đã có đuôi -er. Người học viết "more cheaper" thay vì "cheaper".',
 21),

('en:a2:comparative-long-adjectives', 'en', 'CEFR', 'A2', 'So sánh',
 'So sánh hơn với tính từ dài',
 'S1 + be + more + Tính từ dài + than + S2',
 E'Tính từ từ hai âm tiết trở lên, trừ nhóm tận cùng bằng -y, dùng more thay cho đuôi -er.\n\nTính từ giữ nguyên dạng sau more, không thêm bất kỳ đuôi nào.\n\nĐể nói ít hơn, dùng less cộng tính từ: "This test is less difficult than the last one".\n\nKhi hai vế ngang nhau, dùng as cộng tính từ cộng as, và tính từ cũng giữ nguyên dạng.',
 'Thêm -er vào tính từ dài. Người học viết "expensiver" hoặc "beautifuler" thay vì "more expensive" và "more beautiful".',
 22),

('en:a2:superlative-adjectives', 'en', 'CEFR', 'A2', 'So sánh',
 'So sánh nhất với tính từ',
 'Tính từ ngắn: the + Tính từ-est | Tính từ dài: the most + Tính từ',
 E'So sánh nhất dùng khi đem một vật so với cả nhóm. Tính từ ngắn thêm -est, tính từ dài thêm most ở trước.\n\nThe gần như luôn đứng trước dạng so sánh nhất, vì chỉ có một vật đạt mức đó nên người nghe xác định được ngay.\n\nPhạm vi so sánh nêu bằng in với một nơi hoặc một nhóm, và bằng of với một tập hợp: "the tallest building in the city", "the best of the three".\n\nCác dạng bất quy tắc: good thành the best, bad thành the worst, far thành the furthest.',
 'Bỏ the trước dạng so sánh nhất. Người học viết "She is best student in class" thay vì "She is the best student in the class".',
 23),

('en:a2:trang-tu-chi-cach-thuc', 'en', 'CEFR', 'A2', 'Trạng từ',
 'Trạng từ chỉ cách thức',
 'S + V + Adv (Adj + -ly)',
 E'Trạng từ chỉ cách thức trả lời câu hỏi việc đó được làm như thế nào. Phần lớn được tạo bằng cách thêm -ly vào tính từ: quick thành quickly, careful thành carefully.\n\nTính từ mô tả danh từ, trạng từ mô tả động từ. "He is a careful driver" và "He drives carefully" cùng một ý nhưng khác từ loại.\n\nMột số từ giữ nguyên dạng ở cả hai vai: fast, hard, late, early. Good là tính từ, trạng từ tương ứng là well.\n\nTrạng từ chỉ cách thức thường đứng sau động từ, hoặc sau tân ngữ nếu động từ có tân ngữ.',
 'Dùng tính từ ở vị trí trạng từ, vì tiếng Việt không đổi dạng từ. Người học viết "She speaks English very good" thay vì "She speaks English very well".',
 24),

('en:a2:trang-tu-tan-suat-va-vi-tri', 'en', 'CEFR', 'A2', 'Trạng từ',
 'Trạng từ tần suất và vị trí trong câu',
 'S + Adv + V | S + be + Adv',
 E'Trạng từ tần suất cho biết việc xảy ra thường xuyên đến mức nào: always, usually, often, sometimes, rarely, never.\n\nVị trí của chúng cố định. Với động từ thường, trạng từ đứng trước động từ. Với to be, trạng từ đứng sau. Khi có trợ động từ, trạng từ đứng giữa trợ động từ và động từ chính.\n\nNever đã mang nghĩa phủ định nên không đi cùng not trong cùng một mệnh đề.\n\nCác cụm chỉ tần suất dài hơn như every day, twice a week thường đứng cuối câu.',
 'Đặt trạng từ tần suất cuối câu theo trật tự tiếng Việt. Người học viết "I go to the gym always" thay vì "I always go to the gym".',
 25),

('en:a2:tu-nhan-manh-muc-do', 'en', 'CEFR', 'A2', 'Trạng từ',
 'Từ nhấn mạnh mức độ: Very, Really, Quite, So, A bit',
 'very / really / quite / so / a bit + Adj',
 E'Những từ này đứng trước tính từ để chỉnh mức độ. Very và really tăng mức độ mạnh, quite ở mức vừa, a bit hạ mức độ xuống.\n\nSo mạnh hơn very và mang sắc thái cảm thán: "It is so hot today".\n\nA bit thường đi với tính từ mang nghĩa tiêu cực. "A bit tired" là bình thường, còn "a bit beautiful" thì không tự nhiên.\n\nVery không đi với tính từ đã ở mức tuyệt đối như perfect, freezing, exhausted. Với nhóm này, dùng absolutely.',
 'Dùng very với tính từ đã ở mức tuyệt đối. Người học viết "very excellent" thay vì "absolutely excellent".',
 26),

('en:a2:gioi-tu-chi-chuyen-dong', 'en', 'CEFR', 'A2', 'Giới từ',
 'Giới từ chỉ chuyển động',
 'V (chuyển động) + to / into / onto / through / across / along + N',
 E'Giới từ chỉ chuyển động mô tả hướng đi, khác với giới từ chỉ nơi chốn vốn mô tả vị trí đứng yên.\n\nTo chỉ đích đến. Into chỉ đi vào bên trong, onto chỉ lên trên một bề mặt. Through là xuyên qua bên trong một không gian, across là băng ngang một bề mặt.\n\nĐộng từ arrive không đi với to. Dùng arrive in với thành phố và quốc gia, arrive at với một địa điểm cụ thể.\n\nHome không cần giới từ sau động từ chuyển động: "go home", không phải "go to home".',
 'Thêm to sau arrive hoặc trước home. Người học viết "I arrived to Hanoi" hoặc "I went to home" thay vì "I arrived in Hanoi" và "I went home".',
 27),

-- B1
('en:b1:hien-tai-hoan-thanh-trai-nghiem', 'en', 'CEFR', 'B1', 'Hiện tại hoàn thành',
 'Thì hiện tại hoàn thành diễn tả trải nghiệm',
 'S + have / has + V3/V-ed (+ ever / never)',
 E'Thì này nói về những việc đã từng hoặc chưa từng làm tính đến bây giờ. Điều quan trọng là bản thân trải nghiệm, không phải thời điểm nó xảy ra.\n\nVì vậy câu không đi kèm mốc thời gian cụ thể. Khi nêu mốc thời gian, phải chuyển sang quá khứ đơn.\n\nEver dùng trong câu hỏi, never dùng trong câu khẳng định mang nghĩa phủ định. Never đã phủ định nên không đi cùng not.\n\nHas dùng với he, she, it và danh từ số ít; have dùng với các chủ ngữ còn lại.',
 'Dùng ever như một trạng từ khẳng định, do dịch chữ "từng". Người học viết "I ever go to Da Lat" thay vì "I have been to Da Lat".',
 0),

('en:b1:hien-tai-hoan-thanh-since-for', 'en', 'CEFR', 'B1', 'Hiện tại hoàn thành',
 'Thì hiện tại hoàn thành với Since và For',
 'S + have / has + V3/V-ed + since + mốc thời gian / for + khoảng thời gian',
 E'Cách dùng này nói về việc bắt đầu trong quá khứ và còn kéo dài đến hiện tại. Đây là điểm khác quan trọng nhất so với quá khứ đơn, vốn chỉ nói về việc đã khép lại.\n\nSince đi với điểm bắt đầu: since 2020, since last Monday, since I moved here. For đi với độ dài khoảng thời gian: for three years, for two weeks.\n\nCâu hỏi tương ứng là "How long have you ...?".\n\nMột số động từ chỉ trạng thái như know, have, live thường dùng ở thì này thay vì ở hiện tại tiếp diễn hoàn thành.',
 'Dùng hiện tại đơn cho việc kéo dài từ quá khứ tới nay, theo cách nói tiếng Việt. Người học viết "I live here for five years" thay vì "I have lived here for five years".',
 1),

('en:b1:hien-tai-hoan-thanh-already-yet-just', 'en', 'CEFR', 'B1', 'Hiện tại hoàn thành',
 'Thì hiện tại hoàn thành với Already, Yet và Just',
 'S + have / has + (just / already) + V3/V-ed ... | S + have / has + not + V3/V-ed ... + yet',
 E'Nhóm trạng từ này gắn việc vừa hoàn tất với thời điểm hiện tại.\n\nJust là vừa mới xong, already là đã xong sớm hơn dự kiến. Cả hai đứng giữa have và động từ phân từ.\n\nYet dùng trong câu phủ định và câu hỏi, mang nghĩa việc được chờ đợi nhưng chưa xảy ra. Yet luôn đứng cuối câu.\n\nStill trong câu phủ định đứng trước have và nhấn mạnh sự kéo dài: "She still hasn''t replied".',
 'Đặt yet giữa câu như already. Người học viết "I haven''t yet finished my report" trong văn nói thường ngày, tự nhiên hơn là "I haven''t finished my report yet".',
 2),

('en:b1:hien-tai-hoan-thanh-vs-qua-khu-don', 'en', 'CEFR', 'B1', 'Hiện tại hoàn thành',
 'Phân biệt hiện tại hoàn thành và quá khứ đơn',
 'S + have / has + V3/V-ed (không có mốc thời gian) | S + V2/V-ed + mốc thời gian đã qua',
 E'Hai thì này cùng nói về việc đã xảy ra. Khác biệt nằm ở chỗ người nói có gắn việc đó với hiện tại hay không.\n\nQuá khứ đơn đặt việc vào một thời điểm đã khép lại, nên đi cùng yesterday, last year, in 2019, ago. Hiện tại hoàn thành để ngỏ thời điểm và nhấn vào kết quả còn thấy được bây giờ.\n\n"I lost my keys" chỉ kể lại một việc. "I have lost my keys" hàm ý bây giờ vẫn chưa tìm thấy.\n\nCâu hỏi "When ...?" luôn đi với quá khứ đơn, vì nó hỏi đúng cái mốc thời gian mà hiện tại hoàn thành cố tình bỏ trống.',
 'Ghép hiện tại hoàn thành với một mốc thời gian đã qua. Người học viết "I have met him last week" thay vì "I met him last week".',
 3),

('en:b1:qua-khu-hoan-thanh', 'en', 'CEFR', 'B1', 'Quá khứ hoàn thành',
 'Thì quá khứ hoàn thành',
 'S + had + V3/V-ed (+ before / after / when + S + V2)',
 E'Quá khứ hoàn thành đánh dấu việc xảy ra trước một việc khác trong quá khứ. Nó luôn cần một mốc quá khứ thứ hai để so, dù mốc đó chỉ được ngầm hiểu.\n\nViệc xảy ra trước dùng had cộng phân từ hai, việc xảy ra sau dùng quá khứ đơn. Had giữ nguyên với mọi chủ ngữ.\n\nKhi hai việc nối bằng before hoặc after, trật tự thời gian đã rõ nên nhiều người dùng quá khứ đơn cho cả hai. Quá khứ hoàn thành cần thiết nhất khi câu không có từ nối chỉ thứ tự.\n\nThì này cũng xuất hiện trong câu điều kiện loại 3 và trong câu tường thuật khi lùi thì từ quá khứ đơn.',
 'Dùng quá khứ hoàn thành cho mọi việc trong quá khứ, chỉ vì nó xảy ra đã lâu. Người học viết "I had gone to Hue in 2015" khi không có việc nào khác để so.',
 4),

('en:b1:would-thoi-quen-qua-khu', 'en', 'CEFR', 'B1', 'Thì quá khứ',
 'Would diễn tả thói quen trong quá khứ',
 'S + would + V (nguyên mẫu) (thói quen lặp lại trong quá khứ)',
 E'Would kể lại những việc lặp đi lặp lại trong quá khứ, thường trong một đoạn hồi tưởng. Nó mang sắc thái kể chuyện nhiều hơn used to.\n\nKhác biệt quan trọng: would chỉ dùng được với hành động, không dùng với trạng thái. Nói "My grandfather would walk to the market" thì được, nhưng "He would have a car" thì sai; trường hợp đó phải dùng used to.\n\nVì would còn nhiều nghĩa khác, câu thường mở đầu bằng một mốc quá khứ rõ ràng để người đọc hiểu đúng nghĩa thói quen.',
 'Dùng would với động từ chỉ trạng thái. Người học viết "We would live in Hue" thay vì "We used to live in Hue".',
 5),

('en:b1:tuong-lai-tiep-dien', 'en', 'CEFR', 'B1', 'Thì tương lai',
 'Thì tương lai tiếp diễn',
 'S + will be + V-ing (+ mốc thời gian tương lai)',
 E'Tương lai tiếp diễn mô tả việc sẽ đang diễn ra tại một thời điểm trong tương lai. Câu thường kèm một mốc cụ thể như "at 9 tomorrow" hoặc "this time next week".\n\nNó khác will thường ở chỗ will thường chỉ nói việc sẽ xảy ra, còn tương lai tiếp diễn đặt việc đó vào giữa dòng thời gian.\n\nDạng câu hỏi với thì này nghe lịch sự hơn, vì nó hỏi về lịch trình chứ không nhờ vả: "Will you be using the meeting room?".',
 'Chia động từ sau be ở dạng nguyên mẫu. Người học viết "I will be work at 9" thay vì "I will be working at 9".',
 6),

('en:b1:cau-dieu-kien-loai-1', 'en', 'CEFR', 'B1', 'Câu điều kiện',
 'Câu điều kiện loại 1',
 'If + S + V (hiện tại đơn), S + will / can + V (nguyên mẫu)',
 E'Câu điều kiện loại 1 nói về một tình huống có thật trong tương lai và kết quả kéo theo của nó. Người nói coi điều kiện là hoàn toàn có thể xảy ra.\n\nMệnh đề if luôn ở hiện tại đơn dù nói về tương lai. Will chỉ nằm ở mệnh đề kết quả.\n\nCan, may và must thay được will ở mệnh đề kết quả để đổi sắc thái. Dùng thể mệnh lệnh cũng được: "If you finish early, call me".\n\nUnless thay được cho if not: "Unless it rains, we will go".',
 'Đưa will vào mệnh đề if, do tiếng Việt vẫn nói "sẽ" ở cả hai vế. Người học viết "If it will rain, we will stay home" thay vì "If it rains, we will stay home".',
 7),

('en:b1:cau-dieu-kien-loai-2', 'en', 'CEFR', 'B1', 'Câu điều kiện',
 'Câu điều kiện loại 2',
 'If + S + V2/V-ed (to be dùng were), S + would / could + V (nguyên mẫu)',
 E'Câu điều kiện loại 2 nói về tình huống không có thật ở hiện tại, hoặc rất khó xảy ra trong tương lai.\n\nMệnh đề if chia ở quá khứ đơn, nhưng đây là dấu hiệu của sự không có thật chứ không phải dấu hiệu thời gian. Cả câu vẫn nói về hiện tại.\n\nVới to be, dạng chuẩn là were cho mọi chủ ngữ, kể cả I, he và she. Cấu trúc "If I were you" dùng để khuyên.\n\nMệnh đề kết quả dùng would hoặc could, sau đó là động từ nguyên mẫu.',
 'Dùng was thay cho were trong lời khuyên, và dùng will thay cho would ở vế kết quả. Người học viết "If I was you, I will tell her" thay vì "If I were you, I would tell her".',
 8),

('en:b1:cau-dieu-kien-loai-3', 'en', 'CEFR', 'B1', 'Câu điều kiện',
 'Câu điều kiện loại 3',
 'If + S + had + V3/V-ed, S + would / could have + V3/V-ed',
 E'Câu điều kiện loại 3 nói về một việc đã không xảy ra trong quá khứ và kết quả đã không thành. Nó dùng để tiếc nuối hoặc để trách.\n\nMệnh đề if chia ở quá khứ hoàn thành, mệnh đề kết quả là would have cộng phân từ hai. Cả hai vế đều trái với sự thật.\n\nCould have và might have thay được would have để hạ mức chắc chắn xuống.\n\nSo với loại 2: loại 2 nói về hiện tại không có thật, loại 3 nói về quá khứ đã khác đi không được.',
 'Thiếu have ở vế kết quả, biến câu thành loại 2. Người học viết "If I had studied, I would pass" thay vì "I would have passed".',
 9),

('en:b1:cau-bi-dong-hien-tai-va-qua-khu-don', 'en', 'CEFR', 'B1', 'Câu bị động',
 'Câu bị động thì Hiện tại đơn và Quá khứ đơn',
 'S + am / is / are / was / were + V3/V-ed (+ by O)',
 E'Câu bị động dùng khi người thực hiện hành động không quan trọng, không rõ, hoặc ai cũng biết rồi. Nó rất thông dụng trong văn viết hành chính và kỹ thuật.\n\nTân ngữ của câu chủ động trở thành chủ ngữ. To be chia theo thì của câu chủ động và theo chủ ngữ mới, động từ chính chuyển sang phân từ hai.\n\nCụm by chỉ nêu khi người thực hiện thật sự cần biết. Phần lớn câu bị động bỏ hẳn phần này.\n\nChỉ động từ có tân ngữ mới chuyển sang bị động được.',
 'Quên chia to be theo thì, chỉ đổi động từ sang phân từ hai. Người học viết "The letter sent yesterday" thay vì "The letter was sent yesterday".',
 10),

('en:b1:cau-bi-dong-dong-tu-khiem-khuyet', 'en', 'CEFR', 'B1', 'Câu bị động',
 'Câu bị động với Động từ khiếm khuyết (Modal Verbs)',
 'S + can / should / must / may + be + V3/V-ed (+ by O)',
 E'Khi câu chủ động có động từ khuyết thiếu, dạng bị động giữ nguyên động từ đó rồi thêm be cộng phân từ hai.\n\nĐộng từ khuyết thiếu không đổi dạng theo chủ ngữ, nên be luôn ở dạng nguyên mẫu, không thành is hay are.\n\nCấu trúc này hay gặp ở nội quy, hướng dẫn và tài liệu kỹ thuật: "Helmets must be worn".\n\nPhủ định đặt not ngay sau động từ khuyết thiếu: "must not be opened".',
 'Chia be theo chủ ngữ sau động từ khuyết thiếu. Người học viết "The form must is signed" thay vì "The form must be signed".',
 11),

('en:b1:menh-de-quan-he-xac-dinh', 'en', 'CEFR', 'B1', 'Mệnh đề quan hệ',
 'Mệnh đề quan hệ xác định (Defining Relative Clauses)',
 'N (người) + who / that + ... | N (vật) + which / that + ...',
 E'Mệnh đề quan hệ xác định cho biết đang nói tới người nào, vật nào. Bỏ nó đi thì câu mất nghĩa hoặc không còn xác định được đối tượng.\n\nWho dùng cho người, which dùng cho vật, that dùng được cho cả hai trong loại mệnh đề này. Whose chỉ quan hệ sở hữu, where chỉ nơi chốn.\n\nLoại mệnh đề này không có dấu phẩy. Dấu phẩy sẽ đổi nghĩa câu sang loại không xác định.\n\nKhi đại từ quan hệ đóng vai tân ngữ, nó lược bỏ được: "the book I bought" đủ nghĩa như "the book which I bought".',
 'Lặp lại chủ ngữ sau đại từ quan hệ. Người học viết "The man who he called me is my uncle" thay vì "The man who called me is my uncle".',
 12),

('en:b1:menh-de-quan-he-khong-xac-dinh', 'en', 'CEFR', 'B1', 'Mệnh đề quan hệ',
 'Mệnh đề quan hệ không xác định (Non-defining Relative Clauses)',
 'N (đã xác định) , who / which + ... , + phần còn lại của câu',
 E'Mệnh đề quan hệ không xác định thêm thông tin phụ về một đối tượng vốn đã xác định rồi. Bỏ nó đi thì câu vẫn đủ nghĩa.\n\nNó luôn nằm giữa hai dấu phẩy, hoặc sau một dấu phẩy nếu đứng cuối câu.\n\nLoại này không dùng that và không lược bỏ đại từ quan hệ, kể cả khi đại từ đó là tân ngữ.\n\nWhich còn thay thế được cho cả mệnh đề đứng trước: "He arrived late, which annoyed everyone".',
 'Dùng that trong mệnh đề không xác định. Người học viết "My sister, that lives in Hue, is a nurse" thay vì "My sister, who lives in Hue, is a nurse".',
 13),

('en:b1:cau-tuong-thuat-tran-thuat', 'en', 'CEFR', 'B1', 'Câu tường thuật',
 'Câu tường thuật dạng câu kể (Reported Speech: Statements)',
 'S + said (that) + S + V (lùi thì) | S + told + O (that) + S + V (lùi thì)',
 E'Câu tường thuật kể lại lời người khác mà không trích nguyên văn. Khi động từ tường thuật ở quá khứ, động từ trong lời nói lùi một bậc: hiện tại đơn thành quá khứ đơn, hiện tại hoàn thành và quá khứ đơn thành quá khứ hoàn thành, will thành would.\n\nĐại từ và từ chỉ thời gian, nơi chốn cũng đổi theo người kể: today thành that day, tomorrow thành the next day, here thành there.\n\nSay và tell khác nhau ở tân ngữ. Tell luôn có người nghe ngay sau nó, say thì không: "He told me" nhưng "He said to me".\n\nKhông lùi thì khi nội dung vẫn còn đúng ở hiện tại, hoặc khi đó là một sự thật hiển nhiên.',
 'Giữ trật tự câu hỏi hoặc quên đổi đại từ khi tường thuật. Người học viết "She said me that she is tired" thay vì "She told me that she was tired".',
 14),

('en:b1:cau-tuong-thuat-cau-hoi-va-menh-lenh', 'en', 'CEFR', 'B1', 'Câu tường thuật',
 'Tường thuật câu hỏi và câu mệnh lệnh',
 'S + asked (+ O) + if / whether / Wh- + S + V (lùi thì) | S + told + O + (not) to + V',
 E'Khi tường thuật câu hỏi, câu trở lại trật tự của câu kể. Không đảo trợ động từ, không dùng do hay does, không có dấu hỏi.\n\nCâu hỏi yes/no dùng if hoặc whether. Câu hỏi có từ để hỏi giữ nguyên từ đó làm từ nối. Động từ vẫn lùi thì như câu tường thuật thường.\n\nCâu mệnh lệnh chuyển thành to cộng động từ nguyên mẫu sau tell, ask hoặc order. Dạng phủ định là not to cộng động từ.\n\nAsk dùng cho lời nhờ vả, tell dùng cho lời sai bảo.',
 'Giữ trật tự đảo của câu hỏi khi tường thuật. Người học viết "He asked me where did I live" thay vì "He asked me where I lived".',
 15),

('en:b1:modal-suy-doan-must-cant', 'en', 'CEFR', 'B1', 'Động từ khuyết thiếu',
 'Suy đoán ở hiện tại: Must, Might và Can''t',
 'S + must / might / can''t + be + ... | S + must / might / can''t + V (nguyên mẫu)',
 E'Nhóm này dùng để suy đoán dựa trên bằng chứng, không dùng để nói về sự bắt buộc.\n\nMust là gần như chắc chắn đúng, might là có thể, can''t là gần như chắc chắn sai. Ba từ tạo thành một thang mức độ tin chắc.\n\nTrong nghĩa suy đoán, phủ định của must không phải mustn''t mà là can''t. "He must be at home" đảo lại thành "He can''t be at home".\n\nĐể suy đoán về việc đang diễn ra, dùng must be cộng động từ thêm -ing.',
 'Dùng mustn''t để phủ định một suy đoán. Người học viết "She mustn''t be his sister" thay vì "She can''t be his sister".',
 16),

('en:b1:modal-hoan-thanh-should-have', 'en', 'CEFR', 'B1', 'Động từ khuyết thiếu',
 'Should have và Might have: nhận xét về quá khứ',
 'S + should / shouldn''t / might + have + V3/V-ed',
 E'Should have cộng phân từ hai nêu việc lẽ ra nên làm nhưng đã không làm. Shouldn''t have nêu việc đã làm nhưng lẽ ra không nên.\n\nCấu trúc này luôn nói về quá khứ và luôn hàm ý sự việc đã diễn ra ngược lại.\n\nMight have và could have nêu một khả năng đã có thể xảy ra ở quá khứ nhưng người nói không chắc.\n\nSau have, động từ luôn ở dạng phân từ hai. Trong văn nói, have thường rút gọn nghe gần như of, nhưng viết "should of" là sai.',
 'Dùng should cộng động từ nguyên mẫu để nói về quá khứ. Người học viết "I should tell her yesterday" thay vì "I should have told her yesterday".',
 17),

('en:b1:cum-dong-tu-tach-duoc', 'en', 'CEFR', 'B1', 'Cụm động từ',
 'Cụm động từ tách được và không tách được',
 'V + O + tiểu từ | V + tiểu từ + O | V + tiểu từ + O (không tách)',
 E'Một số cụm động từ cho phép tân ngữ đứng giữa động từ và tiểu từ: "turn the light off" và "turn off the light" đều đúng.\n\nNhưng khi tân ngữ là đại từ, nó bắt buộc đứng giữa. Viết "turn it off", không viết "turn off it".\n\nNhóm còn lại không tách được, thường là cụm có giới từ: look after, deal with, run into. Tân ngữ luôn đứng sau cả cụm, kể cả khi là đại từ.\n\nTừ điển thường ghi rõ cụm nào tách được, nên tra khi không chắc.',
 'Đặt đại từ sau tiểu từ ở cụm tách được. Người học viết "Please pick up me at 7" thay vì "Please pick me up at 7".',
 18),

('en:b1:luong-tu-all-most-both', 'en', 'CEFR', 'B1', 'Lượng từ',
 'Lượng từ: All, Most, Both, None',
 'all / most / both + N | all / most / both + of the + N',
 E'Khi nói về một nhóm nói chung, dùng lượng từ đứng thẳng trước danh từ số nhiều: "Most students prefer online classes".\n\nKhi nói về một nhóm cụ thể đã xác định, thêm of the hoặc of cộng từ sở hữu: "Most of the students in my class".\n\nBoth chỉ dùng cho đúng hai đối tượng. Từ ba trở lên phải dùng all.\n\nNone of mang nghĩa không một ai, không một cái nào. Động từ sau none of thường chia số ít trong văn viết trang trọng.',
 'Thêm of the khi nói về nhóm chung chung. Người học viết "Most of people like music" thay vì "Most people like music".',
 19),

('en:b1:so-sanh-trang-tu', 'en', 'CEFR', 'B1', 'So sánh',
 'So sánh hơn và so sánh nhất với trạng từ',
 'V + more + Adv + than | V + the most + Adv | V + Adv-er + than',
 E'Trạng từ cũng có dạng so sánh, và quy tắc gần giống tính từ. Trạng từ đuôi -ly dùng more và the most: more carefully, the most carefully.\n\nTrạng từ ngắn giống tính từ về hình thức, như fast, hard, early, late, thì thêm -er và -est.\n\nDạng bất quy tắc: well thành better và the best, badly thành worse và the worst, much thành more.\n\nSo sánh trạng từ nói về cách thực hiện hành động, nên nó đứng sau động từ, khác so sánh tính từ vốn đứng sau to be.',
 'Dùng dạng tính từ khi so sánh về cách làm. Người học viết "He runs faster than me but drives more careful" thay vì "more carefully".',
 20),

('en:b1:too-enough-so-that', 'en', 'CEFR', 'B1', 'Trạng từ',
 'Too, Enough và So ... that',
 'too + Adj + to V | Adj + enough + to V | so + Adj + that + S + V',
 E'Too mang nghĩa quá mức đến nỗi không làm được. Nó luôn có sắc thái tiêu cực: "The box is too heavy to carry".\n\nEnough mang nghĩa đủ để làm được. Enough đứng sau tính từ và trạng từ, nhưng đứng trước danh từ.\n\nSo cộng tính từ cộng that nêu mức độ rồi nêu kết quả thành một mệnh đề đầy đủ. Với danh từ, dùng such cộng danh từ cộng that.\n\nTừ chỉ mức độ mạnh như extremely và much too thuộc cùng nhóm này và đứng ở vị trí của too.',
 'Dùng very thay cho too khi muốn nói tới hậu quả. Người học viết "The coffee is very hot to drink" thay vì "too hot to drink".',
 21),

('en:b1:cau-hoi-duoi', 'en', 'CEFR', 'B1', 'Câu hỏi',
 'Câu hỏi đuôi (Question Tags)',
 'S + V (khẳng định), trợ động từ + not + S? | S + V (phủ định), trợ động từ + S?',
 E'Câu hỏi đuôi là phần hỏi ngắn gắn vào cuối câu kể, dùng để xác nhận thông tin hoặc mời người nghe đồng tình.\n\nQuy tắc cơ bản là trái dấu: mệnh đề chính khẳng định thì đuôi phủ định, và ngược lại. Đuôi dùng lại trợ động từ của mệnh đề chính; nếu không có trợ động từ thì dùng do, does hoặc did.\n\nChủ ngữ trong đuôi luôn là đại từ, không lặp lại danh từ.\n\nHai trường hợp riêng: "I am" đi với đuôi "aren''t I", và câu mệnh lệnh đi với đuôi "will you".',
 'Tạo đuôi cùng dấu với mệnh đề chính, theo cách hỏi "phải không" của tiếng Việt. Người học viết "You are a student, are you?" thay vì "aren''t you?".',
 22),

-- B2
('en:b2:hien-tai-hoan-thanh-tiep-dien', 'en', 'CEFR', 'B2', 'Hiện tại hoàn thành',
 'Thì hiện tại hoàn thành tiếp diễn',
 'S + have / has been + V-ing (+ for / since ...)',
 E'Thì này nhấn vào quá trình kéo dài từ quá khứ đến hiện tại, chứ không nhấn vào kết quả đã xong.\n\nSo sánh hai câu cùng đúng: "I have read the report" tập trung vào việc đã đọc xong, "I have been reading the report" tập trung vào thời gian bỏ ra và có thể vẫn chưa xong.\n\nThì này hay dùng để giải thích một dấu vết còn thấy ở hiện tại: "Her eyes are red. She has been crying".\n\nCác động từ chỉ trạng thái như know, believe, own không dùng ở dạng tiếp diễn, nên với chúng vẫn dùng hiện tại hoàn thành thường.',
 'Dùng dạng tiếp diễn với động từ chỉ trạng thái. Người học viết "I have been knowing him for years" thay vì "I have known him for years".',
 0),

('en:b2:qua-khu-hoan-thanh-tiep-dien', 'en', 'CEFR', 'B2', 'Quá khứ hoàn thành',
 'Thì quá khứ hoàn thành tiếp diễn',
 'S + had been + V-ing + (for / since ...) + mệnh đề quá khứ đơn',
 E'Thì này mô tả một quá trình kéo dài cho tới một mốc trong quá khứ, thường để giải thích nguyên nhân của việc xảy ra tại mốc đó.\n\n"He was tired because he had been working all night": việc làm đêm kéo dài trước đó giải thích trạng thái mệt.\n\nKhác quá khứ hoàn thành thường ở chỗ nó nhấn vào độ dài của quá trình, không nhấn vào việc đã hoàn tất.\n\nCâu gần như luôn có for, since hoặc một cụm chỉ khoảng thời gian, vì đó là lý do chọn thì này.',
 'Dùng quá khứ tiếp diễn khi cần nêu khoảng thời gian trước một mốc quá khứ. Người học viết "He was working for three hours when I arrived" thay vì "He had been working for three hours".',
 1),

('en:b2:phoi-hop-thi-khi-ke-chuyen', 'en', 'CEFR', 'B2', 'Thì quá khứ',
 'Phối hợp các thì quá khứ khi kể chuyện',
 'Quá khứ đơn (chuỗi sự việc) + quá khứ tiếp diễn (bối cảnh) + quá khứ hoàn thành (việc trước đó)',
 E'Một đoạn kể ở trình độ này không dùng một thì duy nhất. Ba thì quá khứ chia nhau ba vai trò cố định.\n\nQuá khứ đơn đẩy câu chuyện đi tới, nêu các sự việc theo thứ tự xảy ra. Quá khứ tiếp diễn dựng bối cảnh đang diễn ra quanh các sự việc đó. Quá khứ hoàn thành lùi về trước mốc kể để giải thích hoặc bổ sung.\n\nCác từ nối cho biết vai trò: while và as đi với bối cảnh, then và after that đi với chuỗi sự việc, by the time và earlier đi với việc xảy ra trước.\n\nĐây là kỹ năng B2 rõ nhất: không phải cấu trúc mới, mà là dùng đúng ba thì đã biết trong cùng một đoạn.',
 'Kể toàn bộ câu chuyện bằng quá khứ đơn, khiến bối cảnh và các mốc trước sau bẹt thành một hàng. Đoạn văn đúng ngữ pháp nhưng người đọc không thấy được trình tự.',
 2),

('en:b2:tuong-lai-hoan-thanh', 'en', 'CEFR', 'B2', 'Thì tương lai',
 'Thì tương lai hoàn thành',
 'S + will have + V3/V-ed + by + mốc thời gian tương lai',
 E'Tương lai hoàn thành nói về việc sẽ hoàn tất trước một mốc trong tương lai. Mốc đó gần như bắt buộc phải nêu, thường bằng by hoặc by the time.\n\nBy chỉ hạn chót, until chỉ sự kéo dài đến lúc đó. Hai từ không thay nhau được.\n\nSau by the time, mệnh đề chia ở hiện tại đơn dù nói về tương lai, giống mệnh đề if của câu điều kiện loại 1.\n\nThì này hay gặp trong kế hoạch, hợp đồng và báo cáo tiến độ.',
 'Dùng tương lai đơn khi câu có hạn chót. Người học viết "I will finish the report by Friday" trong văn bản trang trọng, đúng hơn là "I will have finished the report by Friday".',
 3),

('en:b2:tuong-lai-hoan-thanh-tiep-dien', 'en', 'CEFR', 'B2', 'Thì tương lai',
 'Thì tương lai hoàn thành tiếp diễn',
 'S + will have been + V-ing + for + khoảng thời gian',
 E'Thì này tính độ dài của một quá trình tính đến một mốc trong tương lai. Câu luôn có for cộng khoảng thời gian.\n\n"By next June, I will have been working here for ten years": đến tháng Sáu năm sau, thời gian làm việc cộng lại là mười năm.\n\nKhác tương lai hoàn thành ở chỗ tương lai hoàn thành đếm kết quả đã xong, còn thì này đếm thời gian đã bỏ ra và hàm ý việc vẫn tiếp tục.\n\nĐây là thì ít dùng nhất trong hệ thống thì tiếng Anh, chủ yếu gặp ở văn viết trang trọng.',
 'Nhầm với tương lai hoàn thành khi câu đếm khoảng thời gian. Người học viết "I will have worked here for ten years" ở chỗ cần nhấn vào quá trình liên tục.',
 4),

('en:b2:cau-dieu-kien-hon-hop', 'en', 'CEFR', 'B2', 'Câu điều kiện',
 'Câu điều kiện hỗn hợp',
 'If + S + had + V3/V-ed, S + would + V (nguyên mẫu) | If + S + V2/V-ed, S + would have + V3/V-ed',
 E'Câu điều kiện hỗn hợp ghép hai mốc thời gian khác nhau vào một câu, vì nguyên nhân và kết quả không nằm cùng một thời điểm.\n\nDạng hay gặp nhất là nguyên nhân ở quá khứ, kết quả ở hiện tại: "If I had studied medicine, I would be a doctor now". Vế if theo loại 3, vế kết quả theo loại 2.\n\nDạng ngược lại nói về một đặc điểm luôn đúng ở hiện tại và hậu quả của nó trong quá khứ: "If she were more careful, she would not have lost the file".\n\nTrạng từ thời gian như now và today là dấu hiệu cho biết câu là hỗn hợp chứ không phải loại 3.',
 'Ghép thì theo một loại duy nhất khiến câu sai thời điểm. Người học viết "If I had taken that job, I would have been richer now" thay vì "I would be richer now".',
 5),

('en:b2:wish-va-if-only', 'en', 'CEFR', 'B2', 'Câu điều kiện',
 'Wish và If only',
 'S + wish + S + V2/V-ed (hiện tại) | S + wish + S + had + V3/V-ed (quá khứ) | S + wish + S + would + V',
 E'Wish và if only nêu điều trái với thực tế mà người nói mong khác đi. If only mạnh hơn wish về sắc thái.\n\nMong điều khác đi ở hiện tại thì mệnh đề sau chia quá khứ đơn, với to be dùng were. Tiếc một việc trong quá khứ thì chia quá khứ hoàn thành.\n\nWish cộng would dùng để phàn nàn về thói quen của người khác hoặc về việc mình không kiểm soát được: "I wish he would stop complaining". Không dùng dạng này khi chủ ngữ hai vế trùng nhau.\n\nWish cộng to cộng động từ là cách nói trang trọng của want, không mang nghĩa tiếc nuối: "I wish to speak to the manager".',
 'Chia thì theo đúng mốc thời gian được nhắc tới thay vì lùi một bậc. Người học viết "I wish I am taller" thay vì "I wish I were taller".',
 6),

('en:b2:cau-bi-dong-day-du', 'en', 'CEFR', 'B2', 'Câu bị động',
 'Câu bị động ở mọi thì',
 'S + be (chia theo thì) + V3/V-ed | S + be being + V3/V-ed | S + have been + V3/V-ed',
 E'Ở trình độ này, bị động dùng được với mọi thì, không chỉ hiện tại đơn và quá khứ đơn. Công thức chung không đổi: to be chia đúng thì, cộng phân từ hai.\n\nThì tiếp diễn thành is being hoặc was being cộng phân từ hai. Thì hoàn thành thành has been hoặc had been cộng phân từ hai. Tương lai thành will be cộng phân từ hai.\n\nVới động từ có hai tân ngữ, cả hai đều làm chủ ngữ bị động được. Dạng lấy người làm chủ ngữ tự nhiên hơn: "She was given a prize".\n\nBị động là công cụ để giữ mạch thông tin: thông tin cũ đặt ở đầu câu, thông tin mới đẩy về cuối.',
 'Ghép sai chuỗi trợ động từ ở thì hoàn thành và tiếp diễn. Người học viết "The road has being repaired" thay vì "The road has been repaired".',
 7),

('en:b2:cau-bi-dong-voi-dong-tu-tuong-thuat', 'en', 'CEFR', 'B2', 'Câu bị động',
 'Bị động với động từ tường thuật',
 'It is said / believed / reported that + S + V | S + is said / believed + to + V',
 E'Cấu trúc này nêu một thông tin mà không cho biết ai nói ra, nên thường gặp trong bản tin và văn viết học thuật.\n\nCó hai dạng cho cùng một ý. Dạng thứ nhất mở đầu bằng it: "It is said that he lives abroad". Dạng thứ hai đưa chủ ngữ lên trước: "He is said to live abroad".\n\nKhi việc được nói tới xảy ra trước thời điểm tường thuật, dạng thứ hai dùng to have cộng phân từ hai: "He is said to have left the country".\n\nNhóm động từ dùng được gồm say, believe, report, think, know, expect, consider.',
 'Bỏ it ở dạng thứ nhất, khiến câu mất chủ ngữ. Người học viết "Is said that the factory will close" thay vì "It is said that the factory will close".',
 8),

('en:b2:menh-de-quan-he-rut-gon', 'en', 'CEFR', 'B2', 'Mệnh đề quan hệ',
 'Mệnh đề quan hệ rút gọn',
 'N + V-ing (chủ động) | N + V3/V-ed (bị động) | N + to + V',
 E'Khi đại từ quan hệ là chủ ngữ của mệnh đề, mệnh đề rút gọn được để câu ngắn và gọn hơn.\n\nMệnh đề chủ động rút thành động từ thêm -ing: "the man who is waiting outside" thành "the man waiting outside". Mệnh đề bị động rút thành phân từ hai: "the report which was written last week" thành "the report written last week".\n\nDạng to cộng động từ dùng sau so sánh nhất, sau the first, the last, the only: "the first person to arrive".\n\nChỉ rút gọn được khi đại từ quan hệ làm chủ ngữ. Nếu nó làm tân ngữ thì phải giữ nguyên mệnh đề hoặc lược bỏ đại từ.',
 'Rút gọn sai dạng chủ động và bị động. Người học viết "the questions asking in the test" thay vì "the questions asked in the test".',
 9),

('en:b2:menh-de-quan-he-voi-gioi-tu', 'en', 'CEFR', 'B2', 'Mệnh đề quan hệ',
 'Mệnh đề quan hệ có giới từ và Whose',
 'N + giới từ + which / whom + S + V | N + whose + N + V',
 E'Khi mệnh đề quan hệ chứa một giới từ, giới từ đứng được ở hai chỗ. Văn nói để giới từ ở cuối mệnh đề: "the colleague I worked with". Văn viết trang trọng đưa giới từ lên trước đại từ: "the colleague with whom I worked".\n\nSau giới từ, bắt buộc dùng whom cho người và which cho vật. That không đứng sau giới từ được.\n\nWhose chỉ quan hệ sở hữu và đi liền một danh từ không có mạo từ: "the company whose products we tested".\n\nCấu trúc lượng từ cộng of which, of whom dùng để nêu một phần của nhóm: "the staff, many of whom were new".',
 'Dùng that sau giới từ hoặc ghép which với người. Người học viết "the man with that I spoke" thay vì "the man with whom I spoke".',
 10),

('en:b2:modal-hoan-thanh-cant-have-neednt-have', 'en', 'CEFR', 'B2', 'Động từ khuyết thiếu',
 'Can''t have và Needn''t have',
 'S + can''t have + V3/V-ed | S + needn''t have + V3/V-ed | S + didn''t need to + V',
 E'Can''t have cộng phân từ hai nêu một suy đoán rằng việc đó chắc chắn đã không xảy ra: "She can''t have seen us, it was too dark".\n\nNeedn''t have cộng phân từ hai nêu việc đã làm nhưng hoá ra không cần: "I needn''t have booked a table, the restaurant was empty".\n\nDidn''t need to khác hẳn: việc không cần và cũng đã không làm. Chọn sai một trong hai là đổi hẳn sự thật của câu.\n\nMust have là mặt đối lập của can''t have, nêu suy đoán rằng việc chắc chắn đã xảy ra.',
 'Dùng needn''t have cho việc đã không làm. Người học viết "I needn''t have paid, so I saved the money" thay vì "I didn''t need to pay".',
 11),

('en:b2:mao-tu-voi-danh-tu-truu-tuong', 'en', 'CEFR', 'B2', 'Mạo từ',
 'Mạo từ với danh từ trừu tượng',
 'Ø + N trừu tượng (nghĩa chung) | the + N trừu tượng + of ... (nghĩa xác định)',
 E'Danh từ trừu tượng mang nghĩa chung thì không có mạo từ: "Education is a right", "Happiness is hard to measure".\n\nKhi danh từ đó được giới hạn lại bằng một cụm of hoặc một mệnh đề, nó trở nên xác định và cần the: "the education of young children", "the happiness she felt".\n\nMột số danh từ trừu tượng dùng được a hoặc an khi chỉ một trường hợp cụ thể: "a good education", "an understanding of the problem".\n\nĐây là điểm hay sai trong văn viết học thuật, nơi danh từ trừu tượng xuất hiện dày đặc.',
 'Thêm the trước danh từ trừu tượng mang nghĩa chung. Người học viết "The technology has changed our lives" thay vì "Technology has changed our lives".',
 12),

('en:b2:trang-tu-chi-thai-do', 'en', 'CEFR', 'B2', 'Trạng từ',
 'Trạng từ chỉ thái độ và quan điểm',
 'Adv + , + S + V (đầu câu) | S + Adv + V (giữa câu)',
 E'Trạng từ chỉ thái độ nêu nhận xét của người nói về cả câu, không mô tả cách hành động diễn ra: fortunately, obviously, apparently, honestly, surprisingly.\n\nChúng thường đứng đầu câu và có dấu phẩy theo sau, hoặc đứng giữa câu trước động từ chính.\n\nVị trí đổi thì nghĩa đổi. "He answered honestly" nói về cách anh ta trả lời, còn "Honestly, he answered" là nhận xét của người nói về việc anh ta có trả lời.\n\nMột số trạng từ dạng này nêu mức độ chắc chắn: clearly, presumably, undoubtedly. Chúng thay thế cho một mệnh đề dài hơn như "It is clear that".',
 'Đặt trạng từ chỉ thái độ ở cuối câu như trạng từ chỉ cách thức. Người học viết "He will not come apparently" thay vì "Apparently, he will not come".',
 13),

('en:b2:ket-hop-tu-nhan-manh', 'en', 'CEFR', 'B2', 'Trạng từ',
 'Kết hợp từ nhấn mạnh với tính từ',
 'absolutely / utterly + Adj tuyệt đối | highly / deeply / bitterly + Adj thường',
 E'Ở trình độ này, chọn từ nhấn mạnh không còn là chọn mức độ mà là chọn từ đi được với tính từ đó. Đây là vấn đề kết hợp từ, tra từ điển chứ không suy ra bằng quy tắc.\n\nTính từ đã ở mức tuyệt đối như exhausted, impossible, freezing, perfect đi với absolutely, utterly, completely, không đi với very.\n\nMột số cặp gần như cố định: highly unlikely, deeply concerned, bitterly disappointed, perfectly clear, strongly opposed.\n\nDùng đúng cặp là dấu hiệu rõ nhất của người viết thành thạo, vì câu sai cặp vẫn đúng ngữ pháp nhưng nghe không tự nhiên.',
 'Ghép very với mọi tính từ. Người học viết "very impossible" và "very unlikely" thay vì "absolutely impossible" và "highly unlikely".',
 14)

on conflict (id) do update set
  level_scheme = excluded.level_scheme,
  level = excluded.level,
  category_vi = excluded.category_vi,
  title_vi = excluded.title_vi,
  pattern = excluded.pattern,
  explanation_vi = excluded.explanation_vi,
  common_mistake_vi = excluded.common_mistake_vi,
  sort_order = excluded.sort_order,
  updated_at = now();

-- reviewed-destructive: the owner of the repository asked for the English grammar to be
-- rewritten, and the examples are rewritten with it. The delete is scoped to points whose
-- lang is 'en' and the insert below rebuilds every one of those rows in the same file.
delete from lex.grammar_examples
where grammar_point_id in (select id from lex.grammar_points where lang = 'en');

-- reading stays null: it carries pinyin, which only the zh rows have.
insert into lex.grammar_examples (grammar_point_id, text, reading, translation_vi, sort_order)
values

-- A1 examples
('en:a1:dong-tu-to-be-khang-dinh', 'I am a student at a technical school.', null, 'Tôi là học sinh một trường kỹ thuật.', 0),
('en:a1:dong-tu-to-be-khang-dinh', 'My sister is a nurse in Da Nang.', null, 'Chị tôi là y tá ở Đà Nẵng.', 1),
('en:a1:dong-tu-to-be-khang-dinh', 'These shoes are very comfortable.', null, 'Đôi giày này rất thoải mái.', 2),
('en:a1:dong-tu-to-be-khang-dinh', 'We''re ready for the test.', null, 'Chúng tôi đã sẵn sàng cho bài kiểm tra.', 3),

('en:a1:dong-tu-to-be-phu-dinh-nghi-van', 'He is not at home today.', null, 'Hôm nay anh ấy không có ở nhà.', 0),
('en:a1:dong-tu-to-be-phu-dinh-nghi-van', 'The shops aren''t open on Sunday morning.', null, 'Các cửa hàng không mở cửa vào sáng Chủ nhật.', 1),
('en:a1:dong-tu-to-be-phu-dinh-nghi-van', 'Are you from Hue?', null, 'Bạn đến từ Huế phải không?', 2),
('en:a1:dong-tu-to-be-phu-dinh-nghi-van', 'Is this seat free?', null, 'Chỗ này có ai ngồi chưa?', 3),

('en:a1:hien-tai-don-dong-tu-thuong-khang-dinh', 'I start work at eight every morning.', null, 'Tôi bắt đầu làm việc lúc tám giờ mỗi sáng.', 0),
('en:a1:hien-tai-don-dong-tu-thuong-khang-dinh', 'She teaches maths at a primary school.', null, 'Cô ấy dạy toán ở một trường tiểu học.', 1),
('en:a1:hien-tai-don-dong-tu-thuong-khang-dinh', 'The bus leaves at six thirty.', null, 'Xe buýt khởi hành lúc sáu giờ rưỡi.', 2),
('en:a1:hien-tai-don-dong-tu-thuong-khang-dinh', 'Water boils at one hundred degrees.', null, 'Nước sôi ở một trăm độ.', 3),

('en:a1:hien-tai-don-dong-tu-thuong-phu-dinh-nghi-van', 'I don''t eat meat.', null, 'Tôi không ăn thịt.', 0),
('en:a1:hien-tai-don-dong-tu-thuong-phu-dinh-nghi-van', 'She doesn''t live near the office.', null, 'Cô ấy không sống gần văn phòng.', 1),
('en:a1:hien-tai-don-dong-tu-thuong-phu-dinh-nghi-van', 'Do you speak Chinese?', null, 'Bạn có nói được tiếng Trung không?', 2),
('en:a1:hien-tai-don-dong-tu-thuong-phu-dinh-nghi-van', 'Does the shop open on Monday?', null, 'Cửa hàng có mở cửa thứ Hai không?', 3),

('en:a1:danh-tu-so-nhieu', 'I bought three books yesterday.', null, 'Hôm qua tôi mua ba quyển sách.', 0),
('en:a1:danh-tu-so-nhieu', 'There are two buses every hour.', null, 'Mỗi tiếng có hai chuyến xe buýt.', 1),
('en:a1:danh-tu-so-nhieu', 'The children are playing in the yard.', null, 'Bọn trẻ đang chơi ngoài sân.', 2),
('en:a1:danh-tu-so-nhieu', 'My feet hurt after the long walk.', null, 'Chân tôi đau sau quãng đường đi bộ dài.', 3),

('en:a1:mao-tu-bat-dinh-a-an', 'She works as a doctor.', null, 'Cô ấy làm bác sĩ.', 0),
('en:a1:mao-tu-bat-dinh-a-an', 'I need an umbrella today.', null, 'Hôm nay tôi cần một cái ô.', 1),
('en:a1:mao-tu-bat-dinh-a-an', 'We waited an hour for the train.', null, 'Chúng tôi đợi tàu một tiếng.', 2),
('en:a1:mao-tu-bat-dinh-a-an', 'He is a university student.', null, 'Anh ấy là sinh viên đại học.', 3),

('en:a1:mao-tu-xac-dinh-the', 'Close the door, please.', null, 'Làm ơn đóng cửa lại.', 0),
('en:a1:mao-tu-xac-dinh-the', 'I bought a shirt. The shirt was too small.', null, 'Tôi mua một chiếc áo. Chiếc áo đó quá nhỏ.', 1),
('en:a1:mao-tu-xac-dinh-the', 'The sun rises in the east.', null, 'Mặt trời mọc ở hướng đông.', 2),
('en:a1:mao-tu-xac-dinh-the', 'The coffee in this shop is very good.', null, 'Cà phê ở quán này rất ngon.', 3),

('en:a1:dai-tu-nhan-xung-va-tinh-tu-so-huu', 'They are my classmates.', null, 'Họ là bạn cùng lớp của tôi.', 0),
('en:a1:dai-tu-nhan-xung-va-tinh-tu-so-huu', 'Her phone is on the table.', null, 'Điện thoại của cô ấy ở trên bàn.', 1),
('en:a1:dai-tu-nhan-xung-va-tinh-tu-so-huu', 'We live with our grandparents.', null, 'Chúng tôi sống cùng ông bà.', 2),
('en:a1:dai-tu-nhan-xung-va-tinh-tu-so-huu', 'It is cold in the morning.', null, 'Buổi sáng trời lạnh.', 3),

('en:a1:gioi-tu-thoi-gian-in-on-at', 'The meeting starts at nine.', null, 'Cuộc họp bắt đầu lúc chín giờ.', 0),
('en:a1:gioi-tu-thoi-gian-in-on-at', 'I have a class on Tuesday.', null, 'Tôi có một buổi học vào thứ Ba.', 1),
('en:a1:gioi-tu-thoi-gian-in-on-at', 'It often rains in September.', null, 'Trời hay mưa vào tháng Chín.', 2),
('en:a1:gioi-tu-thoi-gian-in-on-at', 'I will call you tomorrow.', null, 'Mai tôi sẽ gọi cho bạn.', 3),

('en:a1:gioi-tu-noi-chon-in-on-at', 'She is waiting at the bus stop.', null, 'Cô ấy đang đợi ở trạm xe buýt.', 0),
('en:a1:gioi-tu-noi-chon-in-on-at', 'Your keys are on the desk.', null, 'Chìa khoá của bạn ở trên bàn làm việc.', 1),
('en:a1:gioi-tu-noi-chon-in-on-at', 'My parents live in Can Tho.', null, 'Bố mẹ tôi sống ở Cần Thơ.', 2),
('en:a1:gioi-tu-noi-chon-in-on-at', 'The manager is in the meeting room.', null, 'Quản lý đang ở trong phòng họp.', 3),

('en:a1:cau-truc-there-is-there-are', 'There is a small park near my house.', null, 'Gần nhà tôi có một công viên nhỏ.', 0),
('en:a1:cau-truc-there-is-there-are', 'There are five people in my team.', null, 'Nhóm tôi có năm người.', 1),
('en:a1:cau-truc-there-is-there-are', 'Is there a pharmacy on this street?', null, 'Phố này có hiệu thuốc không?', 2),
('en:a1:cau-truc-there-is-there-are', 'There isn''t any milk in the fridge.', null, 'Trong tủ lạnh không còn sữa.', 3),

('en:a1:cau-hoi-wh-questions', 'Where do you work?', null, 'Bạn làm việc ở đâu?', 0),
('en:a1:cau-hoi-wh-questions', 'What does your brother do?', null, 'Anh trai bạn làm nghề gì?', 1),
('en:a1:cau-hoi-wh-questions', 'When is the next train?', null, 'Chuyến tàu tiếp theo lúc mấy giờ?', 2),
('en:a1:cau-hoi-wh-questions', 'Who lives on the top floor?', null, 'Ai sống ở tầng trên cùng?', 3),

('en:a1:cau-menh-lenh', 'Turn left at the next traffic light.', null, 'Rẽ trái ở đèn giao thông tiếp theo.', 0),
('en:a1:cau-menh-lenh', 'Please take off your shoes before you come in.', null, 'Vui lòng cởi giày trước khi vào nhà.', 1),
('en:a1:cau-menh-lenh', 'Don''t forget your helmet.', null, 'Đừng quên mũ bảo hiểm nhé.', 2),
('en:a1:cau-menh-lenh', 'Don''t drink the tap water here.', null, 'Đừng uống nước máy ở đây.', 3),
('en:a1:cau-menh-lenh', 'Let''s have pho for breakfast.', null, 'Sáng nay mình đi ăn phở đi.', 4),

('en:a1:cau-truc-have-got', 'I''ve got two older brothers.', null, 'Tôi có hai anh trai.', 0),
('en:a1:cau-truc-have-got', 'She''s got long black hair.', null, 'Cô ấy có mái tóc đen dài.', 1),
('en:a1:cau-truc-have-got', 'Have you got change for fifty thousand dong?', null, 'Bạn có tiền lẻ đổi tờ năm mươi nghìn không?', 2),
('en:a1:cau-truc-have-got', 'We haven''t got time for lunch today.', null, 'Hôm nay chúng tôi không có thời gian ăn trưa.', 3),
('en:a1:cau-truc-have-got', 'He''s got a bad cold.', null, 'Anh ấy bị cảm nặng.', 4),

('en:a1:so-huu-cach-s', 'This is my mother''s phone number.', null, 'Đây là số điện thoại của mẹ tôi.', 0),
('en:a1:so-huu-cach-s', 'Minh''s house is at the end of the alley.', null, 'Nhà Minh ở cuối ngõ.', 1),
('en:a1:so-huu-cach-s', 'We had dinner at my grandparents'' house.', null, 'Chúng tôi ăn tối ở nhà ông bà tôi.', 2),
('en:a1:so-huu-cach-s', 'The children''s toys are all over the floor.', null, 'Đồ chơi của bọn trẻ vương vãi khắp sàn nhà.', 3),

('en:a1:tu-chi-dinh-this-that-these-those', 'This coffee is too sweet.', null, 'Cà phê này ngọt quá.', 0),
('en:a1:tu-chi-dinh-this-that-these-those', 'Is that your motorbike over there?', null, 'Chiếc xe máy đằng kia là của bạn à?', 1),
('en:a1:tu-chi-dinh-this-that-these-those', 'These mangoes are from my hometown.', null, 'Mấy quả xoài này là xoài quê tôi.', 2),
('en:a1:tu-chi-dinh-this-that-these-those', 'How much are those sandals?', null, 'Đôi dép kia bao nhiêu tiền?', 3),
('en:a1:tu-chi-dinh-this-that-these-those', 'Hello, this is Nam from the sales team.', null, 'Alô, tôi là Nam ở phòng kinh doanh.', 4),

('en:a1:dai-tu-tan-ngu', 'Please send me the address.', null, 'Bạn gửi cho tôi địa chỉ nhé.', 0),
('en:a1:dai-tu-tan-ngu', 'I see them at the market every Sunday.', null, 'Chủ nhật nào tôi cũng gặp họ ở chợ.', 1),
('en:a1:dai-tu-tan-ngu', 'My grandmother lives with us.', null, 'Bà tôi sống cùng chúng tôi.', 2),
('en:a1:dai-tu-tan-ngu', 'This gift is for him.', null, 'Món quà này dành cho anh ấy.', 3),
('en:a1:dai-tu-tan-ngu', 'I like this song. Listen to it!', null, 'Tôi thích bài hát này. Bạn nghe thử đi!', 4),

-- A2 examples
('en:a2:present-continuous-actions-now', 'I am waiting for the bus.', null, 'Tôi đang đợi xe buýt.', 0),
('en:a2:present-continuous-actions-now', 'She is studying for her exam this week.', null, 'Tuần này cô ấy đang ôn thi.', 1),
('en:a2:present-continuous-actions-now', 'They aren''t working today.', null, 'Hôm nay họ không làm việc.', 2),
('en:a2:present-continuous-actions-now', 'Why are you laughing?', null, 'Sao bạn lại cười?', 3),

('en:a2:present-continuous-future-plans', 'I am meeting my manager at four tomorrow.', null, 'Bốn giờ chiều mai tôi gặp quản lý.', 0),
('en:a2:present-continuous-future-plans', 'We are flying to Seoul on Friday.', null, 'Thứ Sáu chúng tôi bay đi Seoul.', 1),
('en:a2:present-continuous-future-plans', 'She isn''t coming to the party tonight.', null, 'Tối nay cô ấy không đến bữa tiệc.', 2),

('en:a2:past-simple-to-be', 'She was tired after the long trip.', null, 'Cô ấy mệt sau chuyến đi dài.', 0),
('en:a2:past-simple-to-be', 'We were at the cinema last night.', null, 'Tối qua chúng tôi ở rạp chiếu phim.', 1),
('en:a2:past-simple-to-be', 'The tickets weren''t expensive.', null, 'Vé không đắt.', 2),
('en:a2:past-simple-to-be', 'Were you at home on Sunday?', null, 'Chủ nhật bạn có ở nhà không?', 3),

('en:a2:past-simple-regular-verbs', 'I watched a film last night.', null, 'Tối qua tôi xem một bộ phim.', 0),
('en:a2:past-simple-regular-verbs', 'They stopped the project in May.', null, 'Họ dừng dự án vào tháng Năm.', 1),
('en:a2:past-simple-regular-verbs', 'She studied Japanese for two years.', null, 'Cô ấy học tiếng Nhật trong hai năm.', 2),

('en:a2:past-simple-irregular-verbs', 'He bought a new phone last week.', null, 'Tuần trước anh ấy mua điện thoại mới.', 0),
('en:a2:past-simple-irregular-verbs', 'We went to Ha Long Bay in 2023.', null, 'Năm 2023 chúng tôi đi vịnh Hạ Long.', 1),
('en:a2:past-simple-irregular-verbs', 'I saw your message this morning.', null, 'Sáng nay tôi thấy tin nhắn của bạn.', 2),

('en:a2:past-simple-negative-questions', 'I didn''t sleep well last night.', null, 'Tối qua tôi ngủ không ngon.', 0),
('en:a2:past-simple-negative-questions', 'Did you finish the report?', null, 'Bạn làm xong báo cáo chưa?', 1),
('en:a2:past-simple-negative-questions', 'She didn''t tell me about the meeting.', null, 'Cô ấy không nói với tôi về cuộc họp.', 2),

('en:a2:used-to', 'I used to walk to school every day.', null, 'Trước đây ngày nào tôi cũng đi bộ đến trường.', 0),
('en:a2:used-to', 'There used to be a market on this corner.', null, 'Trước đây ở góc phố này có một cái chợ.', 1),
('en:a2:used-to', 'She didn''t use to like spicy food.', null, 'Trước đây cô ấy không thích đồ cay.', 2),
('en:a2:used-to', 'Did you use to play football at university?', null, 'Hồi đại học bạn có hay chơi bóng đá không?', 3),

('en:a2:qua-khu-tiep-dien', 'I was cooking when the lights went out.', null, 'Tôi đang nấu ăn thì mất điện.', 0),
('en:a2:qua-khu-tiep-dien', 'While she was driving, her phone rang.', null, 'Trong lúc cô ấy lái xe thì điện thoại reo.', 1),
('en:a2:qua-khu-tiep-dien', 'At nine last night I was still working.', null, 'Chín giờ tối qua tôi vẫn đang làm việc.', 2),
('en:a2:qua-khu-tiep-dien', 'They were waiting outside while it was raining.', null, 'Họ đợi bên ngoài trong lúc trời mưa.', 3),

('en:a2:tuong-lai-will-va-be-going-to', 'Look at those clouds. It is going to rain.', null, 'Nhìn những đám mây kia xem. Trời sắp mưa.', 0),
('en:a2:tuong-lai-will-va-be-going-to', 'I am going to look for a new job next year.', null, 'Năm sau tôi định tìm công việc mới.', 1),
('en:a2:tuong-lai-will-va-be-going-to', 'The phone is ringing. I will answer it.', null, 'Điện thoại đang reo. Để tôi nghe.', 2),
('en:a2:tuong-lai-will-va-be-going-to', 'I think she will pass the exam.', null, 'Tôi nghĩ cô ấy sẽ đỗ kỳ thi.', 3),

('en:a2:wh-questions-qua-khu', 'Where did you go last weekend?', null, 'Cuối tuần trước bạn đi đâu?', 0),
('en:a2:wh-questions-qua-khu', 'Why were you late this morning?', null, 'Sáng nay sao bạn đến muộn?', 1),
('en:a2:wh-questions-qua-khu', 'Who called you yesterday?', null, 'Hôm qua ai gọi cho bạn?', 2),

('en:a2:dong-tu-theo-sau-v-ing-hoac-to-v', 'I enjoy reading before bed.', null, 'Tôi thích đọc sách trước khi ngủ.', 0),
('en:a2:dong-tu-theo-sau-v-ing-hoac-to-v', 'She decided to change her job.', null, 'Cô ấy quyết định đổi việc.', 1),
('en:a2:dong-tu-theo-sau-v-ing-hoac-to-v', 'We finished painting the room.', null, 'Chúng tôi sơn xong căn phòng.', 2),
('en:a2:dong-tu-theo-sau-v-ing-hoac-to-v', 'I would like to book a table for two.', null, 'Tôi muốn đặt bàn cho hai người.', 3),

('en:a2:to-v-chi-muc-dich', 'I went to the bank to pay a bill.', null, 'Tôi ra ngân hàng để thanh toán một hoá đơn.', 0),
('en:a2:to-v-chi-muc-dich', 'She called me to explain the delay.', null, 'Cô ấy gọi cho tôi để giải thích về sự chậm trễ.', 1),
('en:a2:to-v-chi-muc-dich', 'We left early in order to avoid the traffic.', null, 'Chúng tôi đi sớm để tránh tắc đường.', 2),

('en:a2:cau-dieu-kien-loai-0', 'If you heat water to one hundred degrees, it boils.', null, 'Nếu đun nước đến một trăm độ thì nước sôi.', 0),
('en:a2:cau-dieu-kien-loai-0', 'If the machine stops, the red light comes on.', null, 'Nếu máy dừng thì đèn đỏ bật lên.', 1),
('en:a2:cau-dieu-kien-loai-0', 'I get a headache if I skip breakfast.', null, 'Tôi bị đau đầu nếu bỏ bữa sáng.', 2),

('en:a2:modal-verbs-can-could', 'I can swim, but I can''t dive.', null, 'Tôi biết bơi nhưng không biết lặn.', 0),
('en:a2:modal-verbs-can-could', 'She could read when she was four.', null, 'Cô ấy biết đọc từ khi bốn tuổi.', 1),
('en:a2:modal-verbs-can-could', 'Could you send me the file, please?', null, 'Bạn gửi giúp tôi tệp đó được không?', 2),

('en:a2:modal-verbs-may-might', 'She may be in a meeting now.', null, 'Bây giờ có thể cô ấy đang họp.', 0),
('en:a2:modal-verbs-may-might', 'We might go to Sa Pa in December.', null, 'Tháng Mười hai có thể chúng tôi sẽ đi Sa Pa.', 1),
('en:a2:modal-verbs-may-might', 'He might not come to the meeting.', null, 'Có thể anh ấy sẽ không đến cuộc họp.', 2),

('en:a2:modal-verbs-should-advice', 'You should drink more water.', null, 'Bạn nên uống nhiều nước hơn.', 0),
('en:a2:modal-verbs-should-advice', 'We shouldn''t leave the office so late.', null, 'Chúng ta không nên rời văn phòng muộn như vậy.', 1),
('en:a2:modal-verbs-should-advice', 'What should I bring to the interview?', null, 'Tôi nên mang gì đến buổi phỏng vấn?', 2),

('en:a2:modal-verbs-must-have-to', 'I must finish this report tonight.', null, 'Tối nay tôi phải làm xong báo cáo này.', 0),
('en:a2:modal-verbs-must-have-to', 'Students have to wear a uniform.', null, 'Học sinh phải mặc đồng phục.', 1),
('en:a2:modal-verbs-must-have-to', 'You mustn''t use your phone here.', null, 'Bạn không được dùng điện thoại ở đây.', 2),
('en:a2:modal-verbs-must-have-to', 'You don''t have to pay today.', null, 'Hôm nay bạn không nhất thiết phải trả tiền.', 3),

('en:a2:cum-dong-tu-thong-dung', 'I get up at six every day.', null, 'Ngày nào tôi cũng dậy lúc sáu giờ.', 0),
('en:a2:cum-dong-tu-thong-dung', 'She looks after her younger brother.', null, 'Cô ấy chăm em trai.', 1),
('en:a2:cum-dong-tu-thong-dung', 'We had to call off the meeting.', null, 'Chúng tôi phải huỷ cuộc họp.', 2),

('en:a2:danh-tu-dem-duoc-va-khong-dem-duoc', 'There is some rice left.', null, 'Vẫn còn một ít cơm.', 0),
('en:a2:danh-tu-dem-duoc-va-khong-dem-duoc', 'We don''t have any eggs.', null, 'Chúng ta không còn quả trứng nào.', 1),
('en:a2:danh-tu-dem-duoc-va-khong-dem-duoc', 'How much money do you need?', null, 'Bạn cần bao nhiêu tiền?', 2),
('en:a2:danh-tu-dem-duoc-va-khong-dem-duoc', 'He gave me a useful piece of advice.', null, 'Anh ấy cho tôi một lời khuyên hữu ích.', 3),

('en:a2:luong-tu-a-few-a-little-enough', 'I have a few questions about the plan.', null, 'Tôi có vài câu hỏi về kế hoạch.', 0),
('en:a2:luong-tu-a-few-a-little-enough', 'There is a little sugar in the jar.', null, 'Trong lọ còn một chút đường.', 1),
('en:a2:luong-tu-a-few-a-little-enough', 'We don''t have enough chairs for everyone.', null, 'Chúng ta không đủ ghế cho mọi người.', 2),

('en:a2:tinh-tu-duoi-ed-va-ing', 'The lesson was interesting.', null, 'Bài học rất thú vị.', 0),
('en:a2:tinh-tu-duoi-ed-va-ing', 'I am interested in history.', null, 'Tôi quan tâm đến lịch sử.', 1),
('en:a2:tinh-tu-duoi-ed-va-ing', 'The children were bored during the trip.', null, 'Bọn trẻ thấy chán trong chuyến đi.', 2),
('en:a2:tinh-tu-duoi-ed-va-ing', 'That film was really boring.', null, 'Bộ phim đó thực sự nhàm chán.', 3),

('en:a2:comparative-short-adjectives', 'This bag is cheaper than that one.', null, 'Cái túi này rẻ hơn cái kia.', 0),
('en:a2:comparative-short-adjectives', 'Today is hotter than yesterday.', null, 'Hôm nay nóng hơn hôm qua.', 1),
('en:a2:comparative-short-adjectives', 'My new laptop is better than the old one.', null, 'Máy tính mới của tôi tốt hơn máy cũ.', 2),

('en:a2:comparative-long-adjectives', 'This route is more dangerous than the main road.', null, 'Tuyến đường này nguy hiểm hơn đường chính.', 0),
('en:a2:comparative-long-adjectives', 'Her explanation was more useful than mine.', null, 'Lời giải thích của cô ấy hữu ích hơn của tôi.', 1),
('en:a2:comparative-long-adjectives', 'The second test was less difficult than the first.', null, 'Bài kiểm tra thứ hai ít khó hơn bài đầu.', 2),

('en:a2:superlative-adjectives', 'This is the cheapest room in the hotel.', null, 'Đây là phòng rẻ nhất khách sạn.', 0),
('en:a2:superlative-adjectives', 'He is the most careful driver in our team.', null, 'Anh ấy là người lái xe cẩn thận nhất nhóm.', 1),
('en:a2:superlative-adjectives', 'That was the worst meal of the trip.', null, 'Đó là bữa ăn tệ nhất chuyến đi.', 2),

('en:a2:trang-tu-chi-cach-thuc', 'She speaks English very well.', null, 'Cô ấy nói tiếng Anh rất tốt.', 0),
('en:a2:trang-tu-chi-cach-thuc', 'Please read the contract carefully.', null, 'Xin đọc hợp đồng thật cẩn thận.', 1),
('en:a2:trang-tu-chi-cach-thuc', 'He finished the task quickly.', null, 'Anh ấy hoàn thành công việc nhanh chóng.', 2),

('en:a2:trang-tu-tan-suat-va-vi-tri', 'I always check my email in the morning.', null, 'Buổi sáng tôi luôn kiểm tra email.', 0),
('en:a2:trang-tu-tan-suat-va-vi-tri', 'She is never late for class.', null, 'Cô ấy không bao giờ đến lớp muộn.', 1),
('en:a2:trang-tu-tan-suat-va-vi-tri', 'We usually have lunch at noon.', null, 'Chúng tôi thường ăn trưa lúc mười hai giờ.', 2),
('en:a2:trang-tu-tan-suat-va-vi-tri', 'He goes to the gym twice a week.', null, 'Anh ấy đến phòng tập hai lần một tuần.', 3),

('en:a2:tu-nhan-manh-muc-do', 'The exam was really difficult.', null, 'Kỳ thi thực sự khó.', 0),
('en:a2:tu-nhan-manh-muc-do', 'This room is quite small.', null, 'Căn phòng này khá nhỏ.', 1),
('en:a2:tu-nhan-manh-muc-do', 'I am a bit tired today.', null, 'Hôm nay tôi hơi mệt.', 2),

('en:a2:gioi-tu-chi-chuyen-dong', 'We walked across the bridge.', null, 'Chúng tôi đi bộ qua cầu.', 0),
('en:a2:gioi-tu-chi-chuyen-dong', 'She ran into the room.', null, 'Cô ấy chạy vào phòng.', 1),
('en:a2:gioi-tu-chi-chuyen-dong', 'They arrived in Hanoi at midnight.', null, 'Họ đến Hà Nội lúc nửa đêm.', 2),
('en:a2:gioi-tu-chi-chuyen-dong', 'I went home straight after work.', null, 'Tôi về thẳng nhà sau giờ làm.', 3),

-- B1 examples
('en:b1:hien-tai-hoan-thanh-trai-nghiem', 'I have been to Japan twice.', null, 'Tôi đã đến Nhật Bản hai lần.', 0),
('en:b1:hien-tai-hoan-thanh-trai-nghiem', 'Have you ever worked night shifts?', null, 'Bạn đã bao giờ làm ca đêm chưa?', 1),
('en:b1:hien-tai-hoan-thanh-trai-nghiem', 'She has never eaten durian.', null, 'Cô ấy chưa bao giờ ăn sầu riêng.', 2),
('en:b1:hien-tai-hoan-thanh-trai-nghiem', 'We have seen that film before.', null, 'Chúng tôi đã xem bộ phim đó rồi.', 3),

('en:b1:hien-tai-hoan-thanh-since-for', 'I have worked here for three years.', null, 'Tôi làm ở đây được ba năm.', 0),
('en:b1:hien-tai-hoan-thanh-since-for', 'She has lived in Hue since 2019.', null, 'Cô ấy sống ở Huế từ năm 2019.', 1),
('en:b1:hien-tai-hoan-thanh-since-for', 'How long have you known him?', null, 'Bạn quen anh ấy bao lâu rồi?', 2),

('en:b1:hien-tai-hoan-thanh-already-yet-just', 'I have just sent you the file.', null, 'Tôi vừa gửi tệp cho bạn.', 0),
('en:b1:hien-tai-hoan-thanh-already-yet-just', 'They have already signed the contract.', null, 'Họ đã ký hợp đồng rồi.', 1),
('en:b1:hien-tai-hoan-thanh-already-yet-just', 'She hasn''t replied to my email yet.', null, 'Cô ấy vẫn chưa trả lời email của tôi.', 2),
('en:b1:hien-tai-hoan-thanh-already-yet-just', 'Have you finished the report yet?', null, 'Bạn làm xong báo cáo chưa?', 3),

('en:b1:hien-tai-hoan-thanh-vs-qua-khu-don', 'I have lost my keys, so I can''t get in.', null, 'Tôi làm mất chìa khoá nên không vào được.', 0),
('en:b1:hien-tai-hoan-thanh-vs-qua-khu-don', 'I lost my keys last Tuesday.', null, 'Tôi làm mất chìa khoá hôm thứ Ba tuần trước.', 1),
('en:b1:hien-tai-hoan-thanh-vs-qua-khu-don', 'She has changed jobs three times.', null, 'Cô ấy đã đổi việc ba lần.', 2),
('en:b1:hien-tai-hoan-thanh-vs-qua-khu-don', 'When did you move to this city?', null, 'Bạn chuyển đến thành phố này khi nào?', 3),

('en:b1:qua-khu-hoan-thanh', 'When I arrived, the meeting had already started.', null, 'Khi tôi đến thì cuộc họp đã bắt đầu.', 0),
('en:b1:qua-khu-hoan-thanh', 'She had left the office before the rain came.', null, 'Cô ấy rời văn phòng trước khi trời mưa.', 1),
('en:b1:qua-khu-hoan-thanh', 'They couldn''t enter because they had lost the key.', null, 'Họ không vào được vì đã làm mất chìa khoá.', 2),

('en:b1:would-thoi-quen-qua-khu', 'Every summer we would visit our grandparents.', null, 'Mùa hè nào chúng tôi cũng về thăm ông bà.', 0),
('en:b1:would-thoi-quen-qua-khu', 'My father would read the newspaper after dinner.', null, 'Bố tôi hay đọc báo sau bữa tối.', 1),
('en:b1:would-thoi-quen-qua-khu', 'When I was a student, I would study late at night.', null, 'Hồi còn là sinh viên, tôi hay học khuya.', 2),

('en:b1:tuong-lai-tiep-dien', 'This time next week I will be working in Da Nang.', null, 'Giờ này tuần sau tôi sẽ đang làm việc ở Đà Nẵng.', 0),
('en:b1:tuong-lai-tiep-dien', 'Don''t call at eight; we will be having dinner.', null, 'Đừng gọi lúc tám giờ, lúc đó chúng tôi đang ăn tối.', 1),
('en:b1:tuong-lai-tiep-dien', 'Will you be using the car tomorrow?', null, 'Mai bạn có dùng xe không?', 2),

('en:b1:cau-dieu-kien-loai-1', 'If it rains, we will stay at home.', null, 'Nếu trời mưa thì chúng tôi ở nhà.', 0),
('en:b1:cau-dieu-kien-loai-1', 'If you send the form today, we can process it tomorrow.', null, 'Nếu hôm nay bạn gửi biểu mẫu thì mai chúng tôi xử lý được.', 1),
('en:b1:cau-dieu-kien-loai-1', 'Unless she calls, I will go without her.', null, 'Nếu cô ấy không gọi thì tôi đi một mình.', 2),

('en:b1:cau-dieu-kien-loai-2', 'If I had more time, I would learn Spanish.', null, 'Nếu có nhiều thời gian hơn thì tôi sẽ học tiếng Tây Ban Nha.', 0),
('en:b1:cau-dieu-kien-loai-2', 'If I were you, I would tell the manager.', null, 'Nếu tôi là bạn thì tôi sẽ nói với quản lý.', 1),
('en:b1:cau-dieu-kien-loai-2', 'She would travel more if she had a better job.', null, 'Cô ấy sẽ đi du lịch nhiều hơn nếu có công việc tốt hơn.', 2),

('en:b1:cau-dieu-kien-loai-3', 'If I had studied harder, I would have passed.', null, 'Nếu tôi học chăm hơn thì đã đỗ rồi.', 0),
('en:b1:cau-dieu-kien-loai-3', 'If we had left earlier, we would not have missed the train.', null, 'Nếu chúng tôi đi sớm hơn thì đã không lỡ tàu.', 1),
('en:b1:cau-dieu-kien-loai-3', 'She might have won if she had trained for longer.', null, 'Cô ấy có thể đã thắng nếu tập luyện lâu hơn.', 2),

('en:b1:cau-bi-dong-hien-tai-va-qua-khu-don', 'The office is cleaned every evening.', null, 'Văn phòng được dọn mỗi tối.', 0),
('en:b1:cau-bi-dong-hien-tai-va-qua-khu-don', 'The letters were sent yesterday.', null, 'Các lá thư đã được gửi hôm qua.', 1),
('en:b1:cau-bi-dong-hien-tai-va-qua-khu-don', 'This bridge was built in 1998.', null, 'Cây cầu này được xây năm 1998.', 2),

('en:b1:cau-bi-dong-dong-tu-khiem-khuyet', 'The form must be signed by the manager.', null, 'Biểu mẫu phải được quản lý ký.', 0),
('en:b1:cau-bi-dong-dong-tu-khiem-khuyet', 'This file can be opened on any computer.', null, 'Tệp này mở được trên mọi máy tính.', 1),
('en:b1:cau-bi-dong-dong-tu-khiem-khuyet', 'The machine must not be used without training.', null, 'Không được dùng máy khi chưa được huấn luyện.', 2),

('en:b1:menh-de-quan-he-xac-dinh', 'The man who called you is waiting outside.', null, 'Người đàn ông gọi cho bạn đang đợi bên ngoài.', 0),
('en:b1:menh-de-quan-he-xac-dinh', 'This is the report which explains the delay.', null, 'Đây là báo cáo giải thích về sự chậm trễ.', 1),
('en:b1:menh-de-quan-he-xac-dinh', 'The book I bought last week is very useful.', null, 'Quyển sách tôi mua tuần trước rất hữu ích.', 2),
('en:b1:menh-de-quan-he-xac-dinh', 'That is the café where we first met.', null, 'Đó là quán cà phê nơi chúng tôi gặp nhau lần đầu.', 3),

('en:b1:menh-de-quan-he-khong-xac-dinh', 'My sister, who lives in Hue, is a nurse.', null, 'Chị tôi, người sống ở Huế, là y tá.', 0),
('en:b1:menh-de-quan-he-khong-xac-dinh', 'The new office, which opened in March, is much larger.', null, 'Văn phòng mới, mở cửa hồi tháng Ba, rộng hơn nhiều.', 1),
('en:b1:menh-de-quan-he-khong-xac-dinh', 'He arrived an hour late, which annoyed everyone.', null, 'Anh ta đến muộn một tiếng, điều đó làm mọi người khó chịu.', 2),

('en:b1:cau-tuong-thuat-tran-thuat', 'She told me that she was busy.', null, 'Cô ấy nói với tôi rằng cô ấy bận.', 0),
('en:b1:cau-tuong-thuat-tran-thuat', 'He said he would call the next day.', null, 'Anh ấy nói hôm sau sẽ gọi.', 1),
('en:b1:cau-tuong-thuat-tran-thuat', 'They said they had finished the work.', null, 'Họ nói đã làm xong công việc.', 2),

('en:b1:cau-tuong-thuat-cau-hoi-va-menh-lenh', 'He asked me where I lived.', null, 'Anh ấy hỏi tôi sống ở đâu.', 0),
('en:b1:cau-tuong-thuat-cau-hoi-va-menh-lenh', 'She asked if I had finished the report.', null, 'Cô ấy hỏi tôi đã làm xong báo cáo chưa.', 1),
('en:b1:cau-tuong-thuat-cau-hoi-va-menh-lenh', 'The doctor told me to rest for a week.', null, 'Bác sĩ bảo tôi nghỉ một tuần.', 2),
('en:b1:cau-tuong-thuat-cau-hoi-va-menh-lenh', 'He told us not to touch the machine.', null, 'Anh ấy bảo chúng tôi đừng động vào máy.', 3),

('en:b1:modal-suy-doan-must-cant', 'The lights are on, so they must be at home.', null, 'Đèn đang bật nên chắc chắn họ ở nhà.', 0),
('en:b1:modal-suy-doan-must-cant', 'She can''t be at the office; it is Sunday.', null, 'Cô ấy không thể ở văn phòng được, hôm nay là Chủ nhật.', 1),
('en:b1:modal-suy-doan-must-cant', 'He might be stuck in traffic.', null, 'Có thể anh ấy đang kẹt xe.', 2),

('en:b1:modal-hoan-thanh-should-have', 'I should have told her earlier.', null, 'Lẽ ra tôi nên nói với cô ấy sớm hơn.', 0),
('en:b1:modal-hoan-thanh-should-have', 'You shouldn''t have signed without reading it.', null, 'Lẽ ra bạn không nên ký khi chưa đọc.', 1),
('en:b1:modal-hoan-thanh-should-have', 'They might have taken the wrong road.', null, 'Có thể họ đã đi nhầm đường.', 2),

('en:b1:cum-dong-tu-tach-duoc', 'Please turn off the lights.', null, 'Làm ơn tắt đèn.', 0),
('en:b1:cum-dong-tu-tach-duoc', 'Please turn them off before you leave.', null, 'Làm ơn tắt đi trước khi bạn về.', 1),
('en:b1:cum-dong-tu-tach-duoc', 'I will pick you up at seven.', null, 'Bảy giờ tôi sẽ đón bạn.', 2),
('en:b1:cum-dong-tu-tach-duoc', 'She looks after him every weekend.', null, 'Cuối tuần nào cô ấy cũng chăm anh ấy.', 3),

('en:b1:luong-tu-all-most-both', 'Most students prefer online classes.', null, 'Phần lớn sinh viên thích lớp học trực tuyến.', 0),
('en:b1:luong-tu-all-most-both', 'Most of the students in my class work part time.', null, 'Phần lớn sinh viên lớp tôi làm việc bán thời gian.', 1),
('en:b1:luong-tu-all-most-both', 'Both of my parents are teachers.', null, 'Bố mẹ tôi đều là giáo viên.', 2),
('en:b1:luong-tu-all-most-both', 'None of the applicants had the right experience.', null, 'Không ứng viên nào có kinh nghiệm phù hợp.', 3),

('en:b1:so-sanh-trang-tu', 'He drives more carefully than his brother.', null, 'Anh ấy lái xe cẩn thận hơn em trai.', 0),
('en:b1:so-sanh-trang-tu', 'She finished the test the fastest.', null, 'Cô ấy làm xong bài kiểm tra nhanh nhất.', 1),
('en:b1:so-sanh-trang-tu', 'This machine runs better than the old one.', null, 'Máy này chạy tốt hơn máy cũ.', 2),

('en:b1:too-enough-so-that', 'The box is too heavy to carry alone.', null, 'Cái thùng nặng quá, một mình không bê nổi.', 0),
('en:b1:too-enough-so-that', 'She is old enough to work.', null, 'Cô ấy đủ tuổi đi làm.', 1),
('en:b1:too-enough-so-that', 'The room was so cold that we left early.', null, 'Căn phòng lạnh đến mức chúng tôi về sớm.', 2),

('en:b1:cau-hoi-duoi', 'You work in marketing, don''t you?', null, 'Bạn làm bên marketing phải không?', 0),
('en:b1:cau-hoi-duoi', 'She hasn''t called yet, has she?', null, 'Cô ấy vẫn chưa gọi phải không?', 1),
('en:b1:cau-hoi-duoi', 'They went to Hue last year, didn''t they?', null, 'Năm ngoái họ đi Huế phải không?', 2),
('en:b1:cau-hoi-duoi', 'Close the window, will you?', null, 'Đóng cửa sổ lại giúp tôi nhé?', 3),

-- B2 examples
('en:b2:hien-tai-hoan-thanh-tiep-dien', 'I have been working on this report all morning.', null, 'Tôi làm báo cáo này suốt cả sáng.', 0),
('en:b2:hien-tai-hoan-thanh-tiep-dien', 'Her eyes are red. She has been crying.', null, 'Mắt cô ấy đỏ. Cô ấy vừa khóc.', 1),
('en:b2:hien-tai-hoan-thanh-tiep-dien', 'They have been waiting for an answer since Monday.', null, 'Họ chờ câu trả lời từ thứ Hai đến giờ.', 2),
('en:b2:hien-tai-hoan-thanh-tiep-dien', 'How long have you been learning English?', null, 'Bạn học tiếng Anh được bao lâu rồi?', 3),

('en:b2:qua-khu-hoan-thanh-tiep-dien', 'He was tired because he had been working all night.', null, 'Anh ấy mệt vì đã làm việc suốt đêm.', 0),
('en:b2:qua-khu-hoan-thanh-tiep-dien', 'The ground was wet; it had been raining for hours.', null, 'Mặt đất ướt, trời đã mưa mấy tiếng liền.', 1),
('en:b2:qua-khu-hoan-thanh-tiep-dien', 'She had been studying for three years before she moved abroad.', null, 'Cô ấy đã học ba năm trước khi ra nước ngoài.', 2),

('en:b2:phoi-hop-thi-khi-ke-chuyen', 'It was raining when I left the office.', null, 'Trời đang mưa khi tôi rời văn phòng.', 0),
('en:b2:phoi-hop-thi-khi-ke-chuyen', 'I got to the station, but the train had already gone.', null, 'Tôi đến ga nhưng tàu đã đi mất.', 1),
('en:b2:phoi-hop-thi-khi-ke-chuyen', 'While we were waiting, the manager called to explain.', null, 'Trong lúc chúng tôi đợi, quản lý gọi đến giải thích.', 2),
('en:b2:phoi-hop-thi-khi-ke-chuyen', 'By the time the rain stopped, everyone had gone home.', null, 'Đến lúc mưa tạnh thì mọi người đã về hết.', 3),

('en:b2:tuong-lai-hoan-thanh', 'I will have finished the report by Friday.', null, 'Tôi sẽ làm xong báo cáo trước thứ Sáu.', 0),
('en:b2:tuong-lai-hoan-thanh', 'By the time you arrive, we will have packed everything.', null, 'Đến lúc bạn tới thì chúng tôi đã đóng gói xong hết.', 1),
('en:b2:tuong-lai-hoan-thanh', 'They will have moved to the new office by May.', null, 'Họ sẽ chuyển sang văn phòng mới trước tháng Năm.', 2),

('en:b2:tuong-lai-hoan-thanh-tiep-dien', 'By next June, I will have been working here for ten years.', null, 'Đến tháng Sáu năm sau, tôi sẽ làm ở đây được mười năm.', 0),
('en:b2:tuong-lai-hoan-thanh-tiep-dien', 'By midnight, they will have been driving for eight hours.', null, 'Đến nửa đêm, họ sẽ lái xe liên tục được tám tiếng.', 1),
('en:b2:tuong-lai-hoan-thanh-tiep-dien', 'In September she will have been studying Chinese for two years.', null, 'Tháng Chín này cô ấy sẽ học tiếng Trung được hai năm.', 2),

('en:b2:cau-dieu-kien-hon-hop', 'If I had studied medicine, I would be a doctor now.', null, 'Nếu ngày trước tôi học y thì bây giờ tôi đã là bác sĩ.', 0),
('en:b2:cau-dieu-kien-hon-hop', 'If she were more careful, she would not have lost the file.', null, 'Nếu cô ấy cẩn thận hơn thì đã không làm mất tệp đó.', 1),
('en:b2:cau-dieu-kien-hon-hop', 'If they had left earlier, they would be here already.', null, 'Nếu họ đi sớm hơn thì giờ đã có mặt ở đây.', 2),

('en:b2:wish-va-if-only', 'I wish I were taller.', null, 'Tôi ước mình cao hơn.', 0),
('en:b2:wish-va-if-only', 'She wishes she had taken that job.', null, 'Cô ấy ước gì đã nhận công việc đó.', 1),
('en:b2:wish-va-if-only', 'I wish he would stop interrupting me.', null, 'Tôi ước gì anh ta thôi ngắt lời tôi.', 2),
('en:b2:wish-va-if-only', 'If only we had booked the tickets earlier.', null, 'Giá như chúng tôi đặt vé sớm hơn.', 3),

('en:b2:cau-bi-dong-day-du', 'The road is being repaired this week.', null, 'Tuần này con đường đang được sửa.', 0),
('en:b2:cau-bi-dong-day-du', 'The results have been published on the website.', null, 'Kết quả đã được đăng trên trang web.', 1),
('en:b2:cau-bi-dong-day-du', 'The contract will be signed tomorrow.', null, 'Hợp đồng sẽ được ký vào ngày mai.', 2),
('en:b2:cau-bi-dong-day-du', 'She was given a prize for her research.', null, 'Cô ấy được trao giải thưởng cho nghiên cứu của mình.', 3),

('en:b2:cau-bi-dong-voi-dong-tu-tuong-thuat', 'It is said that the factory will close next year.', null, 'Người ta nói nhà máy sẽ đóng cửa vào năm sau.', 0),
('en:b2:cau-bi-dong-voi-dong-tu-tuong-thuat', 'He is believed to live abroad.', null, 'Người ta tin rằng ông ấy sống ở nước ngoài.', 1),
('en:b2:cau-bi-dong-voi-dong-tu-tuong-thuat', 'The company is reported to have lost two major clients.', null, 'Có tin công ty đã mất hai khách hàng lớn.', 2),

('en:b2:menh-de-quan-he-rut-gon', 'The man waiting outside is my colleague.', null, 'Người đàn ông đang đợi bên ngoài là đồng nghiệp của tôi.', 0),
('en:b2:menh-de-quan-he-rut-gon', 'The report written last week is on your desk.', null, 'Bản báo cáo viết tuần trước ở trên bàn bạn.', 1),
('en:b2:menh-de-quan-he-rut-gon', 'She was the first person to arrive.', null, 'Cô ấy là người đến đầu tiên.', 2),
('en:b2:menh-de-quan-he-rut-gon', 'The questions asked in the test were quite easy.', null, 'Các câu hỏi trong bài kiểm tra khá dễ.', 3),

('en:b2:menh-de-quan-he-voi-gioi-tu', 'This is the colleague with whom I worked in Da Nang.', null, 'Đây là đồng nghiệp tôi từng làm việc cùng ở Đà Nẵng.', 0),
('en:b2:menh-de-quan-he-voi-gioi-tu', 'That is the project I told you about.', null, 'Đó là dự án tôi đã kể với bạn.', 1),
('en:b2:menh-de-quan-he-voi-gioi-tu', 'We visited a company whose products we had tested.', null, 'Chúng tôi đến thăm một công ty mà sản phẩm của họ chúng tôi đã thử nghiệm.', 2),
('en:b2:menh-de-quan-he-voi-gioi-tu', 'The staff, many of whom were new, needed training.', null, 'Nhân viên, phần lớn là người mới, cần được đào tạo.', 3),

('en:b2:modal-hoan-thanh-cant-have-neednt-have', 'She can''t have seen us; it was too dark.', null, 'Cô ấy không thể nhìn thấy chúng tôi, trời quá tối.', 0),
('en:b2:modal-hoan-thanh-cant-have-neednt-have', 'I needn''t have booked a table; the restaurant was empty.', null, 'Tôi đặt bàn làm gì, nhà hàng vắng tanh.', 1),
('en:b2:modal-hoan-thanh-cant-have-neednt-have', 'We didn''t need to pay for parking.', null, 'Chúng tôi không phải trả phí gửi xe.', 2),

('en:b2:mao-tu-voi-danh-tu-truu-tuong', 'Technology has changed the way we work.', null, 'Công nghệ đã thay đổi cách chúng ta làm việc.', 0),
('en:b2:mao-tu-voi-danh-tu-truu-tuong', 'The education of young children is a national priority.', null, 'Việc giáo dục trẻ nhỏ là ưu tiên quốc gia.', 1),
('en:b2:mao-tu-voi-danh-tu-truu-tuong', 'He has a good understanding of the problem.', null, 'Anh ấy hiểu rõ vấn đề.', 2),

('en:b2:trang-tu-chi-thai-do', 'Apparently, the meeting has been cancelled.', null, 'Nghe nói cuộc họp đã bị huỷ.', 0),
('en:b2:trang-tu-chi-thai-do', 'Fortunately, no one was injured.', null, 'May mắn là không ai bị thương.', 1),
('en:b2:trang-tu-chi-thai-do', 'She clearly did not read the instructions.', null, 'Rõ ràng cô ấy đã không đọc hướng dẫn.', 2),

('en:b2:ket-hop-tu-nhan-manh', 'The team was absolutely exhausted after the trip.', null, 'Cả đội kiệt sức sau chuyến đi.', 0),
('en:b2:ket-hop-tu-nhan-manh', 'It is highly unlikely that the price will fall.', null, 'Rất khó có khả năng giá sẽ giảm.', 1),
('en:b2:ket-hop-tu-nhan-manh', 'We were bitterly disappointed by the result.', null, 'Chúng tôi vô cùng thất vọng với kết quả.', 2),
('en:b2:ket-hop-tu-nhan-manh', 'The instructions were perfectly clear.', null, 'Hướng dẫn hoàn toàn rõ ràng.', 3);

insert into supabase_migrations.schema_migrations (version, name)
values ('20260926000001', 'grammar_en_rewrite')
on conflict (version) do nothing;
