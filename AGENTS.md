# Quy tắc dự án zhesen

File này chỉ chứa thứ agent **không** tự suy ra được khi đọc mã: mệnh lệnh, quy ước
khác mặc định, và những cái bẫy đã có người vấp. Dự án là gì, chạy ra sao, cây thư mục
thế nào thì xem [`README.md`](README.md); đừng chép lại sang đây, mỗi sự thật chỉ nên
nằm ở một chỗ.

## 🔴 IMPORTANT: chưa chạy verify thì chưa "xong"

Đây là lỗi số một trong lịch sử dự án. Build xanh là điều kiện cần, không phải đủ.
Trước khi nói hoàn thành phải đủ bốn thứ:

1. `npm run verify` exit 0. Nó chạy lint, rồi `tsc --noEmit`, rồi toàn bộ test. Test
   xanh **không** bảo đảm kiểu sạch, nên đừng bỏ bước giữa.
2. Tính năng có giao diện: build lại rồi **mở app chạy thật và tự bấm thử**, dán bằng
   chứng runtime. `next start` phục vụ bản đã build, sửa mã mà không build lại là đang
   bấm thử mã cũ. Dùng một port cố định, kill tiến trình giữ port cũ trước, đừng để
   Next nhảy port.
3. Bước đụng dữ liệu: chạy COUNT hoặc query thật rồi dán số, đừng mô tả quy mô bằng
   cảm tính.
4. `git status` sạch: không để tệp thử, `*.log`, `*.png`, JSONL tạm ở gốc repo.

Test fail thì báo fail kèm output. Không sửa, nới, hay xoá test cho qua: một test fail
là phát hiện, không phải chướng ngại.

`.claude/hooks/verify-gate.ps1` cưỡng chế điều này ở cuối mỗi lượt có sửa `.ts`/`.tsx`.
Thiếu công cụ thì hook **chặn**, không bỏ qua. Muốn biết hook còn sống không thì xem dấu
thời gian trong `.claude/.verify-gate-last-run`.

## Lệnh

| Lệnh | Việc |
| --- | --- |
| `npm run verify` | lint + typecheck + test. Định nghĩa "đã kiểm tra" |
| `npm run dev` | Máy chủ phát triển, cổng 3000 |
| `npm run build` rồi `npm run start` | Bắt buộc trước khi bấm thử giao diện |
| `npx vitest related --run <file>` | Chỉ chạy test thực sự import tệp đó |

## Sửa mã ở đây

- **Sửa tối thiểu, đúng phạm vi.** Đọc mã xung quanh trước khi sửa. Không refactor
  ngoài yêu cầu, không xoá hay đổi thứ đang chạy nếu không chắc.
- **Khảo sát quy ước hiện có trước khi tạo mới.** Đừng để quy ước trôi dần qua từng
  lần sửa.
- **Luôn typed.** Không `any` lén. Dữ liệu từ Supabase hoặc API phải qua Zod `.parse()`,
  không cast ngầm. Cast ngầm là nguồn lỗi runtime hay gặp nhất ở repo này.
- `app/` chỉ chứa route, layout và `globals.css`. Mọi component nằm dưới
  `components/<nhóm>/`; hook React nằm ở `lib/hooks/`, không lẫn vào `lib/wordlist/`.
- Module đặt tên camelCase, component PascalCase, test `*.test.ts(x)` đặt trong `test/`.
- Đường dẫn route bằng tiếng Anh, danh từ số ít (`/wordlist`, `/learn`). Nhãn giao diện
  bằng tiếng Việt. KHÔNG đặt route tiếng Việt kiểu `/tra-cuu`.
- Cơ sở dữ liệu dùng snake_case, TypeScript dùng camelCase. Chuyển đổi làm tường minh
  trong tầng parser (`lib/dictionary/`, `lib/wordlist/store.ts`), không rải khắp nơi.
- Test theo khuôn có sẵn: vitest + Testing Library, mock Supabase bằng chainable
  builder, dialog dựa vào polyfill `showModal` ở `test/setup.ts`.

## Bẫy phiên bản

- **Next 16.3.5 và React 19.2.4** khác bản cũ về API lẫn cấu trúc tệp. Đọc
  `node_modules/next/dist/docs/` phần liên quan trước khi viết, đừng code theo trí nhớ.
- **Server và Client Component.** Mặc định là Server Component. Mọi truy cập `window`,
  `localStorage`, `document` phải nằm sau `'use client'` và không được gọi ở top-level
  module scope, nếu không SSR ném `ReferenceError: window is not defined`.
