
# Quy tắc dự án zhesen (cho mọi AI agent)

> Đây là rule LUÔN nạp mỗi phiên. Giữ ngắn, tín hiệu cao. Tri thức sâu nằm trong vault
> `C:\Users\Hiep\Documents\zhesen-brain` (xem mục cuối) và trong `docs/superpowers/`.

## Dự án là gì
zhesen là app từ điển và học ngôn ngữ đa ngữ (en, es, zh): Next.js 16 App Router +
React 19 + Supabase (qua `@supabase/ssr`) + Tailwind 4 + Zod 4 + hanzi-writer. Branch
`dictionary` đang hoàn thiện trang tra cứu chi tiết, cross-language, thông tin chữ Hán,
stroke order.

## 🔴 Rule cứng (YOU MUST, không được bỏ dù phiên dài tới đâu)
1. **Chưa chạy verify thì CHƯA "xong". Build/test/tsc xanh là điều kiện CẦN, KHÔNG đủ**
   (đây là lỗi số 1 trong lịch sử dự án, xem `docs/superpowers/research/2026-07-01-claude-recurring-mistakes.md`).
   Trước khi nói hoàn thành phải đủ:
   - Chạy `npm run lint`, `npm run test`, và `npx tsc --noEmit` (exit 0). Test xanh KHÔNG
     bảo đảm type sạch.
   - Tính năng UI: MỞ APP CHẠY THẬT và tự bấm thử (`next start` hoặc dev trên MỘT port cố
     định; kill process giữ port cũ trước, đừng để Next nhảy port). Dán bằng chứng runtime.
   - Bước dữ liệu: chạy COUNT/query thật và dán số liệu, đừng mô tả quy mô bằng cảm tính.
   - `git status` sạch: không để file test, `*.log`, `*.png`, JSONL tạm ở gốc repo.
   Test fail thì nói fail kèm output, không che.
2. **Sửa tối thiểu, đúng phạm vi.** Đọc code xung quanh trước khi sửa. Không refactor
   ngoài yêu cầu, không xóa hay đổi thứ đang chạy nếu không chắc chắn.
3. **Luôn typed, validate dữ liệu ngoài.** Không dùng `any` lén. Dữ liệu từ Supabase
   hoặc API phải validate bằng Zod `.parse()`, không cast ngầm (cast ngầm là nguồn lỗi
   runtime hay gặp trong repo này).
4. **Test theo pattern có sẵn.** Test đặt ở `test/`, dùng vitest + Testing Library, mock
   Supabase bằng chainable builder; dialog dựa vào polyfill `showModal` ở `test/setup.ts`.
5. **Bám convention codebase, đừng tự chế.** Khảo sát convention hiện có TRƯỚC khi tạo mới,
   giữ nhất quán (đừng để convention trôi dần qua từng lần sửa). Module snake_case, component
   PascalCase, file test `*.test.ts(x)` trong `test/`. Route path tiếng Anh (danh từ đơn, vd
   `/wordlist`, `/learn`), nhãn UI tiếng Việt; KHÔNG đặt route tiếng Việt kiểu `/tra-cuu`.

## 🔴 Gotcha version (đừng code theo trí nhớ cũ)
- **Next.js 16.2.9 + React 19.2.4:** API và file-structure khác bản cũ. Đọc
  `node_modules/next/dist/docs/` phần liên quan TRƯỚC khi viết code. Để ý deprecation.
- **Ranh giới Server/Client Component:** component mặc định là Server Component. Mọi truy
  cập `window`/`localStorage`/`document` phải nằm sau `'use client'` và KHÔNG gọi ở
  top-level module scope, nếu không SSR ném `ReferenceError: window is not defined`.
  `params`/`searchParams` ở route động là Promise, phải `await`.
- **Supabase qua `@supabase/ssr`:** server component dùng `await createClient()`
  (cookie-aware) từ `lib/supabase/server`; client dùng `useMemo(() => createClient(), [])`
  từ `lib/supabase/client`, đừng tạo client mới mỗi render. Anonymous auth khởi tạo ở
  middleware `proxy.ts`, đừng phá cookie sync.
