# Chesen — Đọc & tra (tap-to-lookup)

Ngày: 2026-06-20. Trạng thái: đã triển khai, sau đó CẮT trang `/reader` riêng theo
quyết định của Hiệp (kho từ mỏng + trang riêng ít giá trị). GIỮ lại cơ chế bấm-từ
nhúng trong câu ví dụ ở trang tra cứu (`ExampleList` + `TappableText`). Các module
`lib/reader/tokenize.ts`, `resolveTokens`/`getHeadwords`, `TappableText`,
`WordPopover` vẫn còn và được dùng cho phần nhúng.

## 1. Mục tiêu và phạm vi

Cho phép người dùng đọc một đoạn văn bản (en / zh / es) và bấm vào từng từ để tra
nghĩa ngay tại chỗ bằng từ điển có sẵn (`schema lex`). Không dùng dịch vụ dịch
ngoài, không LLM, không chi phí. Đây KHÔNG phải dịch câu/đoạn; chỉ là tra từ.

**Có (v1):**
- Trang đọc riêng `/reader`: ô dán văn bản + chọn ngôn ngữ → văn bản hiển thị với
  các từ có trong từ điển bấm được.
- Nhúng cùng cơ chế vào câu ví dụ ở trang chi tiết tra cứu (`ExampleList`).
- Bấm một từ → popover tại chỗ: nghĩa VI, phát âm, nút "Xem chi tiết" (link tới
  `/dictionary/[lang]/[id]`), nút "Thêm vào sổ tay".
- Khớp cả dạng biến cách (en/es) qua bảng `inflections`.
- zh: tách từ theo khớp tham lam dài nhất; chữ Hán không khớp được tách lẻ và bấm
  vào hiện thông tin chữ (bộ thủ / số nét / Hán-Việt) từ bảng `characters`.

**Ngoài v1 (YAGNI):** tự nhận diện ngôn ngữ; lemmatize ngoài bảng `inflections`;
lưu lịch sử đọc; làm nổi ngữ pháp; dịch cả câu.

## 2. Thực tế dữ liệu (đo live 2026-06-20)

| Ngôn ngữ | Mục từ | Dạng biến cách | Mục có biến cách |
|---|---|---|---|
| en | 161 | 448 | 121 |
| es | 100 | 706 | 33 |
| zh | 30 | 0 | 0 |

`headword_normalized = lower(headword)` đúng 100% dòng; `inflections.form_text`
toàn bộ lowercase. Nên chuẩn hoá token = lowercase (giữ dấu) là đủ để khớp.
Hệ quả: kho từ còn mỏng, phần lớn văn bản tuỳ ý sẽ có từ không khớp; những từ đó
hiển thị chữ thường, không bấm được (graceful). Độ phủ tăng khi pipeline bù dữ liệu.

## 3. Module (tách bạch, test độc lập)

### `lib/reader/tokenize.ts` (thuần)
- `Segment = { text: string; word: boolean }`.
- `tokenizeLatin(text)`: từ = chuỗi chữ cái có dấu nháy/gạch nối nội bộ
  (`don't`, `well-being`); phần còn lại (khoảng trắng, dấu câu) là `gap`. Render
  lại đúng văn bản gốc bằng cách nối mọi segment.
- `tokenizeHan(text, headwords)`: duyệt theo code point; tại mỗi vị trí chữ Hán,
  khớp headword dài nhất bắt đầu ở đó; không khớp thì tách 1 chữ làm `word`. Chuỗi
  không-Hán gộp thành `gap`.
- `tokenize(lang, text, zhHeadwords?)`: gom hai hàm trên.

### `lib/dictionary/search.ts` (bổ sung, tái dùng `toPreview` + select sẵn có)
- `getHeadwords(supabase, lang)`: trả `string[]` headword (zh cần để tách từ).
- `resolveTokens(supabase, lang, tokens[])`: trả `Map<loweredToken, DictEntryPreview>`.
  Khớp `headword_normalized` (1 query) rồi `inflections.form_text` cho token còn
  lại (1 query lấy form→entry_id, 1 query lấy preview theo id, lọc đúng `lang`).
- `getCharacters` (đã có): dùng cho dự phòng từng-chữ của zh.

### `components/reader/WordPopover.tsx`
- Nhận `{ entry }` hoặc `{ charInfo }`. Thẻ nhỏ: headword + IPA/pinyin + pos +
  nghĩa VI + "Xem chi tiết" (`entryPath`) + `AddToWordlistButton`. Dạng chữ: char
  + pinyin + Hán-Việt + bộ + nét + gloss.

### `components/reader/TappableText.tsx` (client, dùng chung)
- Props `{ text, lang }`. Dùng browser anon client (`@/lib/supabase/client`).
- Vòng đời: (zh) nạp headwords → `tokenize` → `resolveTokens` cho token từ; (zh)
  `getCharacters` cho chữ đơn chưa khớp. Lỗi → render chữ thường (không crash).
- Render segment: từ khớp = `<button>` mở popover (toggle theo index); từ/chữ
  không khớp = chữ thường. Hiển thị văn bản gốc nguyên vẹn.

## 4. Tiêu thụ
- `app/reader/page.tsx` (server, khung) + `app/reader/ReaderClient.tsx` (textarea
  + select ngôn ngữ, mirror `DictionarySearch`) → `<TappableText>`.
- `ExampleList`: thay `<p>{text}</p>` bằng `<TappableText text lang>`.
- Trang chủ: thêm link "Đọc".

## 5. Data-flow và hiệu năng
- Giống search hiện tại: client gọi thẳng qua browser anon client (policy anon cho
  phép đọc public). Resolve theo lô 1 lần cho mỗi đoạn văn bản.

## 6. Test (TDD)
- `tokenize`: en/es (dấu câu, nháy, gạch nối, rỗng), zh (longest-match, chữ đơn,
  trộn Hán/không-Hán); nối segment == văn bản gốc.
- `resolveTokens`: khớp headword, khớp inflection, không khớp, lọc đúng lang.
- `WordPopover`: hiển thị nghĩa + link chi tiết + nút thêm; dạng chữ.
- `TappableText`: từ khớp bấm được + popover có nghĩa; từ không khớp là chữ thường.
