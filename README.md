# zhesen

Từ điển và sổ tay từ vựng cho người Việt học tiếng Trung, Tây Ban Nha và Anh. Tên gọi
ghép từ mã ba ngôn ngữ đó: **zh**, **es**, **en**.

Ba việc app làm, theo đúng thứ tự ưu tiên:

1. **Tra cứu.** Gõ một từ ở bất kỳ ngôn ngữ nào trong ba ngôn ngữ, hoặc gõ thẳng tiếng
   Việt để tra ngược. Chịu được gõ sai chính tả, gõ thiếu dấu, và gõ pinyin không dấu.
2. **Lưu trữ.** Sổ tay cá nhân có thẻ phân loại, thao tác hàng loạt, xuất ra CSV hoặc
   định dạng nhập được vào Anki, và nhập lại từ CSV.
3. **Ghi nhớ.** Ôn tập theo thuật toán lặp lại ngắt quãng FSRS-6.

## Bắt đầu

```bash
npm install
cp .env.example .env.local   # điền khoá Supabase
npm run dev                  # http://localhost:3000
```

Biến môi trường:

| Biến | Bắt buộc | Dùng để |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | có | Kết nối tới project Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | có | Khoá công khai, đọc dữ liệu từ điển |
| `REVALIDATE_SECRET` | không | Bảo vệ `POST /api/revalidate`, dùng sau khi pipeline nạp dữ liệu mới |

## Lệnh

```bash
npm run dev      # máy chủ phát triển
npm run build    # build production
npm run start    # chạy bản đã build
npm run lint     # ESLint
npm run test     # Vitest
npx tsc --noEmit # kiểm tra kiểu
```

## Kiến trúc

Next.js 16 App Router, React 19, Tailwind 4, Zod 4, Supabase qua `@supabase/ssr`.

```
app/          route, layout, globals.css. Không chứa component.
components/   theo nhóm giao diện: lookup, wordlist, practice, grammar, search, ...
lib/          logic không phụ thuộc giao diện: dictionary, wordlist, practice,
              progress, grammar, hooks, supabase
supabase/     migration. Schema `lex` là từ điển, `public` là dữ liệu người dùng.
test/         Vitest + Testing Library
```

Quy ước bắt buộc, ghi đầy đủ trong [`AGENTS.md`](AGENTS.md): đường dẫn route bằng tiếng
Anh còn nhãn hiển thị bằng tiếng Việt; dữ liệu đọc từ Supabase luôn đi qua Zod `.parse()`;
cơ sở dữ liệu dùng snake_case còn TypeScript dùng camelCase, việc chuyển đổi làm tường
minh trong tầng parser.

## Tìm kiếm

Tìm kiếm chạy trong Postgres chứ không ở tầng ứng dụng, qua hai hàm:

- `lex.search` tra xuôi. Kết hợp cột `tsvector` sinh sẵn (có `unaccent` để bỏ dấu), index
  trigram để chịu lỗi chính tả, index PGroonga để tìm được ký tự Hán nằm giữa từ, và một
  cột pinyin đã bỏ dấu thanh.
- `lex.search_vi` tra ngược từ tiếng Việt. Xếp hạng theo chất lượng khớp trước, độ thông
  dụng chỉ dùng để phá hoà trong cùng một bậc khớp.

## Dữ liệu

Dữ liệu từ điển do một repo riêng nạp vào, [`zhesen-pipeline`](https://github.com/ntphiep/zhesen-pipeline).
Repo này giữ migration và là nguồn chân lý của lược đồ; pipeline chỉ đọc và ghi dữ liệu.

Nguồn và giấy phép của từng phần được ghi trong bảng `lex.sources`, và mỗi dòng dữ liệu
mang `source_id` trỏ về đó. Nội dung mang giấy phép cấm dùng cho mục đích thương mại thì
không được nạp; xem mục tương ứng trong `AGENTS.md`.

## Kiểm thử

GitHub Actions chạy ESLint, kiểm tra kiểu và toàn bộ test cho mỗi lần đẩy mã và mỗi pull
request, dựng bản production khi có sẵn khoá, và chặn merge nếu migration bị trùng số
hoặc chứa câu lệnh xoá dữ liệu.

Riêng tính năng có giao diện thì build xanh chưa đủ: phải mở app chạy thật và bấm thử.
Đây là rule cứng của dự án, lý do ghi trong `AGENTS.md`.