- **Tailwind 4:** cấu hình ở `app/globals.css`, không còn `tailwind.config.js` kiểu cũ.
- **Search route** dùng `unstable_cache` với tag `['lex']`; data đổi thì cache không tự
  revalidate (đó là việc của pipeline), đừng tưởng kết quả search luôn tươi.

## Bản đồ kiến trúc (chi tiết trong vault)
- `app/`: routes App Router. Chính: `/`, `/dictionary` và `/dictionary/[lang]/[id]`,
  `/practice/*` (review, quiz, match, write, speak, dictation), `/wordlist`, `/learn/[lang]`.
- `lib/`: logic không phụ thuộc UI. `dictionary/` (search, entryDetail, rows, crosslang,
  conjugation, radicals, pos), `wordlist/` (store, review, stats, tags, csv), `practice/`
  (match, quiz, typing), `progress/` (thuật toán lặp lại ngắt quãng), `hooks/` (hook
  React dùng chung), `supabase/` (client/server), `reader/` (tokenize), `languages.ts`.
- `components/`: `lookup/`, `wordlist/`, `practice/`, `search/`, `reader/`, `learn/`,
  `home/`, `layout/`, `ui/`.
- **`app/` chỉ chứa route, layout và `globals.css`.** Không đặt component trong đó; mọi
  component nằm dưới `components/<nhóm>/`. Hook React nằm ở `lib/hooks/`, không nằm lẫn
  trong `lib/wordlist/`.
- `supabase/`: migrations. Schema `lex.*` read-only cho anon; `public.user_words` và
  `public.review_log` dùng RLS theo user.
- **Mapping bắt buộc nhớ:** DB dùng snake_case, TS dùng camelCase; chuyển đổi làm explicit
  trong parser (`lib/dictionary/`, `lib/wordlist/store.ts`).
- **Đã gỡ bỏ (2026-09-12), đừng dựng lại:** `lib/content/` (lớp trừu tượng ContentSource,
  thay bằng hằng số ở `lib/languages.ts`), `lib/quiz/` (trùng `lib/wordlist/quiz.ts`),
  `lib/progress/ProgressStore.ts` cùng `SupabaseProgressStore.ts` (tầng lưu trữ SRS cũ
  cho hệ bài học POC), `components/Flashcard.tsx`, `components/Quiz.tsx`, `lib/sanity.ts`.
  Tất cả đều đã xác minh không còn nơi gọi trước khi xoá.

## Red flags đã biết (dễ vấp, cẩn thận)
- Dialog `showModal()` race với React Strict Mode (effect double-invoke), cần guard
  `if (open && !el.open)`.
- File lớn đọc kỹ trước khi đụng: `components/wordlist/WordlistClient.tsx`,
  `components/wordlist/AddWordDialog.tsx`.
- Vitest: PHẢI import tường minh lifecycle hook (`beforeEach`...) dù có `globals: true`,
  nếu không `tsc` báo TS2304. Mock constructor (vd `Audio`) bằng `vi.fn(function(){...})`,
  KHÔNG dùng arrow function (arrow không phải constructor).
- **React 19 lint:** `react-hooks/purity` cấm gọi `Date.now()` trong thân component.
  Cách xử lý đã chọn: cho hàm ở tầng dữ liệu nhận `now: number = Date.now()` làm tham số
  mặc định, nơi gọi bỏ đối số đi. KHÔNG dùng `eslint-disable` để bịt.
- **Hook `verify-gate.ps1`** lấy danh sách file từ `git status`; file đã xoá phải được lọc
  bằng `Test-Path`, nếu không eslint báo "No files matching the pattern" và chặn nhầm.
- **Migration áp thẳng bằng SQL phải tự ghi vào `supabase_migrations.schema_migrations`.**
  Repo này chưa link Supabase CLI (không có `supabase/config.toml`) nên migration được
  chạy trực tiếp qua kết nối Postgres. Quên ghi bảng theo dõi thì lần `db push` sau sẽ
  chạy lại migration đó.
