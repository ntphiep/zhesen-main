# Thiết kế MVP: Trang web học ngoại ngữ (Chesen)

Ngày: 2026-06-17
Trạng thái: Bản thiết kế chờ duyệt
Phạm vi tài liệu: Chỉ Lát 1 (MVP). Các lát sau chỉ nêu định hướng.

## 1. Tổng quan và mục tiêu

Chesen là một trang web giúp người Việt học ba ngoại ngữ: tiếng Trung, tiếng Tây Ban Nha và tiếng Anh. Sản phẩm bắt đầu là một dự án cá nhân, nhưng kiến trúc được thiết kế để mở rộng thành sản phẩm nhiều người dùng về sau.

Vòng học cốt lõi gồm hai phần bổ trợ nhau. Một là bài học theo chương, mỗi bài giới thiệu một nhóm từ rồi kiểm tra bằng câu hỏi. Hai là ôn tập từ vựng bằng flashcard theo thuật toán lặp lại ngắt quãng (spaced repetition), giúp người học nhớ lâu.

Mục tiêu của MVP là chạy được trọn vẹn vòng học này cho cả ba ngôn ngữ với một bộ dữ liệu mẫu nhỏ, đồng thời đặt sẵn các đường nối kiến trúc để giai đoạn sau mở rộng mà không phải viết lại.

## 2. Phạm vi MVP

### Có trong MVP

- Ba ngôn ngữ học: tiếng Trung, tiếng Tây Ban Nha, tiếng Anh, mỗi ngôn ngữ một bộ dữ liệu mẫu nhỏ.
- Giao diện và phần giải thích, dịch nghĩa bằng tiếng Việt.
- Bài học theo chương kèm câu hỏi trắc nghiệm chọn nghĩa.
- Phiên ôn flashcard theo thuật toán SM-2 rút gọn.
- Lưu tiến độ học và trạng thái ôn tập lên Supabase, gắn với người dùng ẩn danh.
- Đăng nhập ẩn danh tự động, không cần màn hình đăng nhập.

### Không nằm trong MVP

- Crawler hoặc trình nhập nội dung tự động (để Lát 3).
- Đăng ký tài khoản email, đăng nhập mạng xã hội, hồ sơ người dùng đầy đủ.
- Âm thanh phát âm, nhận diện giọng nói, luyện nói.
- Các kiểu bài ghép cặp và gõ đáp án.
- Bảng xếp hạng, chuỗi ngày học, thông báo, trò chơi hóa nâng cao.
- Ứng dụng di động riêng.

## 3. Lộ trình theo lát cắt

Mỗi lát cắt là một chu kỳ riêng gồm spec, kế hoạch, rồi triển khai. Tài liệu này chỉ đặc tả Lát 1.

- **Lát 1 (MVP):** Next.js kết hợp Supabase. Vòng học chạy đủ cho ba ngôn ngữ với dữ liệu seed. Tiến độ lưu trên cloud, người dùng ẩn danh.
- **Lát 2:** Mở rộng nội dung, bổ sung kiểu bài (ghép cặp, gõ đáp án), nâng cấp người dùng ẩn danh lên tài khoản email, tinh chỉnh giao diện.
- **Lát 3:** Crawler hoặc trình nhập nội dung, viết bằng Go hoặc Python (chốt ở thời điểm đó), đổ dữ liệu vào Postgres của Supabase theo đúng schema. Phần này là dự án con độc lập.

## 4. Kiến trúc tổng thể

Hệ thống MVP gồm một ứng dụng Next.js chạy ở phía người dùng và Supabase đóng vai backend. Frontend gọi Supabase trực tiếp qua thư viện `supabase-js`, nhưng không gọi rải rác khắp nơi mà đi qua hai lớp trừu tượng.

### Hai đường nối quan trọng

Hai interface dưới đây là điểm mấu chốt để sau này có thể đổi backend mà không phải viết lại giao diện và logic học.

- **`ContentSource`**: cung cấp nội dung học. Các hàm tiêu biểu gồm lấy danh sách ngôn ngữ, lấy danh sách bài theo ngôn ngữ, lấy chi tiết một bài, lấy các mục từ vựng. Bản MVP cài đặt bằng cách đọc từ Supabase.
- **`ProgressStore`**: đọc và ghi trạng thái học. Các hàm tiêu biểu gồm lấy các thẻ tới hạn ôn, ghi kết quả một lần ôn, lấy và cập nhật tiến độ bài học. Bản MVP cài đặt bằng cách ghi lên Supabase.

Toàn bộ màn hình và logic ôn tập chỉ phụ thuộc vào hai interface này, không biết dữ liệu nằm ở đâu. Khi cần đổi sang một backend tự viết (ví dụ Django hoặc Gin), chỉ cần viết lại phần cài đặt của hai interface, phần còn lại giữ nguyên.

### Vì sao chọn Supabase và mức độ khóa nhà cung cấp

