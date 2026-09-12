# ZHESEN

Từ điển và sổ tay từ vựng cho người Việt học tiếng Trung, Tây Ban Nha và Anh. Tên gọi
ghép từ mã ba ngôn ngữ: **zh**, **es**, **en**.

Ba việc app làm, theo đúng thứ tự ưu tiên:

1. **Tra cứu.** Gõ một từ ở bất kỳ ngôn ngữ nào trong ba ngôn ngữ, hoặc gõ thẳng tiếng
   Việt để tra ngược. Chịu được gõ sai chính tả, gõ thiếu dấu, và gõ pinyin không dấu.
2. **Lưu trữ.** Sổ tay cá nhân có thẻ phân loại, thao tác hàng loạt, xuất ra CSV hoặc
   định dạng nhập được vào Anki, và nhập lại từ CSV.
3. **Ghi nhớ.** Ôn tập theo thuật toán lặp lại ngắt quãng FSRS-6.

## Công nghệ

Next.js 16.3.5 App Router, React 19.2.4, Tailwind 4, Zod 4, Supabase qua `@supabase/ssr`,
ts-fsrs cho lịch ôn tập, hanzi-writer cho thứ tự nét chữ Hán. Kiểm thử bằng Vitest và
Testing Library.

## Bắt đầu

Cần Node theo khoảng ghi ở `engines` trong `package.json`: `^20.9.0 || ^22 || >=24`.
Khoảng này đứt quãng vì Vitest không chạy trên Node 21 và 23.

```bash
npm install
cp .env.example .env.local   # điền khoá Supabase
npm run dev                  # http://localhost:3000
```

| Biến | Bắt buộc | Dùng để |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | có | Kết nối tới project Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | có | Khoá công khai, đọc dữ liệu từ điển |
| `REVALIDATE_SECRET` | không | Bảo vệ `POST /api/revalidate`, gọi sau khi pipeline nạp dữ liệu mới |
| `TRUST_PROXY_HEADER` | không | Đặt `1` chỉ khi có proxy tự ghi đè `x-forwarded-for`. Bỏ trống thì header bị bỏ qua, vì client tự ghi gì vào đó cũng được |
| `COLD_QUERIES_PER_MINUTE` | không | Số truy vấn lạ được chạm tới Supabase mỗi phút, mặc định 180 |

## Lệnh

| Lệnh | Việc |
| --- | --- |
| `npm run dev` | Máy chủ phát triển |
| `npm run build` | Build production |
| `npm run start` | Chạy bản đã build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Toàn bộ Vitest |
| `npm run verify` | Cả ba bước trên, theo thứ tự. Đây là định nghĩa "đã kiểm tra" của dự án, dùng chung cho người, cho CI và cho hook |

## Cấu trúc

```
app/          route, layout, globals.css. Không chứa component.
components/   theo nhóm giao diện: lookup, wordlist, practice, grammar, search, reader,
              learn, home, layout, ui
lib/          logic không phụ thuộc giao diện: dictionary, wordlist, practice, progress,
              grammar, reader, hooks, http, supabase
proxy.ts      middleware, đồng bộ cookie phiên Supabase
supabase/     migration. Schema `lex` là từ điển, `public` là dữ liệu người dùng
test/         Vitest + Testing Library
docs/         spec và plan còn hiệu lực, xem docs/README.md
```

Quy ước bắt buộc khi sửa mã nằm ở [`AGENTS.md`](AGENTS.md), không nhắc lại ở đây.

## Tìm kiếm

Tìm kiếm chạy trong Postgres chứ không ở tầng ứng dụng, qua hai hàm:

- `lex.search` tra xuôi. Kết hợp cột `tsvector` sinh sẵn (có `unaccent` để bỏ dấu), index
  trigram để chịu lỗi chính tả, index PGroonga để tìm được ký tự Hán nằm giữa từ, và một
  cột pinyin đã bỏ dấu thanh.
- `lex.search_vi` tra ngược từ tiếng Việt. Xếp hạng theo chất lượng khớp trước, độ thông
  dụng chỉ dùng để phá hoà trong cùng một bậc khớp.

## Dữ liệu và cơ sở dữ liệu

Dữ liệu từ điển do một repo riêng nạp vào,
[`zhesen-pipeline`](https://github.com/ntphiep/zhesen-pipeline). Repo này giữ migration và
là nguồn chân lý của lược đồ; pipeline chỉ đọc và ghi dữ liệu.

Nguồn và giấy phép của từng phần được ghi trong bảng `lex.sources`, và mỗi dòng dữ liệu
mang `source_id` trỏ về đó. Nội dung mang giấy phép cấm dùng cho mục đích thương mại thì
không được nạp.

Dự án chưa link Supabase CLI (không có `supabase/config.toml`), nên migration được áp
thẳng qua kết nối Postgres. Khi làm vậy phải tự ghi một dòng vào
`supabase_migrations.schema_migrations`, nếu không lần `db push` sau sẽ chạy lại migration
đó. Gói Supabase Free trần 500 MB, hãy đo trước khi nạp thêm dữ liệu.

## Kiểm thử và CI

GitHub Actions chạy ESLint, kiểm tra kiểu và toàn bộ test cho mỗi lần đẩy mã và mỗi pull
request, dựng bản production khi có sẵn khoá, và chặn merge nếu migration bị trùng số hoặc
chứa câu lệnh xoá dữ liệu chưa được khai báo.

Trên máy, `.claude/hooks/verify-gate.ps1` chạy cùng các bước đó mỗi khi một lượt làm việc
có sửa tệp TypeScript, và chặn lượt nếu có lỗi.

Riêng tính năng có giao diện thì build xanh chưa đủ: phải mở app chạy thật và bấm thử. Đây
là rule cứng của dự án, lý do ghi trong `AGENTS.md`.
