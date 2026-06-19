# Thiết kế: Tính năng Tra cứu (`/dictionary`)

> **Quy ước đặt tên (bắt buộc):** đường dẫn route bằng **tiếng Anh** (khớp `/learn`, `/wordlist` đã có), nhãn hiển thị trên UI bằng **tiếng Việt** ("Tra cứu"). Không đặt route tiếng Việt.

**Mục tiêu:** Trang tra cứu từ vựng kiểu hanzii cho Chesen: gõ một từ ra trang chi tiết đầy đủ (phát âm, nghĩa theo từ loại, ví dụ, thành phần chữ, từ liên quan, và **từ đó ở các ngôn ngữ khác**). Đọc từ schema `lex`, tái dùng tầng dữ liệu đã có.

**Kiến trúc:** Một route `/dictionary` với ô tìm (dùng `searchEntries` đã có) và trang chi tiết `/dictionary/[lang]/[id]` (Server Component đọc `getEntryDetail`, render bố cục giàu). Tái dùng/ mở rộng tầng `lib/dictionary`. Các mục thiếu dữ liệu **tự ẩn (graceful degrade)**, sáng dần khi pipeline backfill.

**Tech Stack:** Next.js 16.2.9 (App Router, Server Components ưu tiên), React 19.2, Supabase (`.schema('lex')`), Tailwind 4, Vitest + Testing Library.

## Global Constraints

- KHÔNG phải Next.js trong training data; đọc `node_modules/next/dist/docs/` trước khi đụng caching/async API. Tra cứu là dữ liệu công khai → đọc qua client không-cookie có cache (`lib/supabase/content.ts` đã có) để trang cache được, KHÔNG gọi `cookies()` trong scope cache.
- Mọi khẳng định dữ liệu phải kiểm chứng. Sự thật đã đo (live 2026-06-20): nghĩa tiếng Việt chỉ có ở **en (101/101)**, còn **es 0/100, zh 0/30** (chưa crawl xong) → trang chi tiết tiếng Anh dùng được ngay, zh/es sáng dần. Từ liên quan toàn **text-only** (`related_text`, 0 link tới entry; loại: derived/synonym/related/antonym). Cross-language **rất mỏng**: chỉ 17/118 link giải được tới entry thật, đa số từ (kể cả `en:dog`) ra **0 sibling** vì entry đích chưa tồn tại → panel tự ẩn. Chữ Hán nằm ở bảng riêng **`lex.characters`** (khóa theo glyph `char`: radical/stroke_count/han_viet[]/pinyin[]/gloss), KHÔNG ở `attributes`; phân rã thành phần (女+子) **chưa có** (`decomposition` null).
- **RLS:** `lex.characters` và `lex.cross_language_links` hiện chỉ mở cho role `authenticated`. Trang chi tiết đọc qua client không-cookie (role `anon`) để cache được, nên cần migration thêm policy `anon SELECT` cho hai bảng này (cùng kiểu migration 0006 đã làm cho entries/senses/...).
- TS strict, không `any`. TDD. Tái dùng (DRY) tầng `lib/dictionary` + component đã có, không dựng trùng. UI tiếng Việt, phong cách Tailwind tối giản hiện hành.
- `LangCode = 'zh'|'es'|'en'`.

## 1. Phạm vi

**Có (v1):** ô tìm + trang chi tiết tra cứu với: hero (từ + phồn thể cho zh + phát âm/IPA + audio + Hán-Việt + badge cấp độ), nghĩa theo từ loại (kèm ví dụ), khối chữ/bộ (zh: bộ thủ + số nét + Hán-Việt mỗi chữ), từ liên quan (chip theo loại, bấm = tìm lại), "Từ này ở ngôn ngữ khác" (qua `cross_language_links`, tự ẩn khi rỗng), danh sách ví dụ, nút "Thêm vào wordlist".

**Ngoài v1 (để sau, cần dữ liệu/pipeline hoặc dịch vụ):** dịch câu/đoạn (cần MT — chờ bạn chọn nhà cung cấp); phân rã thành phần chữ có drill-down; nét động (stroke order); tab nhiều âm pinyin; guide word gom nghĩa (Cambridge); bảng chia động từ TBN; ghi chú cộng đồng; tiến hóa chữ.

## 2. Định tuyến và component

- `app/dictionary/page.tsx` (Client hoặc Server + client search box): ô tìm + chọn ngôn ngữ; gõ → `searchEntries` (debounce) → danh sách kết quả (headword + nghĩa + IPA), bấm điều hướng tới trang chi tiết.
- `app/dictionary/[lang]/[id]/page.tsx` (Server Component): giải mã `id`, gọi `getEntryDetail` qua client nội dung không-cookie có cache; render `LookupView`.
- `components/lookup/LookupView.tsx`: bố cục giàu (các section ở mục 3), nhận `DictEntryDetail`. Tách các section thành component con nhỏ, tập trung trách nhiệm:
  - `LookupHero.tsx`, `SenseList.tsx`, `CharacterPanel.tsx` (zh), `RelatedWords.tsx`, `CrossLanguagePanel.tsx`, `ExampleList.tsx`.
