-- 0069_grammar_en_c1.sql
-- Adds the C1 level of English grammar: 16 points and 75 examples.
--
-- English stopped at B2 after 0066. The C1 list of the British Council / EAQUALS Core
-- Inventory for General English (2011) names one new structure, inversion after negative
-- adverbials, and otherwise revisits B2 points. The remaining points come from the C1
-- listing of British Council LearnEnglish, cross-checked against 0066 so that nothing
-- already taught at B2 or below is repeated: mixed conditionals, wish, the reporting
-- passive, reduced relative clauses and can't have / needn't have stay where they are.
-- Neither source has an open licence, so only their point labels are used. Every
-- Vietnamese explanation and every example sentence below is written for this project.
--   https://www.eaquals.org/wp-content/uploads/EAQUALS_British_Council_Core_Curriculum_April2011.pdf
--   https://learnenglish.britishcouncil.org/free-resources/grammar/c1
--
-- Counts after this migration: A1 17, A2 28, B1 23, B2 15, C1 16; 99 points and 371
-- examples. No row outside the id prefix en:c1: is read or written.
--
-- TO ROLL BACK: delete from lex.grammar_points where id like 'en:c1:%'; the examples go
-- with them through on delete cascade.

insert into lex.grammar_points
  (id, lang, level_scheme, level, category_vi, title_vi, pattern, explanation_vi, common_mistake_vi, sort_order)
values

('en:c1:dao-ngu-sau-trang-ngu-phu-dinh', 'en', 'CEFR', 'C1', 'Đảo ngữ',
 'Đảo ngữ sau trạng ngữ phủ định và hạn định',
 'Never / Rarely / Not only / Only then / Under no circumstances + trợ động từ + S + V | Hardly + had + S + V3, when ... | No sooner + had + S + V3, than ...',
 E'Khi một trạng ngữ mang nghĩa phủ định hoặc hạn định đứng đầu câu, trợ động từ phải đứng trước chủ ngữ theo trật tự của câu hỏi. Cấu trúc này làm câu trang trọng và nhấn mạnh hơn, nên gặp nhiều trong bài phát biểu, văn viết học thuật và báo chí.\n\nNếu câu gốc không có trợ động từ thì thêm do, does hoặc did: "I rarely see him" thành "Rarely do I see him". Với be, chỉ cần đưa be lên trước chủ ngữ.\n\nHardly và scarcely đi với when, no sooner đi với than. Cả hai thường dùng quá khứ hoàn thành để nói một việc xảy ra ngay sau một việc khác.\n\nVới only after, only when và not until, đảo ngữ nằm ở mệnh đề chính chứ không nằm ở mệnh đề theo sau only: "Only when the data arrived did we see the problem". Ngoài văn phong trang trọng, người bản ngữ vẫn nói theo trật tự thường: "We only saw the problem when the data arrived".',
 'Đưa trạng ngữ lên đầu nhưng giữ chủ ngữ trước động từ, vì câu tiếng Việt "Chưa bao giờ tôi thấy" không đổi vị trí từ nào. Kết quả là câu "Never I have seen such a mess" thay cho "Never have I seen such a mess".',
 0),

('en:c1:dao-ngu-trong-cau-dieu-kien', 'en', 'CEFR', 'C1', 'Câu điều kiện',
 'Đảo ngữ trong câu điều kiện',
 'Should + S + V (loại 1) | Were + S + to V / Were it not for + N (loại 2) | Had + S + V3/V-ed (loại 3)',
 E'Trong văn phong trang trọng, if được bỏ đi và trợ động từ đứng đầu mệnh đề điều kiện. Nghĩa của câu không đổi, chỉ có giọng văn gọn và trang trọng hơn.\n\nChỉ ba trợ động từ làm được việc này. Should thay if ở loại 1 và thêm ý "nếu chẳng may": "Should you need help, call reception". Were thay if ở loại 2, đi với to cộng động từ hoặc trong cụm were it not for. Had thay if ở loại 3: "Had I known, I would have come".\n\nDạng phủ định đặt not sau chủ ngữ, không rút gọn vào trợ động từ: "Had we not left early", không phải "Hadn''t we left early".\n\nĐảo ngữ với should rất hay gặp trong email công việc và thông báo, nơi người viết cần lịch sự mà không dài dòng.',
 'Giữ lại if sau khi đã đảo trợ động từ, nên câu mang hai dấu hiệu điều kiện: "If had I known" thay vì "Had I known". Rút gọn not vào trợ động từ cũng sai, vì "Hadn''t she called" chỉ đọc được như một câu hỏi.',
 1),

('en:c1:cau-che-it-is-that', 'en', 'CEFR', 'C1', 'Câu nhấn mạnh',
 'Câu chẻ với It is ... that',
 'It is / was + thành phần được nhấn mạnh + that / who + phần còn lại của câu',
 E'Câu chẻ tách một câu thành hai mệnh đề để dồn trọng tâm vào một thành phần: chủ ngữ, tân ngữ, hoặc trạng ngữ chỉ thời gian hay nơi chốn. Thành phần ấy đứng sau it is hoặc it was, phần còn lại của câu đi sau that.\n\nCấu trúc này thường dùng để sửa một thông tin sai hoặc để đối chiếu: "It was Lan, not Minh, who sent the file". Người nghe được coi là đã biết phần sau that, và thông tin mới chỉ nằm ở thành phần được nhấn.\n\nVới người, dùng who hoặc that. Với vật, thời gian và nơi chốn, dùng that chứ không dùng where hay when.\n\nIt is chia theo thì của câu gốc, và động từ sau that hoà hợp với thành phần được nhấn: "It is the managers who decide", không phải "who decides".',
 'Dịch cấu trúc "chính ... là" từng chữ và dùng where cho nơi chốn, như "It was in Hue where we met". Câu chuẩn là "It was in Hue that we met". Trong văn viết, người học cũng hay bỏ that hoặc who sau chủ ngữ được nhấn: "It was my father taught me".',
 2),

