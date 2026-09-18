<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

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

- **Server và Client Component.** Mặc định là Server Component. Mọi truy cập `window`,
  `localStorage`, `document` phải nằm sau `'use client'` và không được gọi ở top-level
  module scope, nếu không SSR ném `ReferenceError: window is not defined`.
- `params` và `searchParams` ở route động là Promise, phải `await`.
- **Supabase qua `@supabase/ssr`:** server component dùng `await createClient()` từ
  `lib/supabase/server`; client dùng `useMemo(() => createClient(), [])` từ
  `lib/supabase/client`, đừng tạo client mới mỗi lần render.
- **Tailwind 4** cấu hình trong `app/globals.css`, không còn `tailwind.config.js`.
- **Route segment động KHÔNG vào được route cache nếu thiếu `generateStaticParams`.**
  Trang chỉ đọc `unstable_cache` vẫn bị render lại cho từng request và trả
  `Cache-Control: private, no-cache, no-store`, nên CDN không giữ gì: đo trên
  production, mỗi lần vào lại `/dictionary/en/hello` đều `X-Vercel-Cache: MISS` và
  tốn 258 tới 314 ms, tới 4.513 ms khi function nguội. Khai `generateStaticParams`
  trả mảng rỗng là đủ, `dynamicParams` mặc định `true` lo phần còn lại; kèm
  `revalidate` thì trang xuống còn 128 tới 144 ms và `HIT`. Thêm route đọc dữ liệu
  cached mà không đụng request thì khai luôn.
- **`proxy.ts` chỉ được khớp route thật sự đọc session.** Matcher rộng bắt cả tệp
  trong `public/`: đo trên production, `/robots.txt` bị khớp mất 178 ms còn
  `/icon.svg` được loại trừ mất 115 ms, cùng là tệp tĩnh CDN trả về. Nó còn có thể
  gắn `Set-Cookie` lên một response đáng ra cache được, và Vercel không cache
  response có `Set-Cookie`.
- **`Link` nạp trước ngay khi vào khung nhìn.** Header nằm trên mọi trang, nên mọi
  lần mở trang từng nạp trước `/practice`, `/wordlist`, `/login`, `/register`, bốn
  lần render đều hỏi Supabase. Link tới route dynamic đọc session phải
  `prefetch={false}`.
- **Trong trình duyệt dùng `auth.getSession()`, trên server dùng `auth.getUser()`.**
  `getUser` là một vòng tới máy chủ auth mỗi lần gọi, và `useAccount` chỉ quyết định
  vẽ link nào. Chính auth-js đã cài viết vậy trong JSDoc của `getUser`. Quyền vẫn do
  `requirePermanentAccount` trên server và RLS quyết định.
- Route tìm kiếm và `lib/dictionary/cached.ts` dùng `unstable_cache` với tag `['lex']`.
  **Không có gì tự gọi `POST /api/revalidate`.** Repo pipeline không nhắc tới nó ở bất
  kỳ đâu (`grep -rni revalidate` trong `zhesen-pipeline`, bỏ `.venv`, ra 0 dòng), nên
  cửa sổ `revalidate: 3600` là bảo đảm tươi duy nhất: dữ liệu mới nạp xong có thể mất
  tới một giờ mới hiện. Muốn thấy ngay thì gọi tay `/api/revalidate` kèm
  `REVALIDATE_SECRET`. Đừng đổi `revalidate` thành `false` khi chưa có ai gọi hàm đó.
- **Vitest:** phải import tường minh lifecycle hook (`beforeEach`...) dù đã bật
  `globals: true`, nếu không `tsc` báo TS2304. Mock constructor như `Audio` bằng
  `vi.fn(function(){...})`, KHÔNG dùng arrow function vì arrow không phải constructor.
- **React 19 lint:** `react-hooks/purity` cấm gọi `Date.now()` trong thân component.
  Cách đã chọn: hàm ở tầng dữ liệu nhận `now: number = Date.now()` làm tham số mặc
  định, nơi gọi bỏ đối số đi. KHÔNG dùng `eslint-disable` để bịt.
- Dialog `showModal()` đua với React Strict Mode (effect chạy hai lần), cần guard
  `if (open && !el.open)`.
