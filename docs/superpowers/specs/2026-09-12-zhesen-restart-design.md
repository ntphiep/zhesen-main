# Thiết kế khởi động lại dự án: chesen thành zhesen

Ngày: 2026-09-12. Trạng thái: chờ Hiệp duyệt.
Nhánh làm việc dự kiến: `zhesen`, tách từ `dictionary`.

## 1. Bối cảnh

Dự án `chesen` là web từ điển và học ngôn ngữ đa ngữ (Anh, Tây Ban Nha, Trung; tiếng Việt
là ngôn ngữ nền). Sau bốn lát cắt phát triển, codebase đạt khoảng 8.300 dòng, 194 test
xanh, TypeScript sạch. Tuy nhiên khảo sát cho thấy dự án đã tích tụ hai kiến trúc song
song, một tầng đọc dữ liệu không có kiểm chứng lúc chạy, một cơ chế tìm kiếm không đủ tầm
một từ điển, và một kho dữ liệu thiếu đúng những thứ người dùng cần nhất.

Lần khởi động lại này thu hẹp trọng tâm về ba việc: tra cứu, lưu trữ từ vựng cá nhân, và
ôn tập bằng flashcard. Các tính năng luyện tập khác được giữ nguyên trong mã nguồn nhưng
không được đầu tư thêm trong đợt này.

## 2. Mục tiêu và phi mục tiêu

Mục tiêu của đợt này:

1. Đổi toàn bộ định danh dự án từ `chesen` sang `zhesen`, viết tắt của zh, es, en.
2. Viết lại cấu trúc mã nguồn theo hướng tính năng, giữ lại những module đang tốt.
3. Thay cơ chế tìm kiếm tiền tố bằng một hệ tìm kiếm thật sự: chịu lỗi chính tả, tìm được
   khi gõ thiếu dấu, tìm được tiếng Trung, và tìm theo pinyin.
4. Mở rộng kho từ vựng trong giới hạn dung lượng hiện có, và lấp khoảng trống lớn nhất là
   cụm từ, thành ngữ, cụm từ đi kèm.
5. Chuyển thuật toán ôn tập từ SM-2 tự viết sang FSRS-6.
6. Đưa mọi dữ liệu đến từ bên ngoài qua kiểm chứng Zod lúc chạy.

Phi mục tiêu của đợt này:

1. Không thiết kế lại giao diện. Diện mạo giữ nguyên như hiện tại.
2. Không làm đăng nhập thật. Tài khoản ẩn danh được giữ nguyên.
3. Không đầu tư thêm cho năm chế độ luyện tập ngoài flashcard.
4. Không làm nghĩa ngữ pháp cho tiếng Anh và tiếng Tây Ban Nha.

## 3. Hiện trạng đo được

Mọi số dưới đây đo trong phiên ngày 2026-09-11, bằng PostgREST với `Prefer: count=exact`
trên project Supabase `cvltsyoweddhpkomuevz`, hoặc bằng cách chạy trực tiếp công cụ.

Chất lượng mã nguồn:

| Kiểm tra | Kết quả |
| --- | --- |
| `npx tsc --noEmit` | thoát với mã 0, sạch |
| `npm run test` | 43 tệp, 194 test, tất cả xanh |
| `npm run lint` | 14 lỗi, 4 cảnh báo |

Dữ liệu trong schema `lex`:

| Bảng | Số dòng |
| --- | ---: |
| `entries` | 34.162 |
| `senses` | 178.701 |
| `pronunciations` | 99.731 |
| `inflections` | 350.250 |
| `lex_relations` | 543.813 |
| `examples` | 144.956 |
| `cross_language_links` | 13.124 |
| `characters` | 1.512 |
| `enrichment`, `grammar_concepts` | 0 |

Dung lượng thật của từng bảng nằm ở mục 5.2, đo bằng `pg_total_relation_size`.

Phân bổ theo ngôn ngữ: tiếng Anh 20.000 mục, chặn ở ngưỡng tần suất khoảng 20.400; tiếng
Tây Ban Nha 10.917 mục; tiếng Trung 3.245 mục.

Khoảng trống dữ liệu quan trọng nhất:

1. Toàn bộ 34.162 mục đều có `entry_type` bằng `word`. Không có dòng nào thuộc loại
   `phrase`, `idiom` hay `collocation`.
2. Chỉ 30.833 trên 178.701 nghĩa có gloss tiếng Việt, tức 17,3 phần trăm. Trong số đó
   14.796 nghĩa do máy dịch.
3. Chỉ 699 trên 99.731 dòng phát âm có tệp audio, tức 0,7 phần trăm.
4. Hai bảng `enrichment` và `grammar_concepts` có cấu trúc nhưng rỗng, và không có dòng
   mã nào trong `lib/` đọc chúng.

Hành vi tìm kiếm hiện tại, đo bằng truy vấn thật:

| Truy vấn | Kết quả | Thời gian |
| --- | ---: | ---: |
| tiếng Anh, tiền tố `th` | 20 mục | 185 ms |
| tiếng Anh, tiền tố `zyg`, `quix`, `xyl` | 0 mục | khoảng 180 ms |
| tiếng Anh, gõ sai `recieve` | 0 mục | không áp dụng |
| tiếng Trung, một ký tự Hán làm tiền tố | 9 mục | 127 ms |

## 4. Các quyết định đã chốt

Hiệp đã chốt chín điểm sau. Spec này xây trên chúng.

1. Đổi tên ở cả bốn phạm vi: trong repo app, tên thư mục và git remote, repo phụ
   `chesen-pipeline` cùng vault `chesen-brain`, và tên project trên Supabase.
2. Giữ Supabase Free và thu nhỏ mục tiêu kho từ để nằm trong 500 MB.
3. Giữ nguyên năm chế độ luyện tập ngoài flashcard, sẽ cải thiện sau.
4. Giữ tài khoản ẩn danh, chưa làm đăng nhập thật.
5. Chưa đụng vào giao diện.
6. Viết lại cấu trúc từ đầu, giữ lại phần dùng được.
7. Nghĩa tiếng Việt theo ba tầng, có nhãn nguồn rõ ràng.
8. Chuyển sang FSRS-6 ngay, dùng thư viện `ts-fsrs`.
9. Nghĩa ngữ pháp làm cho tiếng Trung trước, tiếng Anh và tiếng Tây Ban Nha để sau.

## 5. Kiến trúc đích

### 5.1 Đổi tên

Chuỗi `chesen` xuất hiện trong `package.json`, `README.md`, `AGENTS.md`, `CLAUDE.md`, các
tài liệu trong `docs/`, và trong chú thích mã nguồn. Thứ tự thực hiện, mỗi bước có cách
kiểm chứng riêng:

1. Đổi chuỗi trong repo app, chạy lại lint, test và kiểm tra kiểu.
2. Đổi tên thư mục làm việc và cập nhật git remote. Việc đổi tên repo phía GitHub do Hiệp
   thực hiện, hoặc uỷ quyền cho `gh` CLI.
3. Đổi tên `chesen-pipeline` thành `zhesen-pipeline`, và `chesen-brain` thành `zhesen-brain`, đồng thời cập nhật đường dẫn trong
   `.claude/settings.json` phần `additionalDirectories`, và trong `AGENTS.md`.
4. Đổi tên hiển thị của project trên Supabase. Lưu ý URL và mã tham chiếu project không
   đổi theo, nên giá trị của bước này chỉ là tránh nhầm lẫn.

Rủi ro chính là các hook trong `.claude/settings.json` của project đang trỏ tới đường dẫn
tuyệt đối chứa chữ `chesen`. Phải sửa đồng thời, nếu không hook sẽ gãy im lặng.

### 5.2 Ngân sách dung lượng và chiến lược kho từ

Giới hạn cứng là 500 MB. Số đo thật bằng `pg_database_size`, chạy ngày 2026-09-12 qua kết
nối Postgres trực tiếp, là **238 MB**. Ước tính ban đầu của tôi là 480 tới 667 MB, tức cao
hơn thực tế khoảng gấp đôi; con số đo được mới là con số dùng để lập kế hoạch. Nghĩa là
còn khoảng **262 MB dư địa** trong gói Free.

Dung lượng thật theo bảng, đo bằng `pg_total_relation_size`:

| Bảng | Tổng | Dữ liệu | Index |
| --- | ---: | ---: | ---: |
| `lex.lex_relations` | 63 MB | 44 MB | 18 MB |
| `lex.inflections` | 61 MB | 49 MB | 12 MB |
| `lex.senses` | 49 MB | 26 MB | 24 MB |
| `lex.examples` | 25 MB | 20 MB | 4,9 MB |
| `lex.pronunciations` | 13 MB | 8,8 MB | 4,7 MB |
| `lex.entries` | 12 MB | 8,9 MB | 3,8 MB |

Mật độ hiện tại khoảng 7 KB cho mỗi mục từ, tính cả dữ liệu con và index. Với 262 MB dư
địa và mật độ đó, có thể thêm khoảng 37.000 mục mà không cần dọn gì. Nếu dọn theo bốn
phép dưới đây thì con số này còn tăng thêm.

Chiến lược không phải là thêm dữ liệu vào một thùng đã đầy, mà là đổi dữ liệu giá trị
thấp lấy dữ liệu giá trị cao. Bốn phép dọn được đề xuất, xếp theo lượng dung lượng thu
hồi được trên mỗi đơn vị rủi ro:

1. Bảng `lex_relations` chiếm 63 MB với 543.813 dòng, nhưng theo tài liệu bàn giao
   cũ thì 96 tới 100 phần trăm không có `related_entry_id` thật. Giữ lại quan hệ có liên
   kết thật và các loại quan hệ đang hiển thị trên giao diện, xoá phần còn lại.
2. Bảng `inflections` chiếm 61 MB với 350.250 dòng, phần lớn là bảng chia động từ
   tiếng Tây Ban Nha sinh bằng máy. Nén thành một cột JSONB trên mỗi động từ thay vì một
   dòng cho mỗi dạng. Riêng các dạng cần cho tra cứu ngược vẫn phải giữ tra được.
3. Bảng `examples` chứa khoảng 19,5 phần trăm câu bị dính chữ theo tài liệu bàn giao. App
   đang lọc chúng lúc chạy bằng heuristic trong `isCleanExample`. Xoá hẳn ở tầng dữ liệu
   thì vừa thu hồi dung lượng, vừa bỏ được đoạn heuristic đó.
4. Bảng `senses` có 82,7 phần trăm dòng không có nghĩa tiếng Việt. Không xoá, vì chúng vẫn
   phục vụ tầng hai và tầng ba của chiến lược nghĩa. Chỉ xoá nghĩa trùng lặp.

Sau khi đo và dọn, ngân sách còn lại quyết định số mục thêm được. Thứ tự ưu tiên khi nạp
thêm, từ cao xuống thấp:

1. Cụm từ, thành ngữ, cụm động từ, cụm từ đi kèm cho cả ba ngôn ngữ. Đây là khoảng trống
   hoàn toàn, và là thứ Hiệp nêu đích danh.
2. Tiếng Trung, hiện chỉ có 3.245 mục, mỏng nhất trong ba ngôn ngữ. Nạp trọn HSK 3.0 và
   phần thông dụng của CC-CEDICT.
3. Nghĩa tiếng Việt cho các mục đã có, ưu tiên theo tần suất.
4. Mở rộng vùng phủ tiếng Anh vượt ngưỡng 20.000 hiện tại.

Nguồn dữ liệu và giấy phép, đã tra cứu:

| Nguồn | Dùng cho | Giấy phép |
| --- | --- | --- |
| Kaikki.org, tức wiktextract | Cụm từ, thành ngữ, cụm từ đi kèm, nghĩa, ví dụ | CC-BY-SA và GFDL |
| PanLex | Bắc cầu nghĩa tiếng Việt | CC0 |
| Wikidata Lexemes | Dạng từ và nghĩa có cấu trúc | CC0 |
| CC-CEDICT | Từ điển Trung sang Anh | CC BY-SA 3.0 |
| Unihan | Dữ liệu ký tự Hán | Điều khoản Unicode |
| ivankra/hsk30 | Bậc HSK 3.0, 11.092 từ | MIT |
| CEFR-J | Bậc CEFR cho tiếng Anh | CC-BY-SA 4.0 |
| Tatoeba | Câu ví dụ song ngữ | CC-BY 2.0 FR và CC0, tuỳ câu |
| Lingua Libre trên Wikimedia Commons | Audio phát âm | CC-BY-SA 4.0 |
| Chinese Grammar Wiki | Điểm ngữ pháp tiếng Trung | Creative Commons |

