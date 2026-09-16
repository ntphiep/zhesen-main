# Đợt rà soát toàn dự án zhesen, báo cáo tổng thể, 2026-09-16

Tài liệu này trả lời một câu hỏi: kể từ lúc nhận việc tới giờ đã làm được gì, đang làm
gì, còn nợ gì. Viết cho người không theo dõi quá trình.

Hai việc được giao:

1. Rà toàn bộ dự án, sửa bug, điểm yếu, anti-pattern, chỗ thiếu quy ước và thiếu nhất
   quán. Tối ưu hiệu năng ở cả giao diện, database và logic backend. Xoá dấu vết AI slop.
2. Nghĩ một phương án lưu trữ dữ liệu ngôn ngữ và database backend tối ưu cả về hiệu năng
   lẫn chi phí, có kiểm tra hạ tầng AWS đang có credit.

## Trạng thái một dòng

Việc 1 đã làm xong phần lớn và đang nằm trong working tree chưa commit: 108 file đổi,
1.135 dòng thêm, 541 dòng xoá, 26 file mới, 6 migration đã chạy lên production. Việc 2 đã
xong dưới dạng báo cáo có số đo, kết luận là không chuyển database đi đâu cả. Phần còn nợ
lớn nhất là chưa commit, chưa deploy, và một lỗi hydration ở trang mục từ chưa truy ra
nguyên nhân.

## Phần A. Việc 1, rà soát và sửa

### A1. Lỗi thật đã sửa

Đây là những chỗ sai gây hậu quả quan sát được, không phải chuyện thẩm mỹ.

