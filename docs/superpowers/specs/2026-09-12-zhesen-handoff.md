# Bàn giao trạng thái zhesen — 2026-09-12

Tài liệu này viết cho một phiên làm việc mới. Nó ghi trạng thái đã kiểm chứng tại
thời điểm bàn giao, những việc còn nợ, và những cái bẫy đã vấp phải. Quy ước bắt
buộc khi sửa mã nằm ở [`AGENTS.md`](../../../AGENTS.md), không lặp lại ở đây.

## 1. Trạng thái đã kiểm chứng

| Thứ | Giá trị | Đo bằng |
| --- | --- | --- |
| Nhánh | `zhesen`, sạch, khớp `origin/zhesen` | `git status -sb` |
| Commit cuối | `76dc928 feat(lookup): mark the gender of a Spanish word` | `git log` |
| Test | 390 test / 64 file, xanh | `npx vitest run` |
| Kiểu và lint | sạch | `npx tsc --noEmit`, `npm run lint` |
| CI | xanh trên commit cuối | `gh run list --branch zhesen` |
| Migration | 28 tệp, `0001`-`0029` (không có `0019`), đã áp hết | `ls supabase/migrations` |
| Cơ sở dữ liệu | 377 MB / trần 500 MB gói Free | `pg_database_size` |
| Mục từ | 36.361 (en 21.004, es 11.312, zh 4.045) | `count(*) lex.entries` |
| Sổ tay | 412 dòng của 2 tài khoản | `count(*) public.user_words` |

Hai tài khoản trong `user_words`: `89d92177-55cd-405c-9c64-2d2ee5b6ad2d` là của Hiệp
(407 từ), `2db24f68-513b-40ba-8b1c-f6a1d04831db` là tài khoản nháp do agent tạo khi
kiểm thử (5 từ: dog, cat, water, elephant, 学习). Xoá 5 dòng nháp đó là an toàn
nhưng phải hỏi Hiệp trước.

## 2. Phạm vi hiện tại

Ba việc, đúng thứ tự ưu tiên: **tra cứu**, **lưu trữ sổ tay cá nhân**, **ôn tập
bằng FSRS-6**. Các tính năng học khác (`/learn`, `/grammar`, `/reader`) vẫn nằm
trong repo và chạy được, nhưng không phát triển tiếp cho tới khi ba việc trên đủ tốt.

## 3. Việc còn nợ

### 3.1 Chờ Hiệp quyết
- **Đổi tên thư mục** `C:\Users\Hiep\Desktop\chesen` thành `zhesen`. Phải đóng phiên
  làm việc mới đổi được vì phiên đang giữ thư mục. Mọi thứ khác của việc đổi tên
  (nội dung repo, nhánh, remote, tên project Supabase) đã xong.
- **Tương phản màu**: chữ xám trong giao diện đo được tỉ lệ 2,8 đến 3,9 so với nền,
  chuẩn WCAG 2.1 SC 1.4.3 mức AA yêu cầu 4,5. Sửa thì đổi diện mạo. Hiệp từng dặn
  chưa đụng giao diện, nhưng sau đó đã yêu cầu sửa một số bảng, nên nên hỏi lại.

### 3.2 Làm được ngay bằng mã, không cần dữ liệu mới
- **Lọc ôn theo thẻ.** `lib/wordlist/tags.ts` có thẻ, `listDueCards`
  (`lib/wordlist/review.ts`) không nhận tham số thẻ nào. Ước lượng ~30 dòng.
- **Ba mức độ nhớ.** `lib/wordlist/stats.ts:31` phân loại bằng hằng số nhị phân
  `MATURE_DAYS = 21`. `ts-fsrs` có `retrievability`, dùng nó chia ba mức thật.
- **Thẻ ôn chiều ngược.** Hiện chỉ có nghĩa sang từ; thiếu từ sang nghĩa.
- **Hai thuật toán chọn IPA** cho cùng một việc: `lib/dictionary/rows.ts:152`
  `pickIpa()` (theo chuỗi giọng) và `lib/dictionary/pronunciation.ts` `bestIpa()`
  (chấm điểm theo dấu nhấn và âm đầu). Hiện cả hai đều chạy đúng cho chỗ của nó.
  Cần một quyết định: gộp, hay ghi rõ vì sao khác nhau.
- **Lớp bọc `unstable_cache`** lặp nguyên văn 13 lần trong `lib/dictionary/cached.ts`
  và `lib/grammar/cached.ts`. Đơn giản và nhất quán, nhưng là chép tay.
- **Hai tệp lớn nhất**: `components/wordlist/WordlistClient.tsx` 443 dòng,
  `components/search/SearchBox.tsx` 332 dòng. Không lớn bất thường, nhưng nếu phải
  sửa thì đọc kỹ trước (AGENTS.md đã cảnh báo tệp đầu).