Supabase bản chất là PostgreSQL tiêu chuẩn kèm Auth, REST API tự sinh (PostgREST) và Row-Level Security. Dữ liệu vì thế không bị khóa, vì có thể `pg_dump` mang sang bất kỳ PostgreSQL nào khác. Phần phụ thuộc vào Supabase là Auth, lớp API tự sinh, các policy RLS và thư viện `supabase-js`. Nhờ dữ liệu là PostgreSQL thuần và nhờ hai interface ở trên, chi phí chuyển đổi về sau được khoanh vùng, không phải đập đi xây lại.

## 5. Stack công nghệ

- **Frontend:** Next.js (App Router), React, TypeScript.
- **Backend và lưu trữ:** Supabase (PostgreSQL, Auth, RLS).
- **Truy cập dữ liệu từ client:** `supabase-js`.
- **Kiểm tra hợp lệ dữ liệu:** zod, dùng khi nạp seed và khi nhận dữ liệu ở ranh giới.
- **Kiểm thử:** một bộ test cho hàm SRS và cho luồng ôn tập (framework cụ thể chốt ở bước lập kế hoạch).

## 6. Mô hình dữ liệu

Đơn vị nguyên tử là mục từ vựng. Nó vừa là nội dung trong bài học, vừa là một flashcard khi ôn tập.

### Thực thể nội dung

```
Language {
  code         // 'zh' | 'es' | 'en'
  name         // tên tiếng Việt: "Tiếng Trung"
  native_name  // tên bản ngữ: "中文"
  script       // 'han' | 'latin'
}

VocabItem {
  id
  lang             // 'zh' | 'es' | 'en'
  term             // chữ ở ngôn ngữ đích: 你好 / hola / hello
  reading          // pinyin có dấu thanh cho tiếng Trung; có thể rỗng với ngôn ngữ Latin
  translation      // JSON dạng { "vi": "xin chào" }; cấu trúc map để sau thêm ngôn ngữ gốc khác
  part_of_speech   // tùy chọn
  level            // tùy chọn, ví dụ "HSK1" hoặc "A1"
  examples         // JSON danh sách { sentence, reading, translation: { vi } }
  audio            // tùy chọn, để trống ở MVP, chỉ giữ chỗ
}

Lesson {
  id
  lang
  title
  description
  position         // thứ tự bài trong ngôn ngữ
}

LessonVocab {       // bảng nối bài học với từ vựng
  lesson_id
  vocab_id
  position
}
```

Trường `reading` là chỗ xử lý đặc thù tiếng Trung (pinyin kèm thanh điệu) mà không làm phình mô hình của ngôn ngữ Latin. Trường `translation` để dạng map theo mã ngôn ngữ gốc, hiện chỉ dùng khóa `vi`, nhằm chừa đường cho ngôn ngữ gốc khác về sau.

### Thực thể tiến độ

```
SrsState {           // trạng thái ôn của một từ với một người dùng
  user_id
  vocab_id
  interval_days      // khoảng cách tới lần ôn kế tiếp
  ease               // hệ số độ dễ, theo SM-2
  due_at             // thời điểm tới hạn ôn
  reps               // số lần trả lời đúng liên tiếp
  lapses             // số lần quên
  last_reviewed_at
}

LessonProgress {     // tiến độ một bài học với một người dùng
  user_id
  lesson_id
  status             // 'not_started' | 'in_progress' | 'completed'
  completed_at
}
```

### Sơ đồ bảng trên Supabase

- Bảng nội dung: `languages`, `vocab_items`, `lessons`, `lesson_vocab`.
- Bảng tiến độ: `srs_state`, `lesson_progress`.
- Người dùng do Supabase Auth quản lý ở schema `auth`; tiến độ tham chiếu `auth.uid()`.

## 7. Thuật toán lặp lại ngắt quãng

MVP dùng SM-2 rút gọn, là biến thể của thuật toán mà Anki dùng. Sau mỗi lần ôn, người học tự đánh giá mức độ nhớ qua bốn nút: Lại, Khó, Tốt, Dễ. Từ đánh giá đó, thuật toán cập nhật hệ số độ dễ, số lần lặp và khoảng cách tới lần ôn kế tiếp.

Quy tắc chính:

- Nếu trả lời "Lại" (quên), đặt lại số lần lặp về 0, tăng số lần quên, hẹn ôn lại trong ngày.
- Nếu trả lời đúng, tăng số lần lặp và nhân khoảng cách hiện tại với hệ số độ dễ.
- Hệ số độ dễ được điều chỉnh tăng giảm theo mức đánh giá, có giá trị sàn để không tụt quá thấp.

Hàm tính lịch ôn là một hàm thuần, nhận trạng thái cũ và mức đánh giá, trả về trạng thái mới. Vì thuần nên nó được viết theo lối phát triển hướng kiểm thử (TDD) và phủ test đầy đủ các nhánh.

Phương án thay thế đã cân nhắc là hộp Leitner với năm hộp cố định, đơn giản hơn nhưng cho lịch ôn kém linh hoạt. Đã chọn SM-2 rút gọn vì độ phức tạp tăng không đáng kể mà lịch ôn hợp lý hơn.

## 8. Luồng người dùng và màn hình