('en:c1:cau-che-what-all', 'en', 'CEFR', 'C1', 'Câu nhấn mạnh',
 'Câu chẻ với What, All và The reason why',
 'What + S + V + is / was + thành phần được nhấn | All (that) + S + V + is / was ... | The reason why + S + V + is that ...',
 E'Câu chẻ mở đầu bằng what đặt phần đã biết lên trước và dành cuối câu cho thông tin mới, nơi người nghe chú ý nhất. "What I need is a quiet room" nhấn vào "a quiet room" mạnh hơn "I need a quiet room".\n\nKhi phần được nhấn là một hành động, động từ sau be ở dạng nguyên mẫu, có hoặc không có to: "What we did was call the police".\n\nAll thay what khi người nói muốn nói "chỉ có thế thôi": "All I want is a day off". The thing is, the problem is và the reason why ... is that dùng để mở đầu một lời giải thích hoặc một lời phản đối nhẹ trong hội thoại.\n\nCâu chẻ với it nhấn một thành phần để đối chiếu với thành phần khác. Câu chẻ với what dựng bối cảnh trước rồi mới đưa ra điểm chính.',
 'Mở câu bằng which hoặc that, vì cả ba từ đều được dịch là "cái mà": "Which I need is more time" sai, "What I need is more time" mới đúng. Một lỗi khác là lặp lại cả mệnh đề sau is, như "What I want is I want to rest".',
 3),

('en:c1:nhan-manh-bang-tro-dong-tu-do', 'en', 'CEFR', 'C1', 'Câu nhấn mạnh',
 'Nhấn mạnh bằng trợ động từ Do, Does, Did',
 'S + do / does / did + V (nguyên mẫu) | S + trợ động từ (nhấn giọng) + V',
 E'Trong câu khẳng định ở hiện tại đơn và quá khứ đơn, thêm do, does hoặc did trước động từ nguyên mẫu để khẳng định mạnh hơn. Khi nói, trợ động từ này được nhấn giọng.\n\nCách dùng phổ biến nhất là phản bác điều người khác vừa nói hoặc vừa nghĩ: "I did send the email, check your spam folder". Nó cũng dùng để thừa nhận một điều trước khi đưa ra ý trái lại: "She does work hard, but her reports are always late".\n\nỞ các thì đã có sẵn trợ động từ, chỉ cần nhấn giọng trợ động từ đó: "I have finished", "She is coming". Những câu này không thêm do.\n\nDo đứng đầu câu mệnh lệnh làm lời mời hoặc lời thúc giục nồng nhiệt hơn: "Do sit down".',
 'Chia động từ chính sau trợ động từ, như "He does works late" hoặc "I did sent it", do thói quen thêm -s và -ed để chỉ ngôi và thì. Trợ động từ đã mang ngôi và thì, nên động từ theo sau luôn ở dạng nguyên mẫu.',
 4),

('en:c1:dua-thanh-phan-len-dau-cau', 'en', 'CEFR', 'C1', 'Câu nhấn mạnh',
 'Đưa thành phần lên đầu câu (Fronting)',
 'Tân ngữ + S + V | Cụm giới từ chỉ nơi chốn + V + S | Cụm tính từ + be + S | Adj / Adv + as / though + S + V',
 E'Tiếng Anh giữ trật tự chủ ngữ, động từ, tân ngữ khá chặt. Đưa một thành phần khác lên đầu câu là cách nối câu với ý vừa nói hoặc tạo đối lập: "Most of the work I can do at home. The meetings I cannot".\n\nKhi cụm giới từ chỉ nơi chốn hoặc hướng đứng đầu và động từ là be hay một động từ chỉ vị trí, chuyển động, chủ ngữ đổi chỗ với động từ: "On the table was a letter". Dạng này gặp trong văn miêu tả và văn kể chuyện.\n\nCụm tính từ đứng đầu cũng kéo theo đảo ngữ với be, thường để giới thiệu một thông tin mới quan trọng: "Particularly worrying is the rise in rents".\n\nTính từ hoặc trạng từ cộng as hoặc though mang nghĩa nhượng bộ như although: "Tired as she was, she finished the report". Từ đứng đầu không có mạo từ và không có so hay very.',
 'Hiểu "Tired as she was" là "vì cô ấy mệt", vì as thường được học với nghĩa nguyên nhân. Ở cấu trúc này as mang nghĩa "dù", nên câu phải dịch là "Dù mệt, cô ấy vẫn làm xong báo cáo". Khi tự viết, người học còn thêm so trước tính từ: "So tired as she was".',
 5),

