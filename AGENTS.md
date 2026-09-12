
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
- `lib/`: logic không phụ thuộc UI. `dictionary/` (search, crosslang, conjugation,
  radicals, characters), `progress/` (thuật toán lặp lại ngắt quãng), `wordlist/`
  (store, review, quiz, stats), `supabase/` (client/server), `reader/` (tokenize),
  `languages.ts` (ba ngôn ngữ đích, hằng số).
- `components/`: `lookup/`, `wordlist/`, `search/`, `reader/`.
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
- File lớn đọc kỹ trước khi đụng: `app/wordlist/WordlistClient.tsx` (~467 dòng),
  `components/wordlist/AddWordDialog.tsx` (~289).
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
  configuration `lex.chesen_en`/`lex.chesen_es` có `unaccent` trong chain dictionary, và
  hàm bọc `extensions.immutable_unaccent()` cho chỗ không đi qua tsvector.
- **Pinyin lấy từ `lex.entries.attributes->>'pinyin'`** (phủ 100% entries zh, kể cả từ
  nhiều âm tiết), KHÔNG phải `lex.characters.pinyin` (chỉ theo từng ký tự đơn).
- **Build trước khi bấm thử.** `next start` phục vụ bản đã build; sửa mã xong mà không
  build lại thì đang bấm thử mã cũ. Đã vấp đúng lỗi này khi nghiệm thu tìm kiếm.

## Cách làm việc ở đây
- Việc lớn theo luồng spec, plan, implement, review (superpowers; spec và plan ở
  `docs/superpowers/`).
- Roadmap cải tiến tiếp theo: `docs/superpowers/specs/2026-06-20-zhesen-improvement-roadmap.md`
  (12 fix F1 tới F12).
- Sau mỗi task đáng kể: ghi 1 lesson vào vault `zhesen-brain/lessons/`. Lỗi lặp lại nhiều
  lần thì thăng cấp thành rule trong chính file này.