1. **Trang chủ:** người dùng chọn một trong ba ngôn ngữ. Lần đầu vào trang, hệ thống tạo phiên đăng nhập ẩn danh ở chế độ nền.
2. **Bảng điều khiển theo ngôn ngữ:** hiển thị danh sách bài học và số thẻ tới hạn ôn trong ngày, kèm lối vào phiên ôn nhanh.
3. **Màn bài học:** giới thiệu lần lượt các từ mới của bài, sau đó kiểm tra bằng câu hỏi trắc nghiệm chọn nghĩa. Hoàn thành bài thì cập nhật tiến độ và đưa các từ trong bài vào hàng đợi ôn tập.
4. **Phiên ôn flashcard:** lùa các thẻ tới hạn, hiện mặt trước gồm `term` và `reading`, người học tự nhớ rồi lật xem nghĩa tiếng Việt, sau đó chọn một trong bốn nút đánh giá để thuật toán cập nhật lịch.

Giao diện hướng tới phong cách sạch và tối giản, ưu tiên hiển thị tốt cả chữ Hán lẫn chữ Latin. Phần thẩm mỹ chi tiết sẽ tinh chỉnh ở bước triển khai.

## 9. Xác thực

MVP dùng tính năng đăng nhập ẩn danh của Supabase. Lần đầu người dùng vào trang, ứng dụng tạo một phiên ẩn danh, sinh ra một bản ghi người dùng thật trong Supabase Auth mà không cần màn hình đăng nhập. Tiến độ học gắn với người dùng này.

Cách làm này cho phép scope dữ liệu theo từng người qua RLS ngay từ đầu, đồng thời để ngỏ đường nâng cấp phiên ẩn danh lên tài khoản email ở Lát 2 mà không mất tiến độ. Cơ chế đăng nhập ẩn danh của Supabase sẽ được xác minh lại bằng tài liệu chính thức và thử nghiệm thực tế khi bắt đầu code.

## 10. Bảo mật và Row-Level Security

- Các bảng nội dung (`languages`, `vocab_items`, `lessons`, `lesson_vocab`) cho phép mọi người dùng đã xác thực, kể cả ẩn danh, đọc.
- Các bảng tiến độ (`srs_state`, `lesson_progress`) bật RLS, chỉ cho phép người dùng đọc và ghi các dòng có `user_id` bằng `auth.uid()`.
- Khóa của Supabase dùng ở client là khóa công khai (anon key), mọi quyền truy cập thực tế do RLS kiểm soát.

## 11. Xử lý lỗi

- **Dữ liệu seed sai định dạng:** kiểm tra bằng zod khi nạp, báo lỗi rõ ràng và dừng quá trình nạp thay vì nhập dữ liệu hỏng.
- **Lỗi mạng hoặc Supabase không phản hồi:** hiển thị thông báo thân thiện và cho phép thử lại, không để giao diện treo.
- **Tạo phiên ẩn danh thất bại:** chặn vòng học và báo người dùng, vì không có người dùng thì không lưu được tiến độ.
- **Xung đột khi ghi tiến độ:** lần ghi sau ghi đè theo trạng thái mới nhất, vì mỗi người dùng chỉ thao tác trên dữ liệu của chính mình.

## 12. Kiểm thử

- **Hàm SRS:** viết theo TDD, phủ các nhánh trả lời đúng, trả lời sai, điều chỉnh hệ số độ dễ và tính ngày tới hạn.
- **Lớp `ContentSource` và `ProgressStore`:** kiểm thử các hàm truy vấn và ghi, có thể dùng một cài đặt giả lập trong bộ nhớ cho test.
- **Luồng phiên ôn:** kiểm thử tích hợp cho kịch bản chọn thẻ tới hạn, đánh giá, rồi cập nhật lịch.

## 13. Cấu trúc thư mục dự kiến

```
chesen/
  app/                  # các trang Next.js (App Router)
  components/           # thành phần giao diện dùng lại
  content/              # dữ liệu seed dạng JSON theo ngôn ngữ
  lib/
    content/            # interface ContentSource + cài đặt trên Supabase
    progress/           # interface ProgressStore + thuật toán SRS
    supabase/           # khởi tạo client, kiểu dữ liệu
  supabase/             # migration SQL, script seed
  docs/superpowers/specs/
```

Crawler sẽ nằm ở thư mục hoặc repo riêng khi tới Lát 3, không trộn vào cây thư mục của app.

## 14. Rủi ro và quyết định để ngỏ

- **Ngôn ngữ viết crawler (Go hay Python):** để ngỏ tới Lát 3, không ảnh hưởng MVP.
- **Chất lượng và bản quyền nội dung khi crawl:** xử lý ở Lát 3, MVP chỉ dùng seed tự soạn hoặc từ nguồn mở.
- **Chi tiết cơ chế đăng nhập ẩn danh của Supabase:** cần xác minh bằng tài liệu chính thức khi code.
- **Phát âm và âm thanh:** chưa làm ở MVP, mô hình dữ liệu đã chừa trường `audio`.