('en:c1:menh-de-phan-tu-trang-ngu', 'en', 'CEFR', 'C1', 'Mệnh đề phân từ',
 'Mệnh đề phân từ làm trạng ngữ',
 'V-ing ..., S + V | Having + V3/V-ed ..., S + V | V3/V-ed ..., S + V | Not + V-ing ..., S + V',
 E'Mệnh đề phân từ thay cho một mệnh đề trạng ngữ đầy đủ chỉ thời gian, nguyên nhân, điều kiện hoặc kết quả. Nó bỏ liên từ và chủ ngữ, nên câu gọn hơn và mang giọng văn viết.\n\nHiện tại phân từ mang nghĩa chủ động, thường chỉ việc xảy ra cùng lúc hoặc chỉ lý do: "Living near the market, we rarely cook". Having cộng phân từ hai nhấn rằng việc thứ nhất đã xong trước việc thứ hai. Phân từ hai đứng đầu mang nghĩa bị động: "Built in 1880, the church ...".\n\nPhủ định bằng cách đặt not trước phân từ: "Not knowing the address, I called him".\n\nMệnh đề phân từ không có chủ ngữ riêng, nên chủ ngữ ngầm hiểu của nó phải trùng với chủ ngữ mệnh đề chính. Mệnh đề quan hệ rút gọn ở B2 bổ nghĩa cho một danh từ, còn mệnh đề phân từ ở đây bổ nghĩa cho cả mệnh đề chính.',
 'Chủ ngữ của mệnh đề chính không phải là người làm hành động trong mệnh đề phân từ, gọi là dangling participle. Tiếng Việt chấp nhận "Đi qua cầu, gió thổi rất mạnh", nên người học viết "Walking across the bridge, the wind was very strong", và tiếng Anh hiểu câu này là gió đang đi bộ.',
 6),

('en:c1:bi-dong-nguyen-mau-v-ing-have-something-done', 'en', 'CEFR', 'C1', 'Câu bị động',
 'Bị động với to V, V-ing và Have something done',
 'to be / to have been + V3/V-ed | being / having been + V3/V-ed | have / get + O + V3/V-ed',
 E'Bị động không chỉ có ở động từ chia thì. Sau động từ đòi hỏi to cộng nguyên mẫu, dạng bị động là to be cộng phân từ hai: "I expect to be told". Sau động từ hoặc giới từ đòi hỏi V-ing, dạng bị động là being cộng phân từ hai: "She hates being interrupted".\n\nTo have been và having been cộng phân từ hai chỉ việc bị động đã xảy ra trước đó: "He denied having been paid".\n\nHave hoặc get cộng tân ngữ cộng phân từ hai nói về việc người khác làm cho mình, thường là dịch vụ phải trả tiền: "I had my car washed". Cấu trúc này cũng dùng cho chuyện không may xảy đến với mình: "She had her phone stolen".\n\nTrong văn nói, get thay be trong câu bị động, thường cho sự việc bất ngờ hoặc không mong muốn: "He got fired last month".',
 'Nói "I cut my hair yesterday" khi thợ cắt cho mình, vì câu tiếng Việt "tôi đi cắt tóc" không cho biết ai làm. Người bản ngữ hiểu câu đó là tự cắt, còn ý đúng là "I had my hair cut".',
 7),

('en:c1:mau-cau-dong-tu-tuong-thuat', 'en', 'CEFR', 'C1', 'Câu tường thuật',
 'Các mẫu câu với động từ tường thuật',
 'V + to V (agree, refuse, promise) | V + O + to V (advise, warn, persuade) | V + V-ing (deny, admit, recommend) | V + (O) + giới từ + V-ing (accuse of, apologise for, insist on)',
 E'Thay vì lặp lại said và told, văn tường thuật ở trình độ này dùng động từ nói lên chức năng của lời nói: khuyên, từ chối, buộc tội, xin lỗi. Mỗi động từ đi với một mẫu câu riêng.\n\nAgree, refuse, offer, promise, threaten đi với to cộng động từ. Advise, warn, remind, persuade, encourage cần một tân ngữ chỉ người trước to. Deny, admit, recommend đi với V-ing.\n\nMột nhóm khác đi với giới từ rồi V-ing: accuse somebody of, blame somebody for, apologise for, insist on, congratulate somebody on.\n\nSuggest và recommend không nhận mẫu tân ngữ cộng to. Chúng đi với V-ing hoặc với mệnh đề that, trong đó động từ ở dạng nguyên mẫu hoặc có should.',
 'Chuyển mẫu câu của một động từ sang động từ khác có cùng nghĩa trong tiếng Việt. "Đề nghị" và "khuyên" đều dẫn tới việc một người làm gì, nên người học viết "She suggested me to apply" trong khi câu đúng là "She suggested that I apply" hoặc "She suggested applying".',
 8),