- **Mọi `update` trong migration phải idempotent theo trạng thái ĐÍCH, không phải theo
  trạng thái NGUỒN.** Migration `0017` từng chỉ lọc theo cột `srs_*` cũ; vì các cột đó
  đóng băng sau khi chuyển sang FSRS, chạy lại sẽ ghi đè tiến độ ôn tập thật. Nay đã thêm
  guard theo cột `fsrs_*`.
- **`unaccent()` là STABLE, không phải IMMUTABLE**, nên không dùng trực tiếp trong
  generated column hay index được (`ERROR 42P17`). Hai cách đã dùng: text search
  configuration `lex.zhesen_en`/`lex.zhesen_es` có `unaccent` trong chain dictionary, và
  hàm bọc `extensions.immutable_unaccent()` cho chỗ không đi qua tsvector.
- **Pinyin lấy từ `lex.entries.attributes->>'pinyin'`** (phủ 100% entries zh, kể cả từ
  nhiều âm tiết), KHÔNG phải `lex.characters.pinyin` (chỉ theo từng ký tự đơn).
- **`VACUUM` thường KHÔNG trả dung lượng về đĩa**, chỉ đánh dấu chỗ trống để tái dùng.
  Sau khi xoá hàng loạt phải chạy `vacuum full <bảng>` mới thấy `pg_database_size` giảm.
- **`pg_database_size` lớn hơn tổng `pg_total_relation_size` của `lex` và `public`.**
  Phần chênh nằm ở `pg_catalog`, `auth`, `storage` và chỗ trống trong tệp dữ liệu. Muốn
  biết chỗ nào phình thì nhóm theo schema, đừng chỉ nhìn hai schema quen thuộc.
- **PGroonga giữ dữ liệu index trong tệp riêng, Postgres không nhìn thấy.**
  `pg_relation_size` của cả hai index PGroonga đều trả về 0, nên phần chênh giữa
  `pg_database_size` và tổng `pg_total_relation_size` chính là PGroonga, không phải
  chỗ trống trong bảng. Đo ngày 2026-09-12: 425 MB tổng, 227 MB bảng, 198 MB là
  PGroonga.
- **KHÔNG chạy `VACUUM FULL` trên `lex.entries`.** Nó dựng lại index, PGroonga tạo
  một bộ tệp Groonga mới theo `relfilenode` mới, còn bộ cũ nằm lại. Đã đo: cơ sở dữ
  liệu **phình từ 425 MB lên 486 MB**. Muốn dọn thì chạy `vacuum lex.entries` thường
  (không FULL): PGroonga móc vào đó để xoá đối tượng Groonga không còn dùng. Một lần
  chạy trả lại 105 MB, còn 381 MB.
  Kiểm tra đối tượng thừa: `select extensions.pgroonga_command('object_list')`, các
  khoá `Sources<relfilenode>` phải khớp `relfilenode` của index đang sống trong
  `pg_class`. Nguồn: https://pgroonga.github.io/reference/functions/pgroonga-vacuum.html
- **Gói Supabase Free trần 500 MB.** Tính tới 2026-09-12 database ở khoảng 400 MB. Trước
  khi nạp thêm dữ liệu phải đo trước và đặt ngân sách, đừng nạp rồi mới đếm.
- **Kiểm giấy phép TRƯỚC khi nạp, và đọc đủ chữ.** Chinese Grammar Wiki của AllSet
  Learning là CC BY-NC-SA 3.0, trang bản quyền cấm cả web có quảng cáo. Một báo cáo
  nghiên cứu từng ghi gọn là "Creative Commons" và suýt kéo dự án vào ràng buộc phi
  thương mại. CEFR-J cũng vậy: danh sách chính A1-B2 KHÔNG phải CC-BY-SA, chỉ phần
  Octanove C1/C2 mới là.
- **Build trước khi bấm thử.** `next start` phục vụ bản đã build; sửa mã xong mà không
  build lại thì đang bấm thử mã cũ. Đã vấp đúng lỗi này khi nghiệm thu tìm kiếm.
- **Postgres chỉ dùng index cho chuỗi `OR` khi MỌI nhánh là điều kiện trên đúng cái bảng
  đang quét.** Thêm một nhánh với tới bảng khác (join hay subplan) là mất bitmap, quét
  toàn bảng. Khi cần thêm nguồn khớp mới cho `lex.search`, viết thành một nhánh `UNION`
  riêng trong CTE `cand`, đừng nối thêm `or`.