- `params` và `searchParams` ở route động là Promise, phải `await`.
- **Supabase qua `@supabase/ssr`:** server component dùng `await createClient()` từ
  `lib/supabase/server`; client dùng `useMemo(() => createClient(), [])` từ
  `lib/supabase/client`, đừng tạo client mới mỗi lần render.
- **Tailwind 4** cấu hình trong `app/globals.css`, không còn `tailwind.config.js`.
- Route tìm kiếm dùng `unstable_cache` với tag `['lex']`. Dữ liệu đổi thì cache không
  tự làm mới, đó là việc của pipeline. Đừng tưởng kết quả tìm kiếm luôn tươi.
- **Vitest:** phải import tường minh lifecycle hook (`beforeEach`...) dù đã bật
  `globals: true`, nếu không `tsc` báo TS2304. Mock constructor như `Audio` bằng
  `vi.fn(function(){...})`, KHÔNG dùng arrow function vì arrow không phải constructor.
- **React 19 lint:** `react-hooks/purity` cấm gọi `Date.now()` trong thân component.
  Cách đã chọn: hàm ở tầng dữ liệu nhận `now: number = Date.now()` làm tham số mặc
  định, nơi gọi bỏ đối số đi. KHÔNG dùng `eslint-disable` để bịt.
- Dialog `showModal()` đua với React Strict Mode (effect chạy hai lần), cần guard
  `if (open && !el.open)`.

## Bẫy dữ liệu và Postgres

- **`unaccent()` là STABLE, không phải IMMUTABLE**, nên không dùng thẳng trong generated
  column hay index được (`ERROR 42P17`). Hai lối đã dùng: text search configuration
  `lex.zhesen_en` và `lex.zhesen_es` có `unaccent` trong chain dictionary, và hàm bọc
  `extensions.immutable_unaccent()` cho chỗ không đi qua tsvector.
- **Pinyin lấy từ `lex.entries.attributes->>'pinyin'`**, phủ 100% entry tiếng Trung kể
  cả từ nhiều âm tiết. KHÔNG lấy từ `lex.characters.pinyin`, cột đó chỉ có từng ký tự.
- **Postgres chỉ dùng index cho chuỗi `OR` khi MỌI nhánh là điều kiện trên đúng bảng
  đang quét.** Thêm một nhánh với tới bảng khác là mất bitmap, quét toàn bảng. Cần
  nguồn khớp mới cho `lex.search` thì viết thành nhánh `UNION` riêng trong CTE `cand`,
  đừng nối thêm `or`.
- **Xếp hạng trước, làm giàu dữ liệu sau.** Subquery lấy nghĩa, phát âm, audio phải chạy
  sau `limit`, không phải cho mọi ứng viên. `lex.search` và `lex.search_vi` đều theo
  khuôn này, giữ nguyên khi sửa.
- **Chặn số lượng ứng viên phải nằm SAU bộ lọc ngôn ngữ.** Chặn trước thì truy vấn thu
  hẹp về một ngôn ngữ lại được phục vụ từ tập lấy chung cả ba.
- **`= any (subquery)` bị hiểu là dạng `IN`, không phải dạng mảng.** So với mảng trả từ
  CTE phải ép kiểu: `e.id = any ((select ids from t)::text[])`.
- **KHÔNG chạy `VACUUM FULL` trên `lex.entries`.** Nó dựng lại index, PGroonga tạo bộ
  tệp Groonga mới theo `relfilenode` mới còn bộ cũ nằm lại: đã đo, cơ sở dữ liệu phình
  từ 425 MB lên 486 MB. Muốn dọn thì chạy `vacuum lex.entries` thường, PGroonga móc vào
  đó để xoá đối tượng thừa; một lần chạy trả lại 105 MB.
  Kiểm đối tượng thừa: `select extensions.pgroonga_command('object_list')`, các khoá
  `Sources<relfilenode>` phải khớp `relfilenode` của index đang sống trong `pg_class`.
  Nguồn: https://pgroonga.github.io/reference/functions/pgroonga-vacuum.html
- **PGroonga giữ dữ liệu index trong tệp riêng mà Postgres không thấy.** `pg_relation_size`
  của cả hai index PGroonga đều trả 0, nên phần chênh giữa `pg_database_size` và tổng
  `pg_total_relation_size` chính là PGroonga chứ không phải chỗ trống trong bảng.
- **`VACUUM` thường không trả dung lượng về đĩa**, chỉ đánh dấu chỗ trống để tái dùng.
- **Mọi `update` trong migration phải idempotent theo trạng thái ĐÍCH, không phải theo
  trạng thái NGUỒN.** Migration `0017` từng chỉ lọc theo cột `srs_*` cũ; các cột đó đóng
  băng sau khi chuyển sang FSRS nên chạy lại sẽ ghi đè tiến độ ôn tập thật.