| Chỗ sai | Hậu quả | Đã sửa ở |
| --- | --- | --- |
| `lex.search_vi` nối thẳng chuỗi người dùng gõ vào một regex | Gõ `a((` vào ô tìm kiếm làm Postgres trả `SQLSTATE 2201B`, người dùng nhận HTTP 500 | `supabase/migrations/0036_search_vi_escape_regex.sql` |
| `lex.search_vi` dùng toán tử trigram `%` không kèm schema | Truy vấn nhiều từ như `con chó` trả `SQLSTATE 42883: operator does not exist: text % text` với role không có `extensions` trong `search_path` | `supabase/migrations/0039_search_vi_qualify_trgm_operator.sql` |
| `lex.suggest` viết kiểu không dùng được index trigram | Trung bình 1.278 ms trên 501 lượt theo `pg_stat_statements`. Đo lại sau khi sửa: 170 ms thực thi | `supabase/migrations/0034_suggest_uses_trigram_index.sql` |
| Ba bảng `lex.sources`, `lex.images`, `lex.entry_characters` không có policy cho anon | Người chưa đăng nhập không đọc được, trang mục từ thiếu dữ liệu | `supabase/migrations/0037_lex_anon_read_remaining_tables.sql` |
| Parser CSV coi dấu nháy kép ở giữa trường là mở trường trích dẫn, và coi một ký tự CR đơn lẻ là xuống dòng | Import file CSV hợp lệ báo lỗi sai hoặc cắt sai dòng. Số dòng báo lỗi cũng lệch so với file thật | `lib/wordlist/csv.ts` |
| Trang ngữ pháp gọi Supabase cho từng câu ví dụ từ trình duyệt | Mỗi trang là một chuỗi request nối tiếp, dạng N+1 | `app/grammar/[lang]/[id]/page.tsx`, `components/grammar/GrammarPointDetailView.tsx` |
| Trang mục từ gọi `getCachedWordKin` tách rời khỏi lô truy vấn song song | Một round trip thừa trên mỗi lần mở mục từ | `app/dictionary/[lang]/[id]/page.tsx` |
| Trang học gọi hai truy vấn nối tiếp | Thêm một round trip | `app/learn/[lang]/[level]/page.tsx` |
| Nút tài khoản ở header không render gì cho tới khi biết loại tài khoản | Header nhảy 186 px sau khi hydrate | `components/account/AccountLink.tsx` |
| Bảng trợ lý AI gọi `GET /api/ai` mỗi lần tải trang | Một request thừa trên mọi trang, kể cả trang không có nút trợ lý. Đo lại sau khi sửa: trang chủ và trang ngữ pháp không còn request nào, trang mục từ vẫn còn một vì `AiCoach` nằm sâu trong cây client và chạy effect trước bảng trợ lý ở layout | `app/layout.tsx`, `lib/hooks/useAiEnabled.ts` |
| `POST /api/ai` chỉ có một ngân sách chung 60 lượt mỗi phút cho tất cả mọi người | Một script có thể lấy hết ngân sách trợ lý của cả site mà không tốn gì | `lib/http/rateLimit.ts` |
| Truy vấn `profiles` thiếu bộ lọc | Vỡ đúng với tài khoản admin | `lib/auth/profile.ts` |
| Thiếu `lex.resolve_inflections` | Tra một dạng biến đổi như `ran` không về được `run` qua đường server | `supabase/migrations/0035_resolve_inflections.sql` |
| Thiếu index cho cột `traditional` | Quét bảng khi tra chữ phồn thể | `supabase/migrations/0038_entries_traditional_index.sql` |
| `safeNext` trả về đường dẫn mà người gọi phân giải lần thứ hai. `/..//evil.com` thành `//evil.com`, qua được kiểm tra origin, rồi biến thành protocol-relative | Open redirect: người dùng đăng nhập thật trên đúng tên miền rồi bị đẩy sang trang của kẻ tấn công. Dùng cho phishing | `lib/auth/redirect.ts` |
| `SITE_URL` rơi về `http://localhost:3000` trong bản deploy, vì build chạy qua `vercel build --prod` trên GitHub Actions và tệp `.vercel/.env.production.local` không có `VERCEL_PROJECT_PRODUCTION_URL` | sitemap.xml, dòng Sitemap của robots.txt, canonical và og:url của mọi trang đều trỏ về localhost | `lib/site.ts` |
| `resolveTokens` lọc `lex.inflections` trên cột `form_text` không có index | Parallel Seq Scan 1709 ms, đã có lần bị Postgres huỷ với `SQLSTATE 57014`. Đổi sang `lex.resolve_inflections`: 65 ms, dùng `idx_lex_infl_form_norm` | `lib/dictionary/resolveTokens.ts` |

### A2. Chuẩn hoá và hạ tầng ứng dụng

- Thêm `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx` và test đi kèm. Trước
  đó một lỗi runtime cho ra trang trắng mặc định của Next.
- Thêm `app/robots.ts`, `app/sitemap.ts`, `lib/site.ts`, và `pageMetadata` cho từng trang.
  Trước đó mọi trang dùng chung một tiêu đề.
- Thay `app/favicon.ico` mặc định của create-next-app bằng `app/icon.svg` và
  `app/apple-icon.png` của dự án.
- Thêm `lib/zod.ts` để mọi nơi dùng chung một instance zod, `lib/supabase/env.ts` để đọc
  biến môi trường ở một chỗ, `lib/http/percentDecode.ts`, `lib/http/routeParam.ts`,
  `lib/auth/guard.ts`, và `app/practice/layout.tsx` để guard nằm một chỗ thay vì lặp ở sáu
  trang luyện tập.
- Thêm `components/ui/ConfirmDialog.tsx` và `components/ui/Notice.tsx`, thay các hộp thoại
  và khối thông báo viết lại từng nơi.
- `vitest.config.ts` chia test theo nhóm và đặt môi trường đúng cho từng nhóm.
- Gỡ đường dẫn cá nhân ra khỏi `.claude/settings.json` đã commit, chuyển sang
  `.claude/settings.local.json` và gitignore file đó.