### 3.3 Cần nạp dữ liệu, mã không sửa được
Đã đếm trực tiếp trên cơ sở dữ liệu, không phải ước lượng:

| Khoảng trống | Số đo | Hệ quả |
| --- | --- | --- |
| `lex.examples.sense_id` | 0 / 144.997 | Không gom được ví dụ theo từng nghĩa |
| `lex.characters.decomposition` | 0 / 1.841 | Không phân tích được bộ phận chữ Hán |
| Âm thanh tiếng Trung | 0 / 4.042 mục từ | Luôn phải dùng giọng tổng hợp |
| Âm thanh tiếng Tây Ban Nha | 3 / 27.790 | Như trên |
| Âm thanh tiếng Anh | 631 dùng được / 699 | Phần còn lại dùng giọng tổng hợp |
| Mục từ tiếng Trung | 4.045 | Đôi khi chỉ có nghĩa bên lề: `zh:水` chỉ có "surname Shui" và "Shui ethnic group", không có nghĩa "nước" |

Nguồn âm thanh tiếng Trung khả dĩ nhất là **Wikimedia Commons** (chính các tệp
Wiktionary nhúng, bắt buộc mang giấy phép tự do theo quy định của Commons). Forvo
có điều khoản thương mại không rõ, phải đọc https://forvo.com/license/ trước khi
dùng. Google Translate TTS chưa xác minh điều khoản. Việc nạp thuộc repo
`zhesen-pipeline`, không thuộc repo này.

Ba thứ các từ điển học tiếng tốt có mà ta **không có dữ liệu** để làm: nhãn phân
biệt nghĩa kiểu Cambridge (`(REGULAR)`, `(NOT SINCERE)`), bảng kết hợp từ kiểu
Oxford, câu ví dụ song ngữ đối chiếu kiểu Linguee.

## 4. Cái bẫy riêng của môi trường này

Những cái này không nằm trong `AGENTS.md` vì chúng thuộc về công cụ chứ không thuộc
về mã.

- **Chạy SQL**: qua Composio, tool `SUPABASE_BETA_RUN_SQL_QUERY` (ghi được, DDL được)
  và `SUPABASE_RUN_READ_ONLY_QUERY` (chỉ đọc). Project ref `cvltsyoweddhpkomuevz`.
  Repo chưa link Supabase CLI.
- **Vai trò chỉ-đọc của Composio không có `extensions` trong `search_path`**, nên gọi
  `lex.search` qua nó sẽ lỗi `operator does not exist: text % text`. Không phải lỗi
  hàm. Muốn thử tìm kiếm thật thì gọi qua route của app hoặc qua `BETA_RUN_SQL_QUERY`.
- **`VACUUM` không chạy được trong transaction**, mà tool gói nhiều câu lệnh vào một
  transaction. Mỗi lần gọi chỉ một câu `vacuum`.
- **Migration áp thẳng phải tự ghi vào `supabase_migrations.schema_migrations`**
  (đã ghi tới `0029`, version `20260912060001`).
- **CI chặn câu lệnh xoá dữ liệu trong migration** trừ khi tệp có dòng
  `-- reviewed-destructive: <ai duyệt, vì sao>`. Xem `.github/workflows/ci.yml`.
- **Hook `guard-dangerous-bash.ps1` chặn lệnh bash chứa chữ "drop table"**, kể cả khi
  chỉ là văn bản trong thông điệp commit. Viết thông điệp ra tệp rồi `git commit -F`.
- **Nghiệm thu giao diện**: `npm run build` rồi `npx next start -p 3100`; giết tiến
  trình đang giữ cổng trước. Trang tra cứu dùng `unstable_cache`, nên sau khi đổi dữ
  liệu phải gọi `POST /api/revalidate` với header `x-revalidate-secret` lấy từ
  `.env.local`, nếu không vẫn thấy kết quả cũ.
- **Token 9router Hiệp từng dán trong chat nên được xoay lại.**

## 5. Bài học đã ghi vào vault

`C:\Users\Hiep\Documents\chesen-brain\lessons\` (thư mục vẫn tên `chesen-brain`):

- `2026-09-12-search-coverage-and-scan-shape.md` — vì sao nối thêm một nhánh `OR`
  làm Postgres bỏ index, và cách viết thành các nhánh `UNION`.
- `2026-09-12-review-found-my-fixes-made-things-worse.md` — hai bản vá tự gây lỗi
  nặng hơn lỗi ban đầu (giới hạn tốc độ theo IP, kẹp đồng hồ FSRS).
- `2026-09-12-vacuum-full-made-the-database-bigger.md` — `VACUUM FULL` trên bảng có
  index PGroonga làm cơ sở dữ liệu phình thêm 61 MB, và `VACUUM` thường mới là cách
  dọn.
- `2026-09-12-the-data-already-knew.md` — bốn lỗi hiển thị, cả bốn đều là dữ liệu đã
  có mà giao diện vứt đi.