Forvo bị loại vì đã gỡ giấy phép Creative Commons từ cuối năm 2019 và nay đòi trả phí cho
việc dùng lại.

### 5.3 Thay đổi schema

Thêm mới:

- Bảng `lex.grammar_points`: điểm ngữ pháp theo ngôn ngữ và bậc, có tiêu đề và giải thích
  tiếng Việt, có ví dụ, có liên kết tới các mục từ liên quan. Thay cho bảng
  `grammar_concepts` hiện rỗng và có cấu trúc quá hẹp, vì bảng cũ chỉ mô tả được thức và
  thì của động từ.
- Bảng `lex.topics` và bảng nối `lex.entry_topics`: chủ đề như du lịch, ẩm thực, công
  việc, để lọc từ theo chủ đề.
- Cột `head_entry_id` trên `lex.entries`, chỉ dùng cho mục loại `collocation` và `phrase`,
  trỏ về từ gốc. Hiện không có cách nào liên kết một cụm từ về từ gốc của nó.

Siết chặt:

- Thêm ràng buộc giá trị cho `lex_relations.relation_type` và
  `cross_language_links.link_type`. Hiện cả hai là text tự do nên giá trị dễ trôi.
- Chuẩn hoá `entries.level`. Hiện là text tự do nên `A1`, `a1` và `HSK1` có thể lẫn lộn.
  Tách thành hai cột: hệ quy chiếu và bậc.

Bổ sung chính sách truy cập:

- Các bảng `sources`, `images`, `entry_characters` và các bảng mới chưa có chính sách cho
  vai trò `anon`. Nếu giao diện cần đọc chúng qua `createContentClient`, RLS sẽ trả về
  rỗng mà không báo lỗi. Phải thêm chính sách trước khi dùng.

### 5.4 Tìm kiếm

Thay `ILIKE` tiền tố bằng một hàm RPC duy nhất `lex.search(q, langs, limit)`. Bên trong
hàm, mỗi ngôn ngữ dùng cơ chế phù hợp với chữ viết của nó:

- Tiếng Anh và tiếng Tây Ban Nha: một cột `tsvector` sinh sẵn với index GIN, cộng một cấu
  hình tìm kiếm tuỳ biến có dùng `unaccent` để gõ thiếu dấu vẫn ra. Một index GIN
  `gin_trgm_ops` phục vụ việc chịu lỗi chính tả.
- Tiếng Trung: PGroonga, vì `tsvector` và `pg_trgm` đều không tách được từ trong văn bản
  không có dấu cách. PGroonga có sẵn trên Supabase và bật bằng `create extension`.
- Tra theo pinyin: thêm một cột pinyin đã bỏ dấu thanh, tính sẵn lúc nạp dữ liệu, rồi đánh
  index như text thường. Không có cơ chế sẵn có nào của Postgres làm việc này.

Xếp hạng kết quả nhân `ts_rank` với hệ số theo `frequency_rank` và theo bậc trình độ, vì
Postgres không có cơ chế cộng điểm từ cột khác.

Hai thứ phải bỏ:

- `getHeadwords` hiện kéo toàn bộ headword của một ngôn ngữ về máy khách để tách từ tiếng
  Trung. Chuyển việc tách từ vào hàm RPC phía máy chủ.
- `isCleanExample` cùng danh sách từ thông dụng đi kèm, sau khi ví dụ hỏng đã bị xoá ở
  tầng dữ liệu.

Tiêu chí nghiệm thu cho phần tìm kiếm, đo bằng truy vấn thật chứ không phải cảm tính:

1. Gõ `recieve` phải ra `receive`.
2. Gõ `nguoi` phải ra được mục có dấu tương ứng, nếu mục đó tồn tại.
3. Gõ `ni hao` phải ra mục chữ Hán tương ứng.
4. Gõ một ký tự Hán phải ra các mục chứa ký tự đó ở giữa từ, không chỉ ở đầu.
5. Thời gian đáp ứng trung vị dưới 300 ms khi đo từ máy phát triển.

### 5.5 Kiến trúc mã nguồn