- **Migration áp thẳng bằng SQL phải tự ghi vào `supabase_migrations.schema_migrations`.**

## Bẫy sản phẩm

- **Mọi chế độ luyện tập PHẢI ghi vào lịch FSRS.** Trước đây `gradeCard` chỉ được gọi từ
  `WordlistReview`, nên quiz, viết, chép chính tả, ghép đôi và luyện nói không ghi cột
  `fsrs_*` nào: người dùng luyện cả buổi mà hàng đợi ôn hôm sau y nguyên. Thêm chế độ
  mới thì gọi `gradeForMode` (`lib/practice/grading.ts`) rồi `gradeWordById`
  (`lib/wordlist/review.ts`). Luyện nói cố tình KHÔNG báo thất bại: nhận dạng giọng sai
  vì phòng ồn hay micro, ghi `again` sẽ xoá tiến độ thật vì một lỗi phần cứng.
- **Middleware KHÔNG tạo phiên ẩn danh.** Tra cứu không cần tài khoản, nên tài khoản chỉ
  sinh ra ở lần ghi đầu tiên qua `ensureSession` (`lib/supabase/session.ts`). Trước đây
  mỗi request không cookie đều tạo một hàng `auth.users`: 122 tài khoản mà chỉ 1 có dữ
  liệu, và khi chạm trần đăng nhập của Supabase thì người dùng thật cũng mất phiên. Thêm
  đường ghi mới thì gọi `ensureSession` ở đó.
- **Tệp audio của Wiktionary không phải lúc nào cũng đọc đúng từ đó.** `En-uk-a_cat.ogg`
  đọc "a cat" và nằm ngay trên mục từ "cat". Mọi nơi lấy `audio_url` phải đi qua
  `audioMatchesHeadword` (`lib/dictionary/pronunciation.ts`). Đo trên 699 bản ghi: 631 khớp.
- **Không đọc bằng giọng sai ngôn ngữ.** `speechSynthesis` nhận utterance kể cả khi máy
  không có giọng cho ngôn ngữ đó và phát ra im lặng. Tiếng Trung không có bản ghi nào
  (0/4042), nên `AudioButton` kiểm tra danh sách giọng trước rồi đổi sang biểu tượng tắt
  tiếng kèm lý do.
- **`s-maxage` không nói gì với trình duyệt.** Chỉ đặt mỗi nó thì trình duyệt tự suy ra
  độ tươi và giữ bản cũ, `revalidateTag` trên máy chủ không với tới được. Route API có
  cache phải tách `Cache-Control` cho trình duyệt và `CDN-Cache-Control` cho CDN.
- **Kiểm giấy phép TRƯỚC khi nạp, và đọc đủ chữ.** Chinese Grammar Wiki của AllSet
  Learning là CC BY-NC-SA 3.0, trang bản quyền cấm cả web có quảng cáo. Một báo cáo
  nghiên cứu từng ghi gọn là "Creative Commons" và suýt kéo dự án vào ràng buộc phi
  thương mại. CEFR-J cũng vậy: danh sách chính A1-B2 KHÔNG phải CC-BY-SA, chỉ phần
  Octanove C1/C2 mới là.

## Đã gỡ bỏ, đừng dựng lại

Tất cả đều đã xác minh không còn nơi gọi trước khi xoá, ngày 2026-09-12:
`lib/content/` (lớp trừu tượng ContentSource, thay bằng hằng số ở `lib/languages.ts`),
`lib/quiz/` (trùng `lib/wordlist/quiz.ts`), `lib/progress/ProgressStore.ts` cùng
`SupabaseProgressStore.ts` (tầng lưu trữ SRS cũ), `components/Flashcard.tsx`,
`components/Quiz.tsx`, `lib/sanity.ts`. Trang `/reader` đã cắt khỏi phạm vi, nhưng
`components/reader/` vẫn dùng trong `lookup` và `grammar`, đừng xoá nhầm.

## Đi tiếp

Spec và plan còn hiệu lực ở `docs/superpowers/`, bắt đầu từ [`docs/README.md`](docs/README.md).
Tri thức sâu và lesson từng task nằm trong vault `C:\Users\Hiep\Documents\zhesen-brain`.
Sau mỗi task đáng kể, ghi một lesson vào vault; lỗi nào lặp lại nhiều lần thì nâng thành
một dòng trong chính file này, và cắt bớt dòng đã hết giá trị để file không phình.