- **Preflight của Tailwind 4 đặt `margin: 0` cho MỌI thẻ, kể cả `<dialog>`.** Trình
  duyệt căn giữa dialog modal bằng `margin: auto` của UA stylesheet, nên mất nó là
  cả ba hộp thoại dính góc trên bên trái (đo được x=0, y=0 trong khung 1396x700).
  `components/ui/Modal.tsx` phải giữ lớp `m-auto`; jsdom không áp UA stylesheet nên
  test chỉ kiểm được chính lớp đó.

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
- **Mọi function trong `lex` phải ghim `search_path`, đừng đi qualify từng toán tử.**
  `%`, `&@`, `&@~` đều nằm trong schema `extensions`, nên function trả lời hay ném lỗi
  là tuỳ `search_path` của người gọi. `anon` và `authenticated` có `extensions` nên ứng
  dụng không thấy; role khác thì `SQLSTATE 42883`. Đã thử cách qualify từng toán tử ba
  lần (`0034`, `0039`, `0042`) và mỗi lần lệnh tiếp theo lại hỏng ở toán tử kế: sau khi
  `0042` sửa `%` trong `lex.search` thì `lex.search('習', array['zh'], 8)` hỏng tiếp ở
  `&@`. `0043` ghim `search_path = lex, extensions, public` cho cả tám function, phủ mọi
  toán tử kể cả nhánh chưa ai viết. Năm function trong `public` đã làm vậy từ `0032`.
  Thêm function mới vào `lex` thì ghim luôn. Nguồn:
  https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
- **Dung lượng index PGroonga KHÔNG tỷ lệ với số hàng, nên index bộ phận không tiết
  kiệm được gì.** `lex.entries.traditional` chỉ có giá trị ở 2.358 hàng trên 36.361, nên
  một index bộ phận `where traditional is not null` nghe như sẽ nhỏ hơn mười lần. Đã dựng
  thử và đo bằng `pgroonga_command('object_inspect', array['name', 'Sources<relfilenode>'])`:
  bản bộ phận có `n_records` 2.358 thay vì 36.361 nhưng `disk_usage` y hệt, tổng cả bốn
  đối tượng đều là 39.227.392 byte, và `pg_database_size` tăng đúng 38 MB rồi trở lại
  383 MB sau khi xoá. Mỗi index PGroonga tốn một khoản cố định khoảng 37 tới 42 MB bất kể
  dữ liệu. Muốn giảm thì phải bỏ hẳn index, không có đường đi vòng.
- **`idx_scan` KHÔNG dùng được để đánh giá index PGroonga.** Cả hai index PGroonga đều
  báo `idx_scan` = 0 trong `pg_stat_user_indexes` trong khi `idx_tup_read` vẫn tăng, và
  `explain (analyze) select * from lex.search('習', array['zh'], 8)` cho `Index Scan using
  idx_lex_entries_headword_pgroonga`. Đã có một lần suýt xoá hai index này vì đọc
  `idx_scan` = 0 là "không ai dùng". Muốn biết index có được dùng không thì đọc execution
  plan, đừng đọc bộ đếm.
- **`vercel.json` ghim function ở `icn1` vì database ở `ap-northeast-2`.** Mặc định của
  Vercel là `iad1` Washington, tức mỗi truy vấn trượt cache đi vòng qua Mỹ rồi sang Seoul.
  Chuyển database sang region khác thì phải đổi `regions` theo, nếu không mất đúng khoản
  vừa tiết kiệm. Mã region: https://vercel.com/docs/regions
- **`lex.search_vi` ghim `pg_trgm.similarity_threshold = 0.45` trên chính function**
  (`0044`). Mặc định 0,3 làm toán tử `%` lấy ra 19.206 dòng để giữ 166: đo trên
  `lex.search_vi('bầu trời', array['en','es','zh'], 24)` thì recheck chiếm 3.116 ms trong
  3.461 ms, và 3.350 heap block xuống còn 1.187 ở 0,45. Chất lượng không đổi, đo trên 18
  lượt tra: ba kết quả đầu y nguyên, 16 lượt vẫn đủ 24 dòng. Viết lại function thì giữ
  `SET` đó, và nhớ `select extensions.similarity('a','b')` trước khi `alter function ...
  set pg_trgm.*`: pg_trgm không preload nên GUC còn là placeholder và lệnh báo
  `42501 permission denied to set parameter`. KHÔNG đặt ngưỡng này ở role hay database:
  `lex.search` và `lex.suggest` khớp headword ngắn và chiều xuôi đã nhanh.