Cấu trúc đích tổ chức theo tính năng thay vì theo tầng kỹ thuật. Thư mục `app` chỉ còn các
route mỏng làm nhiệm vụ điều phối. Thư mục `features` chứa bốn nhóm: `dictionary` cho tra
cứu, `wordlist` cho sổ tay cá nhân, `review` cho ôn tập FSRS, và `practice` cho năm chế độ
luyện tập được giữ nguyên. Thư mục `lib` chỉ còn hai phần: `db` chứa client Supabase cùng
toàn bộ schema Zod, và `ui` chứa thành phần dùng chung.

Nguyên tắc bắt buộc trong lần viết lại:

1. Mọi dữ liệu từ Supabase đi qua Zod `.parse()`. Xoá toàn bộ `as unknown as` trong
   `lib/dictionary/search.ts`, `lib/dictionary/wordOfDay.ts`, `lib/wordlist/review.ts` và
   `lib/wordlist/stats.ts`.
2. Mỗi tệp một trách nhiệm. Tệp `search.ts` hiện 384 dòng sẽ tách theo nhóm truy vấn. Tệp
   `WordlistClient.tsx` hiện 467 dòng và giữ mười biến trạng thái sẽ tách thành một hook
   lọc và ba thành phần con.
3. Hàm `shuffle` hiện được viết lại độc lập ở bốn nơi, gom về một chỗ.
4. Thêm `error.tsx` và `loading.tsx`, và bọc phần tải chậm bằng `Suspense`.
5. Sửa hết 14 lỗi lint, trong đó có ba lỗi `react-hooks/purity` do gọi `Date.now()` ngay
   trong thân Server Component.

Mã chết sẽ xoá, đã xác nhận không có lượt gọi nào trong `app`:

- `components/Flashcard.tsx` và `components/Quiz.tsx`
- toàn bộ thư mục `lib/quiz`
- `lib/progress/ProgressStore.ts`, `SupabaseProgressStore.ts`, `rows.ts`, `index.ts`
- `lib/sanity.ts`
- toàn bộ thư mục `lib/content`, sau khi thay `getLanguages` bằng hằng số, vì nhãn và cờ
  ngôn ngữ đã được khai báo cứng trong `lib/dictionary/labels.ts`
- các tệp test tương ứng của những module trên

Giữ lại `lib/progress/srs.ts` cho tới khi FSRS chạy được, rồi mới xoá.

### 5.6 Nghĩa tiếng Việt theo ba tầng

Mỗi nghĩa hiển thị theo thứ tự ưu tiên sau, và giao diện luôn cho biết nghĩa đang đến từ
tầng nào:

1. Nghĩa tiếng Việt lấy trực tiếp từ một từ điển thật. Không gắn nhãn gì.
2. Nghĩa bắc cầu, qua PanLex hoặc qua nghĩa tiếng Anh trung gian. Gắn nhãn cho biết đây là
   nghĩa suy ra.
3. Định nghĩa tiếng Anh gốc, khi hai tầng trên đều không có. Gắn nhãn ngôn ngữ.

Không bịa và không giấu. Cột `gloss_vi_is_mt` hiện có được giữ và mở rộng thành một cột mô
tả nguồn gốc, để phân biệt được ba tầng ở tầng dữ liệu chứ không chỉ ở giao diện.

### 5.7 Chuyển sang FSRS-6

Dùng `ts-fsrs`, giấy phép MIT, cài đặt FSRS-6. Chi phí di trú gần như bằng không vì hiện
chỉ có 32 từ trong sổ tay và một dòng trong nhật ký ôn tập.

Các cột `srs_interval_days`, `srs_ease`, `srs_reps`, `srs_lapses`, `srs_due_at` và
`srs_last_reviewed_at` trên `public.user_words` được thay bằng mô hình Card của FSRS, gồm
độ ổn định, độ khó, số ngày trôi qua, số lần ôn, trạng thái và hạn ôn. Một migration
chuyển dữ liệu cũ sang, với các thẻ chưa từng ôn thì khởi tạo thẻ mới.

Bảng `lex.enrichment` và các bảng POC cũ trong schema `public`, gồm `vocab_items`,
`lessons`, `lesson_vocab`, `srs_state` và `lesson_progress`, không còn được dùng. Việc xoá
chúng để một đợt riêng, sau khi xác nhận không còn phụ thuộc.