('en:c1:qua-khu-gia-dinh-its-time-would-rather', 'en', 'CEFR', 'C1', 'Thể giả định',
 'Quá khứ giả định: It''s time, Would rather, As if',
 'It''s (high / about) time + S + V2/V-ed | S + would rather + S khác + V2/V-ed | as if / as though + S + V2/V-ed (to be dùng were)',
 E'Sau một số cụm từ, thì quá khứ đơn không nói về quá khứ mà nói về điều chưa có thật ở hiện tại, giống cách wish hoạt động ở B2.\n\nIt''s time cộng mệnh đề quá khứ nêu một việc lẽ ra đã phải làm và hàm ý chê trách: "It''s time we left". High và about làm lời chê trách mạnh hơn. It''s time cộng to cộng động từ thì trung tính, chỉ nói đã đến lúc.\n\nWould rather cộng một chủ ngữ khác cộng quá khứ đơn nêu mong muốn về hành động của người khác: "I''d rather you didn''t smoke here". Khi chủ ngữ không đổi, would rather đi thẳng với động từ nguyên mẫu không to: "I''d rather stay home".\n\nAs if và as though đi với quá khứ đơn khi điều được so sánh không đúng sự thật: "He talks as if he owned the company". Khi điều đó có thể đúng, dùng thì hiện tại: "It looks as if it is going to rain".',
 'Chia hiện tại theo thời điểm nói, vì động từ tiếng Việt không mang dấu hiệu thì: "It''s time we go home", "I''d rather you don''t tell her". Kèm theo đó là thêm to sau would rather khi chủ ngữ không đổi, như "I''d rather to walk".',
 9),

('en:c1:the-gia-dinh-sau-suggest-insist', 'en', 'CEFR', 'C1', 'Thể giả định',
 'Thể giả định sau Suggest, Insist và It is essential',
 'S + suggest / insist / recommend / demand + that + S + V (nguyên mẫu) | It is essential / vital / important + that + S + V (nguyên mẫu)',
 E'Sau động từ và tính từ nêu yêu cầu, đề xuất hoặc sự cần thiết, mệnh đề that dùng động từ nguyên mẫu không to cho mọi chủ ngữ. Động từ không thêm -s ở ngôi thứ ba và không lùi thì theo động từ chính.\n\nBe giữ nguyên dạng be: "The committee recommended that the plan be delayed". Phủ định đặt not trước động từ và không dùng do: "We insisted that he not drive".\n\nTiếng Anh Anh thường dùng should cộng động từ nguyên mẫu thay cho thể giả định, nghĩa không đổi: "They suggested that we should wait". Tiếng Anh Mỹ và văn bản pháp lý giữ dạng không có should.\n\nCấu trúc này gặp nhiều trong biên bản họp, quy định và hợp đồng. Từ kích hoạt thường gặp là suggest, recommend, insist, demand, request, propose, cùng các tính từ essential, vital, crucial, necessary.',
 'Chia động từ theo chủ ngữ như câu thường: "The doctor recommended that he takes a week off". Động từ ở đây nêu một yêu cầu chứ không mô tả sự việc, nên dạng đúng là "that he take a week off".',
 10),

('en:c1:muc-do-chac-chan-may-well-bound-to', 'en', 'CEFR', 'C1', 'Động từ khuyết thiếu',
 'Mức độ chắc chắn: May well, Be bound to, Should và Must have been V-ing',
 'S + may / might / could + well + V | S + be bound / likely + to V | S + should + V (điều được kỳ vọng) | S + must / might / can''t + have been + V-ing',
 E'Ở B1 và B2, người học đã dùng must, might và can''t để suy đoán. Ở C1, lựa chọn từ còn phải thể hiện đúng mức độ chắc chắn, từ gần như chắc chắn đến chỉ có khả năng.\n\nWell đặt sau may, might hoặc could nâng khả năng lên: "The price may well rise" nghĩa là giá khá có khả năng tăng. Be bound to nêu điều người nói gần như chắc chắn: "It''s bound to rain". Be likely to và be unlikely to nêu xác suất một cách trung tính, hay gặp trong báo cáo.\n\nShould và ought to còn dùng cho điều được kỳ vọng sẽ xảy ra nếu mọi việc diễn ra bình thường: "The parcel should arrive tomorrow".\n\nMust have been, might have been và can''t have been cộng V-ing suy đoán về một việc đang diễn ra tại một thời điểm trong quá khứ: "She didn''t answer; she must have been driving".',
 'Dùng should cho một dự đoán xấu, như "The flight should be delayed because of the storm", vì cả should lẫn các cách nói suy đoán đều được dịch là "chắc là". Should ở nghĩa này chỉ dành cho điều người nói mong đợi. Với điều không mong muốn, câu cần may well, is likely to hoặc is bound to.',
 11),

('en:c1:tinh-luoc-sau-tro-dong-tu', 'en', 'CEFR', 'C1', 'Tỉnh lược và thay thế',
 'Tỉnh lược sau trợ động từ và To',
 'S + trợ động từ (+ not), phần sau được lược | S + V + to, động từ sau to được lược | S + V ... and / but + V (lược chủ ngữ)',
 E'Tiếng Anh tránh lặp lại một cụm động từ vừa xuất hiện. Câu sau chỉ giữ lại trợ động từ hoặc động từ khuyết thiếu, phần phía sau được lược vì người nghe đã biết: "I can''t swim, but my brother can".\n\nNếu câu trước không có trợ động từ, câu sau dùng do, does hoặc did: "She likes durian, but I don''t". Khi có nhiều trợ động từ, thường giữ lại một hoặc hai trợ động từ đầu: "Has she been told? She should have".\n\nSau want, hope, try, would like, have và ought, to được giữ lại còn động từ sau nó được lược: "I didn''t want to go, but I had to".\n\nTrong câu nối bằng and hoặc but, chủ ngữ trùng nhau được bỏ ở vế sau: "He was born in Hue and grew up in Saigon".',
 'Bỏ luôn trợ động từ, vì câu đáp ngắn tiếng Việt chỉ cần "có" hoặc "không": "She can speak Japanese, but I not" thay vì "but I can''t". Lỗi thứ hai là bỏ to ở cuối câu, như "I didn''t want to, but I had".',
 12),