- **Role `anon` bị ghim `statement_timeout = 3s`**, `authenticated` là 8 giây. Một câu
  truy vấn nguội vượt 3 giây trả `SQLSTATE 57014` chứ không chỉ chậm, và build chết theo
  vì `/learn/[lang]` dựng sẵn lúc build: đã xảy ra ở `/learn/en` với `canceling statement
  due to statement timeout`, chạy lại thì xanh. Gói Free là compute Nano, `shared_buffers`
  224 MB trên 383 MB dữ liệu, nên đuôi dài là đọc đĩa chứ không phải shape truy vấn.
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
- **Tài khoản ẩn danh nằm trong cookie của MỘT trình duyệt.** Xoá dữ liệu duyệt web
  là mất sạch: đã xảy ra thật, 407 từ đã lưu nằm lại trong một tài khoản không còn
  đường nào với tới, trong khi trình duyệt đang dùng chỉ thấy 1 từ. `lib/auth/account.ts`
  là lối thoát: `attachEmail` gắn email vào CHÍNH tài khoản đang có nên giữ nguyên
  user id và mọi hàng treo dưới nó; `signInByEmail` chỉ dành cho trình duyệt chưa có
  từ nào, và từ chối nếu phiên hiện tại đang có dữ liệu, vì đăng nhập là đổi tài
  khoản và sẽ bỏ rơi đúng thứ cần cứu.
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

## Trợ lý AI

- Khoá model chỉ nằm ở máy chủ: mọi lời gọi đi qua `POST /api/ai` (`lib/ai/`). KHÔNG
  đặt biến `NEXT_PUBLIC_` cho nó.
- `aiConfig()` trả null là trạng thái HỢP LỆ, không phải lỗi. Router mà dự án trỏ tới
  nằm trong mạng riêng, nên bản triển khai không với tới được sẽ trả
  `{"enabled": false}` và mọi nút trợ lý biến mất thay vì bấm vào là hỏng.
- **Cùng một đường `/v1/messages` trả hai kiểu thân phản hồi.** Có `stream: false` thì
  ra thân `chat.completion` kiểu OpenAI, còn khi stream thì ra sự kiện kiểu Anthropic.
  `lib/ai/client.ts` đọc được cả hai; đừng rút gọn còn một. Đo trên router ngày 2026-09-14.
- Thêm tác vụ mới thì khai trong `lib/ai/tasks.ts` (schema vào, schema ra, prompt) rồi
  thêm một dòng vào `ERASED_TASKS`. Route không cần sửa.

## Đã gỡ bỏ, đừng dựng lại

Tất cả đều đã xác minh không còn nơi gọi trước khi xoá, ngày 2026-09-12:
`lib/content/` (lớp trừu tượng ContentSource, thay bằng hằng số ở `lib/languages.ts`),
`lib/quiz/` (trùng `lib/practice/quiz.ts`), `lib/progress/ProgressStore.ts` cùng
`SupabaseProgressStore.ts` (tầng lưu trữ SRS cũ), `components/Flashcard.tsx`,
`components/Quiz.tsx`, `lib/sanity.ts`. Trang `/reader` đã cắt khỏi phạm vi, nhưng
`components/reader/` vẫn dùng trong `lookup` và `grammar`, đừng xoá nhầm.

## Đi tiếp

Spec và plan còn hiệu lực ở `docs/superpowers/`, bắt đầu từ [`docs/README.md`](docs/README.md).
Tri thức sâu và lesson từng task nằm trong vault `C:\Users\Hiep\Documents\zhesen-brain`.
Sau mỗi task đáng kể, ghi một lesson vào vault; lỗi nào lặp lại nhiều lần thì nâng thành
một dòng trong chính file này, và cắt bớt dòng đã hết giá trị để file không phình.