## 6. Chia đợt thực hiện

Mỗi đợt kết thúc bằng một lần kiểm chứng đầy đủ, và app vẫn phải chạy được.

| Đợt | Nội dung | Cách kiểm chứng |
| --- | --- | --- |
| 0 | Đo dung lượng thật, chạy `EXPLAIN` trên truy vấn tìm kiếm hiện tại | Dán số đo từ `pg_total_relation_size` và dán kế hoạch truy vấn |
| 1 | Đổi tên toàn bộ | lint, test, kiểm tra kiểu đều xanh; hook vẫn chạy; app khởi động được |
| 2 | Xoá mã chết, sửa 14 lỗi lint, dựng cấu trúc theo tính năng | lint sạch, 194 test vẫn xanh, mở app bấm thử |
| 3 | Đưa mọi truy vấn qua Zod | Thêm test cho trường hợp dữ liệu sai hình dạng |
| 4 | Dọn dữ liệu giá trị thấp | Dán số dòng trước và sau, dán dung lượng trước và sau |
| 5 | Hệ tìm kiếm mới | Năm tiêu chí nghiệm thu ở mục 5.4, đo bằng truy vấn thật |
| 6 | Nạp cụm từ, thành ngữ, cụm từ đi kèm; nạp tiếng Trung | Dán số đếm theo `entry_type` và theo ngôn ngữ |
| 7 | Chuyển sang FSRS-6 | Test thuật toán, mở app ôn thử một thẻ |
| 8 | Ngữ pháp tiếng Trung | Dán số điểm ngữ pháp đã nạp, mở trang xem thử |

## 7. Thế nào là xong

Một đợt chỉ được tuyên bố hoàn thành khi đủ cả bốn điều kiện:

1. `npm run lint`, `npm run test` và `npx tsc --noEmit` đều thoát với mã 0.
2. App được mở chạy thật trên một cổng cố định, và thao tác liên quan được bấm thử. Phải
   dán bằng chứng.
3. Bước có động tới dữ liệu phải dán số đếm thật, không mô tả quy mô bằng cảm tính.
4. `git status` sạch, không để lại tệp log, ảnh chụp màn hình hay tệp tạm ở gốc repo.

## 8. Rủi ro

1. Ngân sách 500 MB có thể không đủ dù đã dọn. Nếu sau đợt 4 mà dung lượng còn lại không
   đủ cho mục tiêu ở mục 5.2, phải quay lại hỏi Hiệp về hạ tầng.
2. PGroonga có sẵn trên Supabase nhưng tài liệu không nói rõ áp dụng cho gói nào. Phải thử
   bật thật trước khi thiết kế phụ thuộc vào nó.
3. Nội dung từ Wiktionary mang giấy phép CC-BY-SA, nghĩa là có nghĩa vụ ghi nguồn và chia
   sẻ tương tự. Phải có trang ghi nguồn trước khi công khai.
4. Xoá dữ liệu ở đợt 4 là thao tác khó đảo ngược. Phải sao lưu trước, và phải được Hiệp
   xác nhận riêng cho từng phép xoá.
5. Việc đổi tên thư mục làm việc sẽ làm gãy mọi đường dẫn tuyệt đối trong hook và trong
   cấu hình. Phải rà hết trước khi đổi.

## 9. Ngoài phạm vi

Đăng nhập thật, thiết kế lại giao diện, chế độ tối, đầu tư thêm cho năm chế độ luyện tập,
nghĩa ngữ pháp tiếng Anh và tiếng Tây Ban Nha, dịch câu và đoạn, ghi chú cộng đồng, và
việc triển khai lên môi trường chạy thật.

## 10. Câu hỏi còn mở

1. Chuỗi kết nối Postgres trực tiếp, cần cho việc đo dung lượng thật, chạy `EXPLAIN`, và
   áp dụng migration. Không có nó thì đợt 0 và đợt 4 không thực hiện được.
2. Quyền đổi tên repo trên GitHub, hoặc xác nhận để dùng `gh` CLI.
3. Xác nhận riêng cho từng phép xoá dữ liệu ở đợt 4.