('en:c1:thay-the-so-not-one-do-so', 'en', 'CEFR', 'C1', 'Tỉnh lược và thay thế',
 'Thay thế bằng So, Not, One và Do so',
 'think / hope / expect / be afraid + so / not | a / the + Adj + one / ones | do so | that / those + of + N',
 E'Phép thay thế dùng một từ ngắn thay cho một mệnh đề, một cụm danh từ hoặc một cụm động từ đã nhắc, để văn bản liền mạch mà không lặp từ.\n\nSo thay cho cả một mệnh đề khẳng định sau think, hope, expect, suppose và be afraid: "Will it rain? I think so". Với hope và be afraid, dạng phủ định là not ("I hope not"). Với think và expect, dạng phủ định thường gặp là "I don''t think so".\n\nOne và ones thay cho một danh từ đếm được đã nhắc, thường sau tính từ hoặc sau this, which: "I prefer the blue one". Danh từ không đếm được không thay bằng one.\n\nTrong văn trang trọng, do so thay cho một cụm động từ: "Staff may leave early if they wish to do so". That of và those of thay cho danh từ trong phép so sánh: "The population of Hue is smaller than that of Da Nang".',
 'Dịch "tôi nghĩ vậy" và "tôi hy vọng là không" từng chữ thành "I think it" và "I hope no". Trong phép so sánh, người học đặt hai thứ khác loại cạnh nhau, như "The climate of Da Lat is cooler than Hanoi" thay vì "than that of Hanoi".',
 13),

('en:c1:danh-tu-hoa', 'en', 'CEFR', 'C1', 'Danh từ',
 'Danh từ hoá (Nominalisation)',
 'the + N (từ động từ / tính từ) + of + N | N + giới từ riêng (increase in, demand for, decision on)',
 E'Danh từ hoá biến một động từ hoặc tính từ thành danh từ, để một hành động được nói tới như một sự vật: "Prices rose sharply" thành "the sharp rise in prices". Đây là đặc trưng của văn viết học thuật, báo cáo và tin tức.\n\nKhi động từ thành danh từ, trạng từ đi kèm thành tính từ, còn chủ ngữ hoặc tân ngữ chuyển thành cụm với of hay một giới từ khác. Mỗi danh từ đi với giới từ riêng cần học kèm: an increase in, a demand for, a decision on, the effect of ... on.\n\nDanh từ hoá gom nhiều ý vào một câu và cho phép đặt cả một sự việc vào vị trí chủ ngữ: "The closure of the factory led to ...". Người thực hiện hành động cũng không cần nêu ra, nên câu mang tính khách quan hơn.\n\nDùng quá nhiều danh từ hoá khiến câu nặng và khó đọc. Trong email và văn nói, động từ thường rõ ràng hơn.',
 'Chọn sai giới từ sau danh từ, vì tiếng Việt dùng "về" hoặc "của" cho hầu hết trường hợp: "an increase of prices", "the demand of housing". Dạng đúng là "an increase in prices" và "the demand for housing".',
 14),

('en:c1:tu-noi-nhuong-bo-va-tuong-phan', 'en', 'CEFR', 'C1', 'Từ nối',
 'Từ nối chỉ sự nhượng bộ và tương phản',
 'although / even though / whereas / while + mệnh đề | despite / in spite of + N / V-ing | Nevertheless / Nonetheless / Even so, S + V | Much as + S + V, ...',
 E'Các từ nối này khác nhau ở loại từ đi sau chúng. Although, even though, while và whereas là liên từ, đi với một mệnh đề đầy đủ. Despite và in spite of là giới từ, đi với danh từ hoặc V-ing, hoặc với the fact that khi cần cả mệnh đề.\n\nNevertheless, nonetheless, even so và however là trạng từ nối. Chúng mở đầu câu thứ hai, sau dấu chấm hoặc dấu chấm phẩy, và không nối hai mệnh đề bằng dấu phẩy.\n\nNhượng bộ và tương phản không giống nhau. Although và despite nêu một điều lẽ ra dẫn tới kết quả ngược lại. Whereas và while đặt hai sự thật cạnh nhau để so sánh: "My brother is tall, whereas I am short".\n\nỞ trình độ này còn có much as với nghĩa "dù rất", albeit trước một tính từ hoặc một cụm từ ("a small, albeit important, change"), và granted that để thừa nhận một ý trước khi phản bác.',
 'Dùng cặp although ... but, vì tiếng Việt nói "tuy ... nhưng" với hai từ nối trong cùng một câu. Tiếng Anh chỉ giữ một trong hai: "Although it rained, we went out" hoặc "It rained, but we went out". Đặt mệnh đề sau despite, như "despite it rained", cũng là lỗi đi cùng.',
 15)

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

-- reviewed-destructive: the owner of the repository asked for the C1 level to be added. The
-- delete is scoped to the en:c1: rows this file inserts, so re-running the file rebuilds
-- them instead of duplicating them; no other example row is touched.
delete from lex.grammar_examples
where grammar_point_id like 'en:c1:%';

-- reading stays null: it carries pinyin, which only the zh rows have.
insert into lex.grammar_examples (grammar_point_id, text, reading, translation_vi, sort_order)
values