- Xoá `SUPABASE_SERVICE_ROLE_KEY` khỏi `.env` của repo app. Mã của app không đọc biến này ở
  đâu cả; repo pipeline vẫn giữ bản của nó và không bị ảnh hưởng.

### A3. Bảo vệ `POST /api/ai`, quyết định đã tự chọn

Vấn đề: hàm `clientKey` trong `lib/http/rateLimit.ts` chỉ chịu đọc header
`x-forwarded-for` khi biến `TRUST_PROXY_HEADER` được đặt. Không đặt thì nó trả null, và
mọi khách đổ chung vào một ngân sách toàn cục 60 lượt mỗi phút. Một người chạy script lấy
sạch ngân sách đó, mọi người khác nhận thông báo bận.

Đã đọc doc Vercel ([request headers](https://vercel.com/docs/headers/request-headers)): Vercel ghi đè header
`x-forwarded-for` ở biên và không chuyển tiếp giá trị bên ngoài, trừ khách hàng Enterprise
bật trusted proxy. Dự án này không phải Enterprise. Vercel cũng đặt biến hệ thống
`VERCEL=1` trên mọi deployment
([system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)).

Cách sửa: `clientKey` tin header khi `TRUST_PROXY_HEADER=1` hoặc `VERCEL=1`. Nghĩa là trên
bản deploy thật, giới hạn theo địa chỉ chạy được ngay, không cần cấu hình thêm. Trên máy
chạy `next start` trần thì header vẫn bị bỏ qua, vì ở đó nó là thứ người gửi tự viết.
Ngân sách toàn cục giữ nguyên làm lớp thứ hai.

Không thêm đăng nhập bắt buộc cho trợ lý, vì người tra cứu chưa có tài khoản cũng đang
dùng được nút này, và bắt đăng nhập là đổi sản phẩm chứ không phải sửa lỗi.

Đã có test chứng minh: một địa chỉ bị chặn sau 20 lượt trong phút, địa chỉ khác vẫn đi
qua. Xem `test/ai-route.test.ts` và `test/http-rate-limit.test.ts`.

### A5. Soát lại trước khi push

Hai reviewer độc lập đọc toàn bộ diff trước khi push và đều kết luận chưa an toàn.
Ba dòng cuối của bảng trên là những gì họ tìm ra, tôi xác minh lại từng cái rồi mới sửa:

- Open redirect: chạy `safeNext` trực tiếp trên node, `/..//evil.com` cho ra `//evil.com`,
  và `new URL('//evil.com', origin)` cho ra `https://evil.com/`. Đã thêm test.
- `SITE_URL`: `.vercel/.env.production.local` trên máy này có `VERCEL`, `VERCEL_ENV`,
  `VERCEL_TARGET_ENV`, `VERCEL_URL` nhưng không có `VERCEL_PROJECT_PRODUCTION_URL`.
- Truy vấn inflection: `explain (analyze)` trên hai cách hỏi cho 1709 ms và 65 ms.

### A4. Xoá dấu vết AI slop

Dạng đã gặp và đã xoá:

- So sánh với chuỗi đã render thay vì gọi hàm quyết định. Ví dụ cụ thể:
  `formatDueDate(w.fsrsDueAt) === 'Cần ôn' ? 'Cần ôn' : ...`. Thay bằng `isDueAt(...)` trả
  boolean, nhãn `DUE_LABEL` tách riêng. Sau khi thay, `formatDueDate` không còn nơi gọi
  nào nên đã xoá luôn.
- Comment mô tả lại đúng dòng code ngay bên dưới.
- `try/catch` bọc thứ không bao giờ ném.
- File và lớp trừu tượng không ai dùng.

## Phần B. Việc 2, lưu trữ dữ liệu

Báo cáo đầy đủ ở `docs/superpowers/research/2026-09-16-storage-architecture.md`, 822 dòng.
Mọi con số giá lấy từ AWS Price List API hoặc trang giá chính thức kèm ngày tra, mọi số đo
độ trễ đo thật từ máy này, đặt tại Việt Nam.

### B1. Kết luận

Không chuyển database đi đâu cả. Ba lý do:

1. Phần lớn độ trễ nằm ở đường mạng chứ không ở database. `lex.search` tốn 46,3 ms trong
   database nhưng người dùng chờ 319 tới 582 ms. Nguyên nhân: repo không có `vercel.json`,
   nên Vercel Function chạy ở region mặc định `iad1` Washington, trong khi Supabase ở
   `ap-northeast-2` Seoul. Mỗi truy vấn trượt cache đi Việt Nam tới Washington tới Seoul
   rồi quay ngược.
2. PGroonga đang làm việc thật. Kiểm bằng hành vi chứ không bằng bộ đếm:
   `lex.search('习', array['zh'], 8)` trả về `学习`, mà không nhánh nào ngoài nhánh PGroonga
   tạo ra được kết quả đó. Chuyển sang RDS hay Aurora là mất PGroonga, vì hai dịch vụ đó
   không có extension này.
3. Chi phí. Phương án AWS rẻ nhất ở region gần Việt Nam là RDS `db.t4g.micro` tại
   `ap-southeast-1`, 20,55 đô một tháng, chưa gồm PostgREST, auth, connection pooling,
   backup, giám sát. Supabase Pro là 25 đô và có sẵn tất cả.

### B2. Hạ tầng AWS đã kiểm

Tài khoản AWS của bạn đặt region mặc định us-east-1 và không có RDS instance nào.
Credit đã dùng khoảng 0,84 đô tháng Tám và 0,44 đô tháng Chín, tức tài khoản gần như
trống.

Thứ duy nhất đáng chuyển sang AWS là 699 file audio, tổng 10,7 MB, sang S3 sau CloudFront,
dưới 0,01 đô một tháng. Chưa làm.

### B3. Dung lượng đo được

| Số đo | Giá trị |
| --- | --- |
| `pg_database_size` | 383 MB, tức 76,6% trần 500 MB gói Free |
| Tổng bảng schema `lex` | 197 MB |
| Phần chênh, là tệp riêng của PGroonga | khoảng 186 MB |
| Dữ liệu người dùng | 0,5 MB, 416 dòng `public.user_words` |
| `lex.entries` | 36.361 mục, en 21.004, es 11.312, zh 4.045 |
| `lex.inflections` | 352.332 |
| `lex.senses` | 183.526 |
| `lex.examples` | 144.997 |

Tỷ lệ dữ liệu từ điển trên dữ liệu người dùng khoảng 766 trên 1. Đây là lý do mọi phương
án tách hai loại dữ liệu ra hai nơi đều không mua được gì.

### B4. Ba việc báo cáo đề xuất, trạng thái từng việc

1. Đặt region cho Vercel Function. Đã làm. Thêm `vercel.json` ghim `icn1` Seoul, cùng
   region với database. Ghi lý do vào `AGENTS.md`.
2. Đổi 17 chỗ `revalidate: 3600` thành `revalidate: false`. Không làm, và đây là một phát
   hiện. Đề xuất đó giả định pipeline gọi `POST /api/revalidate` sau mỗi lần nạp dữ liệu.
   Tôi kiểm repo `zhesen-pipeline`: `grep -rni revalidate`, bỏ thư mục `.venv`, ra 0 dòng.
   Không có gì gọi endpoint đó cả. Đổi sang `false` sẽ đóng băng cache vĩnh viễn: nạp dữ
   liệu mới xong người dùng không bao giờ thấy. Cửa sổ một giờ hiện tại là bảo đảm tươi duy
   nhất nên giữ nguyên. Đã ghi rule này vào `AGENTS.md` để không ai sửa nhầm về sau.
3. Viết lại `lex.suggest`. Đã làm, migration `0034`. Bản cũ trung bình 1.278 ms, bản mới đo
   bằng `explain analyze` cho 170 ms thực thi.

## Phần C. Đã nghiên cứu, rút ra được gì

- `idx_scan` không dùng được để đánh giá index PGroonga. Cả hai index PGroonga đều báo
  `idx_scan = 0` trong khi `idx_tup_read` vẫn tăng và execution plan cho thấy chúng được
  dùng. Suýt xoá nhầm vì đọc bộ đếm. Muốn biết index có được dùng không thì đọc execution
  plan.
- Không set được `pg_trgm.similarity_threshold` qua Management API, trả
  `SQLSTATE 42501: permission denied to set parameter`. Cách thay thế: ghim ngưỡng bằng
  điều kiện `similarity(...) >= 0.3` viết thẳng trong câu truy vấn. Ngưỡng đang chạy trên
  production đúng là 0,3, đã kiểm bằng `current_setting`.
- Vercel không bao giờ cache một response có header `Set-Cookie`. Nên rủi ro của route tìm
  kiếm không phải là rò dữ liệu qua CDN mà là trượt cache. Đây là câu trả lời dứt điểm cho
  một lo ngại đã treo lâu.
- `s-maxage` không nói gì với trình duyệt. Route API có cache phải tách `Cache-Control` cho
  trình duyệt và `CDN-Cache-Control` cho CDN.
- Migration áp thẳng bằng SQL phải tự ghi vào `supabase_migrations.schema_migrations`. Sáu
  migration đợt này đều đã ghi, kiểm lại thấy đủ từ `0034` tới `0039`.
- Sửa định nghĩa function bằng biến đổi văn bản phải có assertion. Migration `0036` đọc
  `pg_get_functiondef`, khẳng định mỗi mốc neo xuất hiện đúng hai lần, rồi mới thay lần
  xuất hiện cuối. Không có assertion thì một thay đổi âm thầm sai chỗ.

## Phần D. Còn nợ

Theo thứ tự nên làm.

1. Chưa commit và chưa deploy. 108 file đang nằm trong working tree. `npm run verify` exit
   0 (lint sạch, `tsc --noEmit` sạch, 90 file test, 641 test pass) và `npm run build` exit
   0. Nhưng chưa có bản deploy nào mang những thay đổi này.
2. Trang mục từ có hydration mismatch, React error #418, khi đặt Suspense boundary lên
   segment đó. Đã gỡ `loading.tsx` nên hiện không còn lỗi, nhưng nguyên nhân gốc nằm trong
   cây `LookupView` và chưa truy ra. Hệ quả: trang mục từ không có trạng thái loading.
3. Chưa chuyển 699 file audio sang S3 và CloudFront. 10,7 MB, dưới 0,01 đô một tháng.
4. Chưa quyết gói Supabase. Đang dùng 76,6% trần gói Free. Nạp thêm dữ liệu từ điển là chạm
   trần. Gói Pro 25 đô cho 8 GB.
5. Vercel MCP vẫn trả 403 cho scope này, nên tôi không đọc được cấu hình project để xác
   nhận biến hệ thống có được expose hay không. Thay đổi ở mục A3 không phụ thuộc vào điều
   đó: nếu biến không có thì hành vi y như trước, không có hồi quy.

## Phần E. Cách kiểm chứng

Ở gốc repo app:

```bash
npm run verify
npm run build
git diff --stat HEAD
```

Kiểm migration đã lên production:

```sql
select version, name from supabase_migrations.schema_migrations order by version desc limit 8;
select count(*) from lex.search_vi('con cho', array['en','es','zh'], 10);
select count(*) from lex.search_vi('a((', array['en','es','zh'], 10);
select count(*) from lex.suggest('choa', 8);
```

Ba truy vấn sau lần lượt phải trả 10, 10 và 8. Trước đợt này, truy vấn thứ nhất trả
`42883` và truy vấn thứ hai trả `2201B`.