- Tái dùng `AudioButton` (đã có). `WordDetail` (trong wordlist) giữ nguyên cho xem nhanh inline; `LookupView` là bản đầy đủ cho trang tra cứu (chia sẻ các component con khi hợp lý).
- Thêm liên kết "Tra cứu" ở trang chủ và (tùy) từ wordlist.

## 3. Tầng dữ liệu (mở rộng `lib/dictionary`)

`getEntryDetail` đã trả senses/pronunciations/examples/relations + attributes. Bổ sung:
- `getCrossLanguage(supabase, entryId): Promise<CrossLangSibling[]>` — từ `cross_language_links` lấy `concept_id` của entry (truy bằng hai query `eq from_entry_id` / `eq to_entry_id` để tránh lỗi escape khi headword có ký tự đặc biệt), tìm các entry KHÁC cùng `concept_id` mà **tồn tại** trong `lex.entries`; trả {id, lang, headword, glossVi}. Rỗng nếu không có (panel tự ẩn).
- `getCharacters(supabase, headword): Promise<CharInfo[]>` (zh) — tách headword thành từng glyph Hán (giữ thứ tự chuỗi), tra bảng `lex.characters` theo `char`; mỗi chữ trả {char, radical, strokeCount, hanViet[], pinyin[], gloss}. Hán-Việt của cả từ ở hero = ghép `hanViet[0]` mỗi chữ. Không dùng bảng `entry_characters` (thưa và thiếu policy anon).
- Related words: nhóm `relations` theo `relationType` (synonym/antonym/derived/related); mỗi item là `relatedText` (chip). Bấm chip → điều hướng `/dictionary?q=<text>&lang=<lang>` (tìm lại), vì không có link entry trực tiếp.

## 4. Bố cục trang chi tiết (thứ tự)

1. **Hero**: headword (+ phồn thể zh), phát âm (IPA cho en/es; pinyin + Hán-Việt cho zh) + `AudioButton`, badge cấp độ (HSK/CEFR) nếu có, nút "Thêm vào wordlist".
2. **Nghĩa theo từ loại**: nhóm theo `pos`; mỗi nghĩa: gloss_vi (chính) + gloss_en (phụ, nhỏ); 1 ví dụ kèm dịch.
3. **Khối chữ/bộ (zh)**: mỗi chữ trong từ: bộ thủ + số nét + Hán-Việt. (Drill-down thành phần để sau khi có dữ liệu.)
4. **Từ liên quan**: mục con Cận nghĩa / Trái nghĩa / Phái sinh / Liên quan; chip bấm = tìm lại. Tự ẩn nhóm rỗng.
5. **Từ này ở ngôn ngữ khác**: thẻ cho mỗi sibling (cờ + headword + nghĩa VI + link tới trang tra cứu của nó). Tự ẩn khi rỗng (hiện rất mỏng, sẽ đầy khi crawl thêm).
6. **Ví dụ**: các ví dụ còn lại (text + dịch + audio nếu có).

## 5. Hiệu năng

Trang chi tiết là Server Component đọc dữ liệu công khai qua `createContentClient()` (không-cookie) + bọc cache (`unstable_cache`, revalidate 3600, tag 'lex'); ô tìm chạy client-side (browser client, đã authenticated) debounce. Không waterfall (một `getEntryDetail` lồng nhau + một `getCrossLanguage`).

## 6. Kiểm thử

- `getCrossLanguage`: mock supabase, xác nhận chỉ trả sibling tồn tại, rỗng khi không có.
- Mỗi section component: render đúng từ `DictEntryDetail` mẫu; nhóm rỗng tự ẩn; chip related điều hướng đúng URL tìm lại.
- `LookupView`: ráp đủ section; zh hiện CharacterPanel, en/es ẩn.
- Trang `/dictionary/[lang]/[id]`: smoke (gọi getEntryDetail mock).
- Giữ toàn bộ test hiện có (51) xanh; `tsc` exit 0; `npm run build` OK.

## 7. Hạng mục xác minh khi lập plan

- Cách `cross_language_links` lưu concept_id và chiều from/to để truy sibling đúng (đọc dữ liệu mẫu).
- Quy ước `id` trong URL (entry id dạng `en:dog` có dấu `:` → encode trên URL).
- attributes.characters[] cấu trúc chính xác cho zh (đã thấy: char/radical/stroke_count/han_viet/pinyin).
- Có nên dùng route `[lang]/[id]` hay query `?q=` cho trang chi tiết (id ổn định hơn cho cache).