- **Xếp hạng trước, làm giàu dữ liệu sau.** Các subquery lấy nghĩa/phát âm/audio phải chạy
  sau `limit`, không phải cho mọi ứng viên. `lex.search` và `lex.search_vi` đều theo khuôn
  này; giữ nguyên khi sửa.
- **`= any (subquery)` bị hiểu là dạng `IN`, không phải dạng mảng.** Muốn so với một mảng
  trả từ CTE phải ép kiểu: `e.id = any ((select ids from t)::text[])`. Không ép thì lỗi
  `operator does not exist: text = text[]`.
- **Chặn số lượng ứng viên phải nằm SAU bộ lọc ngôn ngữ, không phải trước.** Chặn trước
  thì một truy vấn thu hẹp về một ngôn ngữ lại được phục vụ từ tập lấy chung cả ba.
- **`s-maxage` không nói gì với trình duyệt.** Chỉ đặt mỗi nó thì trình duyệt tự suy ra độ
  tươi và giữ bản cũ; `revalidateTag` trên máy chủ không với tới được bản đó. Route API
  cache phải tách: `Cache-Control` cho trình duyệt, `CDN-Cache-Control` cho CDN.
- **Tệp audio của Wiktionary không phải lúc nào cũng đọc đúng từ đó.** `En-uk-a_cat.ogg`
  đọc "a cat" và nằm ngay trên mục từ "cat"; `En-uk-to_have.ogg` đọc "to have". Mọi
  nơi lấy `audio_url` phải đi qua `audioMatchesHeadword` (`lib/dictionary/pronunciation.ts`):
  tên tệp tách theo dấu `-`, phần đuôi phải đúng bằng từ. Đo trên 699 bản ghi: 631 khớp.
- **Không đọc bằng giọng sai ngôn ngữ.** `speechSynthesis` nhận utterance kể cả khi máy
  không có giọng cho ngôn ngữ đó, và phát ra im lặng. Tiếng Trung không có một bản ghi
  nào (0/4042), nên trên máy chưa cài giọng tiếng Trung thì nút phát âm chết lặng. Nay
  `AudioButton` kiểm tra danh sách giọng trước và đổi sang biểu tượng tắt tiếng kèm lý do.
- **Mọi chế độ luyện tập PHẢI ghi vào lịch FSRS.** Trước đây `gradeCard` chỉ được gọi từ
  `WordlistReview`, nên quiz, viết, chép chính tả, ghép đôi và luyện nói không ghi cột
  `fsrs_*` nào: người dùng luyện cả buổi mà hàng đợi ôn hôm sau y nguyên. Thêm chế độ mới
  thì gọi `gradeForMode` (`lib/practice/grading.ts`) rồi `gradeWordById`
  (`lib/wordlist/review.ts`). Luyện nói cố tình KHÔNG báo thất bại: nhận dạng giọng sai vì
  phòng ồn hay micro, ghi `again` sẽ xoá tiến độ thật vì một lỗi phần cứng.
- **Middleware KHÔNG tạo phiên ẩn danh nữa.** Tra cứu không cần tài khoản, nên tài khoản
  chỉ sinh ra ở lần ghi đầu tiên (`lib/supabase/session.ts`). Trước đây mỗi request không
  cookie đều tạo một hàng `auth.users`: 122 tài khoản mà chỉ 1 có dữ liệu, và khi chạm
  trần đăng nhập của Supabase thì người dùng thật cũng không có phiên. Thêm đường ghi mới
  thì gọi `ensureSession` ở đó.

## Cách làm việc ở đây
- Việc lớn theo luồng spec, plan, implement, review (superpowers; spec và plan ở
  `docs/superpowers/`).
- Roadmap cải tiến tiếp theo: `docs/superpowers/specs/2026-06-20-zhesen-improvement-roadmap.md`
  (12 fix F1 tới F12).
- Sau mỗi task đáng kể: ghi 1 lesson vào vault `zhesen-brain/lessons/`. Lỗi lặp lại nhiều
  lần thì thăng cấp thành rule trong chính file này.