('en:c1:dao-ngu-sau-trang-ngu-phu-dinh', 'Never have I seen the Saigon River this high.', null, 'Chưa bao giờ tôi thấy nước sông Sài Gòn lên cao như thế này.', 0),
('en:c1:dao-ngu-sau-trang-ngu-phu-dinh', 'Not only did the new manager cut costs, but she also kept every job.', null, 'Chị quản lý mới không chỉ cắt giảm chi phí mà còn giữ được mọi vị trí việc làm.', 1),
('en:c1:dao-ngu-sau-trang-ngu-phu-dinh', 'Hardly had we sat down when the power went out.', null, 'Chúng tôi vừa ngồi xuống thì mất điện.', 2),
('en:c1:dao-ngu-sau-trang-ngu-phu-dinh', 'Under no circumstances should passwords be sent by email.', null, 'Tuyệt đối không được gửi mật khẩu qua email.', 3),
('en:c1:dao-ngu-sau-trang-ngu-phu-dinh', 'Only after the audit did we realise how much money had been lost.', null, 'Mãi đến sau đợt kiểm toán, chúng tôi mới biết đã thất thoát bao nhiêu tiền.', 4),

('en:c1:dao-ngu-trong-cau-dieu-kien', 'Should you have any questions, please contact our office in Hanoi.', null, 'Nếu có thắc mắc, xin quý vị liên hệ văn phòng của chúng tôi tại Hà Nội.', 0),
('en:c1:dao-ngu-trong-cau-dieu-kien', 'Had I known about the traffic, I would have taken the metro.', null, 'Nếu biết trước là tắc đường thì tôi đã đi tàu điện.', 1),
('en:c1:dao-ngu-trong-cau-dieu-kien', 'Were it not for my sister''s help, I could not run the shop.', null, 'Nếu không có chị gái giúp thì tôi không trông nổi cửa hàng.', 2),
('en:c1:dao-ngu-trong-cau-dieu-kien', 'Had she not checked the contract, the company would have paid twice.', null, 'Nếu cô ấy không kiểm tra hợp đồng thì công ty đã phải trả tiền hai lần.', 3),
('en:c1:dao-ngu-trong-cau-dieu-kien', 'Were the price to rise again, many families would stop buying.', null, 'Nếu giá tăng thêm lần nữa, nhiều gia đình sẽ thôi không mua.', 4),

('en:c1:cau-che-it-is-that', 'It was my grandmother who taught me to cook phở.', null, 'Chính bà tôi là người dạy tôi nấu phở.', 0),
('en:c1:cau-che-it-is-that', 'It is the delivery time, not the price, that customers complain about.', null, 'Khách hàng phàn nàn về thời gian giao hàng chứ không phải về giá.', 1),
('en:c1:cau-che-it-is-that', 'It was in Da Lat that they first met.', null, 'Chính ở Đà Lạt họ gặp nhau lần đầu.', 2),
('en:c1:cau-che-it-is-that', 'It wasn''t until midnight that the last guests left.', null, 'Mãi đến nửa đêm những vị khách cuối cùng mới ra về.', 3),

('en:c1:cau-che-what-all', 'What I need right now is a strong cup of coffee.', null, 'Cái tôi cần lúc này là một ly cà phê thật đậm.', 0),
('en:c1:cau-che-what-all', 'All we asked for was a small discount.', null, 'Chúng tôi chỉ xin giảm giá một chút thôi.', 1),
('en:c1:cau-che-what-all', 'What happened was that the driver took the wrong exit.', null, 'Chuyện là tài xế đi nhầm lối ra.', 2),
('en:c1:cau-che-what-all', 'The reason why I left is that the commute took two hours a day.', null, 'Lý do tôi nghỉ việc là mỗi ngày đi lại mất hai tiếng.', 3),
('en:c1:cau-che-what-all', 'What she did was call every supplier herself.', null, 'Việc cô ấy làm là tự gọi cho từng nhà cung cấp.', 4),

('en:c1:nhan-manh-bang-tro-dong-tu-do', 'I did send you the invoice; it went out on Monday morning.', null, 'Tôi có gửi hoá đơn cho anh rồi mà, gửi từ sáng thứ Hai.', 0),
('en:c1:nhan-manh-bang-tro-dong-tu-do', 'He does talk a lot, but he gets things done.', null, 'Anh ấy nói nhiều thật, nhưng việc gì cũng làm xong.', 1),
('en:c1:nhan-manh-bang-tro-dong-tu-do', 'Do come to the wedding if you are in Can Tho that weekend.', null, 'Cuối tuần đó nếu có ở Cần Thơ thì nhất định đến dự đám cưới nhé.', 2),
('en:c1:nhan-manh-bang-tro-dong-tu-do', 'We do need more staff before Tet.', null, 'Trước Tết chúng tôi thực sự cần thêm người.', 3),

('en:c1:dua-thanh-phan-len-dau-cau', 'Tired as she was, Hoa stayed to help us close the shop.', null, 'Dù mệt, Hoa vẫn ở lại giúp chúng tôi đóng cửa hàng.', 0),
('en:c1:dua-thanh-phan-len-dau-cau', 'Particularly worrying is the number of students who drop out in the first year.', null, 'Đáng lo ngại nhất là số sinh viên bỏ học ngay năm đầu.', 1),
('en:c1:dua-thanh-phan-len-dau-cau', 'At the end of the alley stood a small tea stall.', null, 'Cuối con hẻm có một quán trà nhỏ.', 2),
('en:c1:dua-thanh-phan-len-dau-cau', 'Most of the paperwork I can handle; the tax forms I leave to an accountant.', null, 'Phần lớn giấy tờ tôi tự lo được, còn tờ khai thuế thì tôi nhờ kế toán.', 3),

