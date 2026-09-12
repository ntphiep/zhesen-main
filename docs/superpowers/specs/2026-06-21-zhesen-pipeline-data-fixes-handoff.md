# Bàn giao: sửa & làm giàu dữ liệu từ điển Zhesen (repo `zhesen-pipeline`)

> Tài liệu này là **prompt bàn giao** cho một phiên Claude khác chạy trong repo
> `zhesen-pipeline`. Nó nêu vấn đề dữ liệu, bằng chứng đo được, và việc cần làm.
> Mọi số liệu dưới đây lấy trực tiếp từ Supabase ngày 2026-06-21.

## Bối cảnh

Zhesen là web app học ngôn ngữ cho người Việt (học Anh/Trung/Tây Ban Nha). App đọc
dữ liệu từ một database Supabase, schema `lex`. Repo app (Next.js) đã ổn; **nút thắt
chất lượng nằm ở dữ liệu**, do `zhesen-pipeline` sinh ra.

- Supabase project id: `cvltsyoweddhpkomuevz` (region ap-northeast-2, Postgres 17).
- Schema dữ liệu: `lex`. Các bảng chính:
  - `lex.entries` (id dạng `"<lang>:<key>"`, ví dụ `en:dog`; cột `lang`,
    `headword`, `headword_normalized`, `traditional`, `level`, `frequency_rank`,
    `attributes` jsonb).
  - `lex.senses` (`entry_id`, `pos`, `gloss_vi`, `gloss_en`, `sense_order`).
  - `lex.pronunciations` (`entry_id`, `accent`, `ipa`, `audio_url`).
  - `lex.examples` (`entry_id`, `text`, `reading`, `translation_vi`, `translation_en`).
  - `lex.inflections` (`entry_id`, `form_text`, `form_label`).
  - `lex.lex_relations` (`entry_id`, `relation_type`, `related_text`, `related_entry_id`).
  - `lex.characters` (chữ Hán: `char`, `radical`, `stroke_count`, `han_viet[]`, `pinyin[]`, `gloss`).
  - `lex.cross_language_links` (`concept_id`, `from_entry_id`, `to_entry_id`).
- Quy mô hiện tại: EN ~5.888 entry, ES ~100, ZH ~30.

## Vấn đề cần xử lý (theo thứ tự ưu tiên)

### 1. Ví dụ bị dính chữ (mất dấu cách) — NGHIÊM TRỌNG
- **8.771 / 45.020 ví dụ (~19,5%)** có từ dính nhau.
- Bằng chứng (EN): `"Thehatwasblueandred"`, `"amotherandchild."`,
  `"apictureofmyfather."`, `"Igot an A inmyhistorytest."`, `"written inEnglish"`.
- App đang phải lọc bỏ các ví dụ này ở client (heuristic), nên người dùng thấy ít ví
  dụ hơn thực có. Cần sửa tại nguồn: tách lại từ (re-tokenize/re-space), hoặc crawl lại
  từ nguồn sạch.
- Truy vấn đếm để kiểm chứng và đo tiến độ:
  ```sql
  select count(*) from lex.examples
  where text ~ '[a-z][A-Z]'
     or exists (select 1 from regexp_split_to_table(text,'\s+') w
                where length(regexp_replace(w,'[^[:alpha:]]','','g')) > 14);
  ```

### 2. Audio phát âm gần như trống
- Tỉ lệ pronunciation có `audio_url`: **EN 6,8%** (2.066/30.238), **ES 0,9%** (3/329),
  **ZH 0%** (0/30).
- Audio hiện có là file `.ogg` Wikimedia (Safari/iOS không phát được; app đã fallback TTS).
- Cần: sinh audio thật, phủ rộng, định dạng phát được trên mọi trình duyệt (mp3/aac).
  Ưu tiên Cloud TTS chất lượng cao cho **cả 3 ngôn ngữ**, đặc biệt ZH (đang 0%).
- Lý tưởng: tách giọng **UK và US** cho EN (app đã hiển thị 2 hàng UK/US riêng).

### 3. Audio dán nhãn sai giọng
- ~244 dòng `pronunciations` (EN) có `audio_url` mà accent trong tên file **mâu thuẫn**
  với cột `accent` (ví dụ entry `develop`, dòng `accent='en-UK'` nhưng `audio_url` trỏ
  `En-us-develop.ogg`). App đã chống đỡ bằng cách tin theo tên file, nhưng nên sửa tại nguồn.
