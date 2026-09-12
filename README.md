# ZHESEN

Từ điển và sổ tay từ vựng cho người Việt học tiếng Trung, Tây Ban Nha và Anh. Tên gọi
ghép từ mã ba ngôn ngữ: **zh**, **es**, **en**.

Tra một từ ở bất kỳ ngôn ngữ nào trong ba thứ tiếng, hoặc gõ thẳng tiếng Việt để tra
ngược. Lưu từ vào sổ tay, gắn thẻ, xuất ra Anki. Ôn lại theo lịch FSRS-6.

## Chạy tại máy

```bash
npm install
cp .env.example .env.local   # điền URL và anon key của Supabase
npm run dev                  # http://localhost:3000
```

Cần Node theo khoảng ghi ở `engines` trong `package.json`. Các biến môi trường cùng phần
giải thích nằm trong `.env.example`; chỉ hai biến Supabase là bắt buộc.

## Lệnh

| Lệnh | Việc |
| --- | --- |
| `npm run dev` | Máy chủ phát triển |
| `npm run build` rồi `npm run start` | Chạy bản production |
| `npm run verify` | Lint, kiểm kiểu, chạy toàn bộ test |

## Cấu trúc

```
app/          route và layout
components/   giao diện, chia theo nhóm
lib/          logic không phụ thuộc giao diện
supabase/     migration
test/         Vitest
```

## Đọc thêm

- [`AGENTS.md`](AGENTS.md) — quy ước bắt buộc khi sửa mã, và những cái bẫy đã có người vấp.
- [`docs/`](docs/README.md) — spec và plan còn hiệu lực.
- [`zhesen-pipeline`](https://github.com/ntphiep/zhesen-pipeline) — repo nạp dữ liệu từ điển.