('en:c1:menh-de-phan-tu-trang-ngu', 'Having finished the report, she sent it to the director.', null, 'Làm xong báo cáo, cô ấy gửi cho giám đốc.', 0),
('en:c1:menh-de-phan-tu-trang-ngu', 'Living next to the market, we rarely plan our meals in advance.', null, 'Vì sống sát chợ nên chúng tôi hiếm khi phải tính trước bữa ăn.', 1),
('en:c1:menh-de-phan-tu-trang-ngu', 'Built in the 1880s, the cathedral is one of the oldest buildings in the city.', null, 'Được xây từ những năm 1880, nhà thờ là một trong những công trình lâu đời nhất thành phố.', 2),
('en:c1:menh-de-phan-tu-trang-ngu', 'Not knowing the way, we followed the other motorbikes.', null, 'Không biết đường, chúng tôi đi theo mấy chiếc xe máy khác.', 3),
('en:c1:menh-de-phan-tu-trang-ngu', 'The bus broke down on the pass, leaving us stranded for three hours.', null, 'Xe buýt chết máy trên đèo, khiến chúng tôi mắc kẹt ba tiếng.', 4),

('en:c1:bi-dong-nguyen-mau-v-ing-have-something-done', 'I had my motorbike serviced before the trip to Ha Giang.', null, 'Tôi mang xe máy đi bảo dưỡng trước chuyến đi Hà Giang.', 0),
('en:c1:bi-dong-nguyen-mau-v-ing-have-something-done', 'Nobody likes being kept waiting at the bank.', null, 'Chẳng ai thích bị bắt chờ ở ngân hàng.', 1),
('en:c1:bi-dong-nguyen-mau-v-ing-have-something-done', 'The new bridge is expected to be completed next year.', null, 'Cây cầu mới dự kiến sẽ hoàn thành vào năm sau.', 2),
('en:c1:bi-dong-nguyen-mau-v-ing-have-something-done', 'She had her wallet stolen on a crowded bus.', null, 'Cô ấy bị móc mất ví trên một chuyến xe buýt đông người.', 3),
('en:c1:bi-dong-nguyen-mau-v-ing-have-something-done', 'He denied having been told about the changes.', null, 'Anh ta khẳng định mình không hề được báo về những thay đổi đó.', 4),

('en:c1:mau-cau-dong-tu-tuong-thuat', 'The landlord refused to lower the rent.', null, 'Chủ nhà từ chối giảm tiền thuê.', 0),
('en:c1:mau-cau-dong-tu-tuong-thuat', 'My doctor advised me to cut down on sugar.', null, 'Bác sĩ khuyên tôi bớt ăn đường.', 1),
('en:c1:mau-cau-dong-tu-tuong-thuat', 'He denied taking the money from the till.', null, 'Anh ta chối là không lấy tiền trong ngăn kéo thu ngân.', 2),
('en:c1:mau-cau-dong-tu-tuong-thuat', 'The customer accused the shop of selling fake goods.', null, 'Vị khách tố cửa hàng bán hàng giả.', 3),
('en:c1:mau-cau-dong-tu-tuong-thuat', 'She insisted on paying for everyone''s lunch.', null, 'Cô ấy nhất quyết trả tiền bữa trưa cho mọi người.', 4),

('en:c1:qua-khu-gia-dinh-its-time-would-rather', 'It''s high time the city built more parks.', null, 'Đã đến lúc thành phố phải xây thêm công viên rồi.', 0),
('en:c1:qua-khu-gia-dinh-its-time-would-rather', 'I''d rather you didn''t mention the price to my parents.', null, 'Tôi mong bạn đừng nhắc đến giá tiền với bố mẹ tôi.', 1),
('en:c1:qua-khu-gia-dinh-its-time-would-rather', 'He spends money as if he were a millionaire.', null, 'Anh ta tiêu tiền như thể mình là triệu phú.', 2),
('en:c1:qua-khu-gia-dinh-its-time-would-rather', 'It''s getting late; it''s time we went home.', null, 'Muộn rồi, đến lúc chúng ta về thôi.', 3),
('en:c1:qua-khu-gia-dinh-its-time-would-rather', 'Would you rather we met at the café instead?', null, 'Hay bạn muốn chúng ta gặp nhau ở quán cà phê?', 4),

('en:c1:the-gia-dinh-sau-suggest-insist', 'The doctor recommended that my father rest for a week.', null, 'Bác sĩ khuyên bố tôi nghỉ ngơi một tuần.', 0),
('en:c1:the-gia-dinh-sau-suggest-insist', 'It is essential that every guest be registered at reception.', null, 'Mọi khách lưu trú đều bắt buộc phải đăng ký tại quầy lễ tân.', 1),
('en:c1:the-gia-dinh-sau-suggest-insist', 'The residents demanded that the construction stop after 10 p.m.', null, 'Cư dân yêu cầu công trình ngừng thi công sau 10 giờ tối.', 2),
('en:c1:the-gia-dinh-sau-suggest-insist', 'She insisted that her son not ride a motorbike without a helmet.', null, 'Bà ấy nhất quyết không cho con trai đi xe máy mà không đội mũ bảo hiểm.', 3),

