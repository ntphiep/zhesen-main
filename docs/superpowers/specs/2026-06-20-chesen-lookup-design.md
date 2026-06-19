# Thiết kế: Tính năng Tra cứu (`/tra-cuu`)

**Mục tiêu:** Trang tra cứu từ vựng kiểu hanzii cho Chesen: gõ một từ ra trang chi tiết đầy đủ (phát âm, nghĩa theo từ loại, ví dụ, thành phần chữ, từ liên quan, và **từ đó ở các ngôn ngữ khác**). Đọc từ schema `lex`, tái dùng tầng dữ liệu đã có.

**Kiến trúc:** Một route `/tra-cuu` với ô tìm (dùng `searchEntries` đã có) và trang chi tiết `/tra-cuu/[lang]/[id]` (Server Component đọc `getEntryDetail`, render bố cục giàu). Tái dùng/ mở rộng tầng `lib/dictionary`. Các mục thiếu dữ liệu **tự ẩn (graceful degrade)**, sáng dần khi pipeline backfill.

**Tech Stack:** Next.js 16.2.9 (App Router, Server Components ưu tiên), React 19.2, Supabase (`.schema('lex')`), Tailwind 4, Vitest + Testing Library.

## Global Constraints

- KHÔNG phải Next.js trong training data; đọc `node_modules/next/dist/docs/` trước khi đụng caching/async API. Tra cứu là dữ liệu công khai → đọc qua client không-cookie có cache (`lib/supabase/content.ts` đã có) để trang cache được, KHÔNG gọi `cookies()` trong scope cache.
- Mọi khẳng định dữ liệu phải kiểm chứng. Sự thật đã đo (live 2026-06-20): từ liên quan toàn **text-only** (`related_text`, 0 link tới entry tra cứu được; loại: derived/synonym/related/antonym); cross-language **mỏng** (chỉ ~17 link giải được tới entry thật, 63/231 từ có link); thành phần chữ (女+子) **chưa có** (mới có bộ thủ/nét/Hán-Việt).
- TS strict, không `any`. TDD. Tái dùng (DRY) tầng `lib/dictionary` + component đã có, không dựng trùng. UI tiếng Việt, phong cách Tailwind tối giản hiện hành.
- `LangCode = 'zh'|'es'|'en'`.

## 1. Phạm vi

**Có (v1):** ô tìm + trang chi tiết tra cứu với: hero (từ + phồn thể cho zh + phát âm/IPA + audio + Hán-Việt + badge cấp độ), nghĩa theo từ loại (kèm ví dụ), khối chữ/bộ (zh: bộ thủ + số nét + Hán-Việt mỗi chữ), từ liên quan (chip theo loại, bấm = tìm lại), "Từ này ở ngôn ngữ khác" (qua `cross_language_links`, tự ẩn khi rỗng), danh sách ví dụ, nút "Thêm vào wordlist".

**Ngoài v1 (để sau, cần dữ liệu/pipeline hoặc dịch vụ):** dịch câu/đoạn (cần MT — chờ bạn chọn nhà cung cấp); phân rã thành phần chữ có drill-down; nét động (stroke order); tab nhiều âm pinyin; guide word gom nghĩa (Cambridge); bảng chia động từ TBN; ghi chú cộng đồng; tiến hóa chữ.

## 2. Định tuyến và component

- `app/tra-cuu/page.tsx` (Client hoặc Server + client search box): ô tìm + chọn ngôn ngữ; gõ → `searchEntries` (debounce) → danh sách kết quả (headword + nghĩa + IPA), bấm điều hướng tới trang chi tiết.
- `app/tra-cuu/[lang]/[id]/page.tsx` (Server Component): giải mã `id`, gọi `getEntryDetail` qua client nội dung không-cookie có cache; render `LookupView`.
- `components/lookup/LookupView.tsx`: bố cục giàu (các section ở mục 3), nhận `DictEntryDetail`. Tách các section thành component con nhỏ, tập trung trách nhiệm:
  - `LookupHero.tsx`, `SenseList.tsx`, `CharacterPanel.tsx` (zh), `RelatedWords.tsx`, `CrossLanguagePanel.tsx`, `ExampleList.tsx`.
- Tái dùng `AudioButton` (đã có). `WordDetail` (trong wordlist) giữ nguyên cho xem nhanh inline; `LookupView` là bản đầy đủ cho trang tra cứu (chia sẻ các component con khi hợp lý).
- Thêm liên kết "Tra cứu" ở trang chủ và (tùy) từ wordlist.

## 3. Tầng dữ liệu (mở rộng `lib/dictionary`)

`getEntryDetail` đã trả senses/pronunciations/examples/relations + attributes. Bổ sung:
- `getCrossLanguage(supabase, entryId): Promise<CrossLangSibling[]>` — từ `cross_language_links` lấy `concept_id` của entry, tìm các entry KHÁC cùng `concept_id` (qua from/to) mà **tồn tại** trong `lex.entries`; trả {id, lang, headword, glossVi}. Rỗng nếu không có (panel tự ẩn).
- Ánh xạ `attributes.characters[]` (zh) thành cấu trúc cho `CharacterPanel`: mỗi chữ {char, radical, strokeCount, hanViet[], pinyin[]}.
- Related words: nhóm `relations` theo `relationType` (synonym/antonym/derived/related); mỗi item là `relatedText` (chip). Bấm chip → điều hướng `/tra-cuu?q=<text>&lang=<lang>` (tìm lại), vì không có link entry trực tiếp.

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
- Trang `/tra-cuu/[lang]/[id]`: smoke (gọi getEntryDetail mock).
- Giữ toàn bộ test hiện có (51) xanh; `tsc` exit 0; `npm run build` OK.

## 7. Hạng mục xác minh khi lập plan

- Cách `cross_language_links` lưu concept_id và chiều from/to để truy sibling đúng (đọc dữ liệu mẫu).
- Quy ước `id` trong URL (entry id dạng `en:dog` có dấu `:` → encode trên URL).
- attributes.characters[] cấu trúc chính xác cho zh (đã thấy: char/radical/stroke_count/han_viet/pinyin).
- Có nên dùng route `[lang]/[id]` hay query `?q=` cho trang chi tiết (id ổn định hơn cho cache).