- Kiểm tra:
  ```sql
  select e.headword, p.accent, p.audio_url
  from lex.pronunciations p join lex.entries e on e.id=p.entry_id
  where e.lang='en' and p.audio_url is not null
    and ((p.accent ilike 'en-UK' and p.audio_url !~* 'en-(uk|gb)')
      or (p.accent ilike 'en-US' and p.audio_url !~* 'en-us'));
  ```

### 4. Thiếu `gloss_vi` (nghĩa tiếng Việt) cho ZH và ES
- ZH: **0/97 sense** có `gloss_vi`. ES: chỉ **33/489**. EN: 5.292/53.279 (tốt).
- Hệ quả: trang chi tiết ZH/ES không có nghĩa tiếng Việt, và **không bắc cầu cross-language
  qua tiếng Việt được**. Cần dịch `gloss_en` -> `gloss_vi` cho ZH/ES.

### 5. Dữ liệu zh/es quá mỏng (chặn cross-language)
- App bắc cầu cross-language qua trục tiếng Anh (`gloss_en`). Hiện chỉ **69 từ EN** có
  từ tương đương zh/es, vì zh/es chỉ có 30 và 100 entry.
- Tăng số entry zh/es (đặc biệt các từ vựng A1-B1 phổ biến) sẽ tự động mở rộng độ phủ
  cross-language mà không cần đổi code app.

### 6. ~213 entry EN không có sense nào (danh từ riêng) — NGHIÊM TRỌNG
- Ban đầu **285 entry EN có 0 sense** (không hiện được mục "Nghĩa", trang trông như hỏng).
  Toàn danh từ riêng: tháng, thứ, quốc gia, châu lục, quốc tịch, tên người, bang/thành phố Mỹ,
  thương hiệu (youtube, microsoft, netflix...). 84 từ nằm trong top-3000 phổ biến.
- App đã seed thủ công nghĩa cho **74 từ nhóm đóng** (12 tháng, 7 thứ, châu lục, ~35 quốc gia,
  ~20 quốc tịch, christmas/halloween) qua migration `0009_seed_proper_noun_senses.sql`
  (provenance `curated-seed-0009`, `gloss_vi_is_mt=false`). **Còn lại ~213 entry** (tên người,
  bang/thành phố, thương hiệu) chưa có nghĩa.
- Pipeline cần: trích lại sense cho danh từ riêng (Wiktionary thường để chữ hoa "January",
  "London" nên bước extract theo headword lowercase bị trượt), hoặc sinh gloss kiểu phân loại
  ("(tên người)", "(thành phố)", "(thương hiệu)"). **Không seed trùng** nhóm đã có
  `provenance='curated-seed-0009'`.
- Kiểm tra: `select count(*) from lex.entries e where lang='en' and not exists (select 1 from lex.senses s where s.entry_id=e.id);`

### 7. Thứ tự nghĩa (`sense_order`) chưa phản ánh nghĩa thông dụng
- Ví dụ `develop`: sense đầu (`sense_order` nhỏ nhất) đang là "mở rộng / To discover",
  trong khi nghĩa thông dụng là "phát triển". App chỉ hiển thị 2-3 nghĩa đầu, nên thứ tự
  sai làm lộ nghĩa hiếm. Cần xếp `sense_order` theo tần suất sử dụng thực tế.

## Ràng buộc & cách làm
- **Không phá schema và RLS** mà app đang dùng (app đọc bằng vai trò `anon`; mọi bảng
  `lex` cần policy SELECT cho `anon`). Chỉ sửa/đổ lại dữ liệu, không đổi cấu trúc cột
  nếu chưa thống nhất.
- Ghi bằng **service-role key** cho thao tác bulk (anon không ghi được).
- Trước khi đổ đại trà: chạy trên một mẫu nhỏ, kiểm chứng bằng các truy vấn ở trên, rồi
  mới mở rộng. Báo cáo số liệu trước/sau cho từng hạng mục.
- Khám phá cấu trúc repo `zhesen-pipeline` trước (script crawl/transform/load hiện có,
  nguồn dữ liệu gốc) rồi mới sửa; ưu tiên sửa tại bước transform thay vì vá ở DB.

## Tiêu chí hoàn thành (gợi ý đo)
- Ví dụ dính chữ: từ 8.771 về gần 0.
- Audio: ZH > 80%, EN/ES tăng đáng kể, định dạng phát được mọi trình duyệt.
- `gloss_vi`: ZH và ES đạt > 90% sense.
- Audio dán nhãn sai: về 0.