('en:c1:muc-do-chac-chan-may-well-bound-to', 'The price of rice may well go up after the floods.', null, 'Sau lũ, giá gạo rất có thể sẽ tăng.', 0),
('en:c1:muc-do-chac-chan-may-well-bound-to', 'If you leave your bag there, someone is bound to take it.', null, 'Để túi ở đó thì chắc chắn sẽ có người lấy mất.', 1),
('en:c1:muc-do-chac-chan-may-well-bound-to', 'The documents should be ready by Thursday.', null, 'Giấy tờ chắc sẽ có vào thứ Năm.', 2),
('en:c1:muc-do-chac-chan-may-well-bound-to', 'He didn''t pick up; he must have been riding his motorbike.', null, 'Anh ấy không nghe máy, chắc lúc đó đang chạy xe máy.', 3),
('en:c1:muc-do-chac-chan-may-well-bound-to', 'Interest rates are unlikely to fall this year.', null, 'Lãi suất khó có khả năng giảm trong năm nay.', 4),

('en:c1:tinh-luoc-sau-tro-dong-tu', 'I can''t drive, but my wife can.', null, 'Tôi không biết lái xe, nhưng vợ tôi thì biết.', 0),
('en:c1:tinh-luoc-sau-tro-dong-tu', 'She said she would call, and she did.', null, 'Cô ấy nói sẽ gọi, và cô ấy đã gọi thật.', 1),
('en:c1:tinh-luoc-sau-tro-dong-tu', 'I didn''t want to work on Saturday, but I had to.', null, 'Tôi không muốn làm thứ Bảy, nhưng buộc phải làm.', 2),
('en:c1:tinh-luoc-sau-tro-dong-tu', '"Have you paid the electricity bill?" "I should have, but I forgot."', null, '"Anh đã trả tiền điện chưa?" "Lẽ ra phải trả rồi, nhưng tôi quên mất."', 3),
('en:c1:tinh-luoc-sau-tro-dong-tu', 'He grew up in Nha Trang and now works in Singapore.', null, 'Anh ấy lớn lên ở Nha Trang và giờ làm việc ở Singapore.', 4),

('en:c1:thay-the-so-not-one-do-so', '"Will the shop be open on the holiday?" "I''m afraid not."', null, '"Ngày lễ cửa hàng có mở không?" "E là không."', 0),
('en:c1:thay-the-so-not-one-do-so', '"Is the meeting still at three?" "I think so."', null, '"Cuộc họp vẫn lúc ba giờ chứ?" "Tôi nghĩ vậy."', 1),
('en:c1:thay-the-so-not-one-do-so', 'This laptop is too heavy; do you have a lighter one?', null, 'Cái laptop này nặng quá, anh có cái nào nhẹ hơn không?', 2),
('en:c1:thay-the-so-not-one-do-so', 'The climate of Da Lat is much cooler than that of Nha Trang.', null, 'Khí hậu Đà Lạt mát hơn nhiều so với Nha Trang.', 3),
('en:c1:thay-the-so-not-one-do-so', 'Visitors who wish to take photos may do so after the ceremony.', null, 'Khách tham quan muốn chụp ảnh có thể chụp sau buổi lễ.', 4),

('en:c1:danh-tu-hoa', 'The closure of the factory left two hundred people without work.', null, 'Việc nhà máy đóng cửa khiến hai trăm người mất việc.', 0),
('en:c1:danh-tu-hoa', 'There has been a sharp rise in the price of pork this month.', null, 'Tháng này giá thịt lợn tăng mạnh.', 1),
('en:c1:danh-tu-hoa', 'The decision to raise tuition fees was criticised by parents.', null, 'Quyết định tăng học phí bị phụ huynh chỉ trích.', 2),
('en:c1:danh-tu-hoa', 'Rapid urbanisation has increased the demand for housing in Da Nang.', null, 'Tốc độ đô thị hoá nhanh làm nhu cầu nhà ở tại Đà Nẵng tăng lên.', 3),

('en:c1:tu-noi-nhuong-bo-va-tuong-phan', 'Although the flat is small, it gets a lot of light.', null, 'Căn hộ tuy nhỏ nhưng rất nhiều ánh sáng.', 0),
('en:c1:tu-noi-nhuong-bo-va-tuong-phan', 'Despite having two jobs, she still finds time to study English.', null, 'Dù làm hai công việc, cô ấy vẫn dành thời gian học tiếng Anh.', 1),
('en:c1:tu-noi-nhuong-bo-va-tuong-phan', 'Hanoi has four seasons, whereas Saigon has only a dry season and a rainy season.', null, 'Hà Nội có bốn mùa, còn Sài Gòn chỉ có mùa khô và mùa mưa.', 2),
('en:c1:tu-noi-nhuong-bo-va-tuong-phan', 'The project went over budget. Nevertheless, the board approved the next phase.', null, 'Dự án đã vượt ngân sách. Dù vậy, hội đồng quản trị vẫn duyệt giai đoạn tiếp theo.', 3),
('en:c1:tu-noi-nhuong-bo-va-tuong-phan', 'Much as I enjoy my job, I need a break.', null, 'Dù rất thích công việc của mình, tôi vẫn cần nghỉ một thời gian.', 4);

insert into supabase_migrations.schema_migrations (version, name)
values ('20260926000004', 'grammar_en_c1')
on conflict (version) do nothing;
