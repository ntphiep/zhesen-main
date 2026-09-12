# Thiết kế Phase 3: Pipeline dựng kho từ vựng giàu (Zhesen)

Ngày: 2026-06-18
Trạng thái: Bản thiết kế chờ duyệt
Tiền đề: Phase 1 (POC local) và Phase 2 (Supabase backend) đã hoàn tất, commit và push lên `origin/master` (HEAD `3f7c473`).

## 1. Tổng quan và mục tiêu

Phase 3 tạm gác phần web để tập trung xây một **kho từ/câu/cụm từ cực giàu và chi tiết** cho ba ngôn ngữ (tiếng Anh, tiếng Trung, tiếng Tây Ban Nha), với tiếng Việt là ngôn ngữ nền. Mỗi mục từ phải gom gần như mọi thông tin ngôn ngữ học liên quan: đủ các nghĩa từ phổ biến đến hiếm, phiên âm IPA theo nhiều giọng, từ loại, các dạng biến đổi, từ liên quan, độ phổ biến, level, ví dụ, audio, ảnh (với danh từ), và liên kết chéo giữa ba ngôn ngữ.

Mục tiêu của phase này là **dữ liệu, không phải tính năng**. Khi kho đã đủ lớn và đủ giàu thì các tính năng học mới được xây tiếp ở phase sau. Cách làm là một pipeline ETL bằng Python: tải dữ liệu nguồn, bóc tách, chuẩn hóa, hợp nhất, làm giàu, rồi nạp vào Supabase.

Vòng đầu dựng **trọn vẹn tiếng Anh đầu cuối** để battle-test toàn bộ pipeline và schema, sau đó nhân bản cách làm sang tiếng Trung và tiếng Tây Ban Nha.

## 2. Phạm vi

### Có trong Phase 3

- Một schema quan hệ giàu trên Postgres (schema `lex`), lõi dùng chung cho ba ngôn ngữ, kèm phần mở rộng riêng cho tiếng Trung và tiếng Tây Ban Nha.
- Pipeline ETL bằng Python theo các stage tách bạch, mỗi stage nhận/xuất file artifact để tái lập và chạy lại được.
- Bộ nguồn lai (hybrid): các dump mở/giấy phép rõ làm xương sống, cộng với crawler lấy thêm từ các trang từ điển (Cambridge, hanzii, babla).
- Nạp dữ liệu hoàn thiện vào Supabase ở bộ bảng mới, tách khỏi `vocab_items` của POC.
- Theo dõi nguồn gốc, giấy phép và tier (open/personal) cho mọi bản ghi.
- Báo cáo độ phủ và QA đối chiếu chọn mẫu.
- Hoàn tất tiếng Anh trước; tiếng Trung và Tây Ban Nha tái dùng pipeline.

### Không nằm trong Phase 3

- Phần văn hóa/lịch sử/câu chuyện do LLM viết (hoãn sang một pass enrichment sau, làm cho tập từ đã chọn).
- Sửa giao diện web hay đổi `ContentSource`/`ProgressStore` để app đọc mô hình mới (để phase tích hợp sau; web đang tạm gác).
- Nâng cấp tài khoản, realtime, deploy.
- Viết crawler bằng Go (để dành một phase học Go riêng sau).

## 3. Quyết định kiến trúc đã chốt

1. **Nguồn lai (hybrid).** Dump mở/giấy phép rõ làm xương sống vì tải hàng loạt nhanh và ổn định; crawler bổ sung từ Cambridge/hanzii/babla. Vì đây là dự án học cá nhân nên cứ crawl thoải mái. Vẫn giữ metadata nguồn/giấy phép/tier vì gần như miễn phí và để dành đường mở thành sản phẩm thật sau này mà không phải dựng lại.
2. **Tiếng Anh trước.** Dựng trọn vẹn một ngôn ngữ đầu cuối để chốt pipeline và schema, rồi nhân bản. Schema thiết kế đủ tổng quát để tiếng Trung và Tây Ban Nha cắm vào.
3. **Python toàn bộ.** Tận dụng hệ tooling ngôn ngữ học sẵn có (wiktextract/Kaikki, parser CC-CEDICT/Unihan, `mlconjug3`, `pypinyin`, pandas). Go để dành cho một phase học riêng sau.
4. **Nạp thẳng vào Supabase hiện có**, ở bộ bảng mới (schema `lex`). Toàn bộ phần nặng (tải, parse, chuẩn hóa, merge) chạy trong Python trên file local; chỉ bước load cuối cùng mới ghi vào Supabase, nên iterate vẫn nhanh và không nghịch trực tiếp trên DB hosted. Audio/ảnh chỉ lưu URL/tham chiếu, không nhồi blob.
5. **Enrichment v1 đầy đủ trừ câu chuyện LLM.** Vòng đầu có: senses, IPA, inflections, relations, tần suất, ví dụ, ảnh cho danh từ, audio, liên kết chéo ngôn ngữ. Phần văn hóa/câu chuyện do LLM viết hoãn lại.

## 4. Kiến trúc pipeline

Pipeline là một chuỗi stage, mỗi stage nhận file artifact và xuất file artifact, nên tái lập, chạy lại và dừng giữa chừng đều được. Tất cả bằng Python.

1. **Acquire (tải nguồn).** Tải dump nguồn về và cache kèm checksum để khỏi tải lại. Module crawler lịch sự (rate-limit + cache) lấy thêm từ các trang từ điển. Mọi thứ crawler lấy về gắn cờ `tier=personal`.
2. **Parse (bóc tách).** Mỗi nguồn có parser riêng, biến dump thô thành bản ghi theo dạng trung gian chung, validate bằng pydantic. Mỗi bản ghi mang sẵn `source_id` và `tier`.
3. **Normalize (chuẩn hóa).** Thống nhất nhãn từ loại, ký hiệu IPA, dạng lemma; tách nghĩa; gắn dải tần suất và level; khử trùng lặp.
4. **Merge (hợp nhất).** Gộp nhiều nguồn cho một lemma thành một mục giàu, theo thứ tự ưu tiên ghi rõ (xem mục 6). Xung đột giải bằng luật và lưu nguồn gốc cho từng trường vào `provenance`.
5. **Enrich (làm giàu).** Gắn ví dụ (Tatoeba), ảnh cho danh từ cụ thể (Wikidata/Commons, lưu URL), audio (Tatoeba/Forvo/Commons, lưu URL), và liên kết chéo ngôn ngữ (Wikidata Lexemes).
6. **Load (nạp).** Upsert idempotent các mục đã hoàn thiện vào schema `lex` trên Supabase. Chỉ bước này chạm Supabase.
7. **Validate/QA.** Validate ở ranh giới, đếm dòng, báo cáo độ phủ, đối chiếu chọn mẫu với Cambridge.

Xuyên suốt: mọi bản ghi có nguồn gốc + giấy phép + tier; artifact tái lập được; chạy lại idempotent. Bắt đầu bằng một mẻ nhỏ (top 500-1000 từ tiếng Anh phổ biến) rồi mới scale, để bắt lỗi schema sớm.

### Bố cục thư mục dự kiến

- `pipeline/` chứa mã Python: `acquire/`, `parse/`, `normalize/`, `merge/`, `enrich/`, `load/`, `qa/`, `models/` (pydantic), `crawl/`.
- `data/raw/` cache dump thô (gitignore), `data/interim/` artifact trung gian (gitignore), `data/manifest.json` ghi phiên bản + checksum nguồn.
- `pipeline/tests/` test cho parser/normalizer/merge và smoke test.

## 5. Mô hình dữ liệu (schema `lex`)

Chuẩn hóa quan hệ trên Postgres. Lõi dùng chung cho ba ngôn ngữ; phần mở rộng riêng cho tiếng Trung và tiếng Tây Ban Nha. DDL dưới đây là chỉ dẫn; migration chính xác nằm trong kế hoạch triển khai. `id` của `entries` phải ổn định và được phân biệt khi có từ đồng tự nhiều từ nguyên (ví dụ `en:bear#1`, `en:bear#2`).

```sql
create schema if not exists lex;

-- danh mục nguồn + giấy phép
create table lex.sources (
  id text primary key,             -- 'wiktionary-en','cambridge','cc-cedict','unihan','tatoeba','wikidata-lexemes','cmudict','subtlex'
  name text not null,
  url text,
  license text,                    -- 'CC BY-SA 4.0','CC0','proprietary',...
  tier text not null check (tier in ('open','personal')),
  notes text
);

-- mục từ vựng (từ đơn, cụm, thành ngữ, collocation)
create table lex.entries (
  id text primary key,             -- 'en:dog','zh:狗','es:perro'
  lang text not null references public.languages(code),
  entry_type text not null check (entry_type in ('word','phrase','idiom','collocation')),
  headword text not null,
  headword_normalized text not null,
  traditional text,                -- cho zh
  frequency_rank int,
  frequency_band text,             -- 'very_common','common','uncommon','rare'
  level text,                      -- CEFR (en/es) hoặc HSK (zh)
  level_is_estimated boolean not null default false,
  etymology text,
  attributes jsonb not null default '{}',  -- thuộc tính riêng ngôn ngữ (lượng từ, giống đực/cái, đếm được...)
  source_id text references lex.sources(id),
  provenance jsonb not null default '{}',  -- nguồn từng trường khi merge
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- nghĩa, xếp từ phổ biến đến hiếm
create table lex.senses (
  id text primary key,
  entry_id text not null references lex.entries(id) on delete cascade,
  pos text,                        -- loại từ
  sense_order int not null,        -- thứ tự phổ biến
  gloss_vi text,                   -- nghĩa tiếng Việt
  gloss_vi_is_mt boolean not null default false,  -- true nếu là máy dịch
  gloss_en text,                   -- định nghĩa gốc
  register text,                   -- formal/slang/archaic...
  domain text,                     -- y học, kỹ thuật...
  sense_frequency text,
  source_id text references lex.sources(id),
  provenance jsonb not null default '{}'
);

-- phát âm theo giọng
create table lex.pronunciations (
  id bigint generated always as identity primary key,
  entry_id text not null references lex.entries(id) on delete cascade,
  accent text not null,            -- 'en-UK','en-US','es-ES','es-419','zh-pinyin'
  ipa text,
  audio_url text,
  audio_source text,
  source_id text references lex.sources(id),
  tier text not null default 'open'
);

-- mọi dạng biến đổi: số nhiều/quá khứ/so sánh (en) và toàn bộ bảng chia động từ (es)
create table lex.inflections (
  id bigint generated always as identity primary key,
  entry_id text not null references lex.entries(id) on delete cascade,
  form_text text not null,
  ipa text,
  mood text,                       -- es: indicativo/subjuntivo/imperativo
  tense text,                      -- es: presente/preterito/imperfecto/futuro/condicional; en: past/present
  person int,                      -- 1/2/3
  number text,                     -- 'sing'/'plur'
  gender text,                     -- 'masc'/'fem'
  degree text,                     -- en: comparative/superlative
  form_label text,                 -- nhãn người-đọc: 'plural','past participle','gerundio'
  source_id text references lex.sources(id)
);

-- đồ thị từ liên quan
create table lex.lex_relations (
  id bigint generated always as identity primary key,
  entry_id text not null references lex.entries(id) on delete cascade,
  related_entry_id text references lex.entries(id),
  related_text text,               -- khi mục liên quan chưa tồn tại
  relation_type text not null,     -- synonym/antonym/derived/other_pos/hypernym/hyponym/collocation/see_also
  source_id text references lex.sources(id)
);

-- câu ví dụ
create table lex.examples (
  id bigint generated always as identity primary key,
  sense_id text references lex.senses(id) on delete cascade,
  entry_id text references lex.entries(id) on delete cascade,
  text text not null,
  reading text,                    -- pinyin cho zh
  translation_vi text,
  translation_en text,
  audio_url text,
  audio_source text,
  source_id text references lex.sources(id),
  tier text not null default 'open'
);

-- ảnh cho danh từ cụ thể, gắn theo nghĩa
create table lex.images (
  id bigint generated always as identity primary key,
  sense_id text not null references lex.senses(id) on delete cascade,
  url text not null,
  thumbnail_url text,
  source_id text references lex.sources(id),
  license text,
  attribution text,
  tier text not null default 'open'
);

-- cùng một khái niệm giữa các ngôn ngữ
create table lex.cross_language_links (
  id bigint generated always as identity primary key,
  from_sense_id text references lex.senses(id) on delete cascade,
  to_sense_id text references lex.senses(id) on delete cascade,
  from_entry_id text references lex.entries(id) on delete cascade,
  to_entry_id text references lex.entries(id) on delete cascade,
  link_type text not null default 'translation',
  concept_id text,                 -- Wikidata lexeme/sense id
  source_id text references lex.sources(id)
);

-- văn hóa/lịch sử/câu chuyện (hoãn ở v1, schema để sẵn)
create table lex.enrichment (
  id bigint generated always as identity primary key,
  entry_id text references lex.entries(id) on delete cascade,
  sense_id text references lex.senses(id) on delete cascade,
  kind text not null,              -- culture/history/geography/story/usage
  body text not null,
  citations jsonb not null default '[]',
  generated_by text,               -- 'llm:claude-... 2026-..' hoặc nguồn
  tier text not null default 'open'
);

-- mở rộng zh: từng Hán tự
create table lex.characters (
  char text primary key,
  is_simplified boolean,
  simplified_variant text,
  traditional_variant text,
  radical text,                    -- bộ
  stroke_count int,
  decomposition text,              -- thành phần
  pinyin text[],                   -- mọi âm, kể cả đa âm
  cantonese text[],
  han_viet text[],                 -- trường kVietnamese của Unihan
  gloss text,                      -- kDefinition
  source_id text references lex.sources(id)
);

create table lex.entry_characters (
  entry_id text not null references lex.entries(id) on delete cascade,
  char text not null references lex.characters(char),
  position int not null,
  primary key (entry_id, position)
);

-- mở rộng es: giải thích thì/thể, dùng lại cho mọi động từ thay vì lặp từng từ
create table lex.grammar_concepts (
  id text primary key,             -- 'es:subjuntivo.presente'
  lang text not null references public.languages(code),
  mood text,
  tense text,
  title_vi text not null,
  explanation_vi text not null,
  source_id text references lex.sources(id)
);
```

Ánh xạ yêu cầu của người dùng vào schema:

- Tiếng Anh: nhiều nghĩa phổ biến đến hiếm (`senses.sense_order`), IPA Anh-Anh và Anh-Mỹ (`pronunciations.accent`), loại từ (`senses.pos`), từ liên quan và các form khác (`lex_relations`, `inflections`), độ phổ biến (`entries.frequency_*`), level (`entries.level`), audio (`pronunciations.audio_url`).
- Tiếng Trung: hán tự + giản/phồn + mọi pinyin + mọi Hán-Việt kèm nghĩa + bộ thủ (`characters` nối qua `entry_characters`); pinyin cả từ ở `pronunciations` (accent `zh-pinyin`); lượng từ ở `attributes`.
- Tiếng Tây Ban Nha: giọng Tây Ban Nha và Mỹ Latin (`pronunciations` accent `es-ES`/`es-419`), từ liên quan (`lex_relations`), và **toàn bộ bảng chia động từ** (`inflections` theo mood × tense × person × number) kèm giải thích từng thì/thể (`grammar_concepts`).
- Chung: ví dụ (`examples`), ảnh cho danh từ (`images`), từ đó trong ngôn ngữ khác (`cross_language_links`), cụm từ/thành ngữ là `entries` hạng nhất qua `entry_type`.

### RLS

Khi nạp, áp policy nhất quán với mô hình bảo mật Phase 2: bật RLS, policy `SELECT` cho vai trò `authenticated`. Pipeline nạp qua service role nên bỏ qua RLS. (App đọc mô hình mới là việc của phase tích hợp sau.)

## 6. Bản đồ nguồn cho tiếng Anh và luật merge

- **Wiktionary (bản trích Kaikki)**: xương sống. Cung cấp senses, `pos`, `etymology`, IPA Anh-Anh + Anh-Mỹ, `inflections`, `lex_relations`, bảng dịch.
- **Cambridge (crawl)**: bổ sung level CEFR, nghĩa Anh-Việt, IPA UK/US, audio UK/US, câu ví dụ.
- **Nghĩa tiếng Việt (`gloss_vi`)**: ưu tiên crawl từ điển Anh-Việt + bảng dịch Wiktionary; fallback dịch máy nhưng đặt `gloss_vi_is_mt = true`.
- **CMU Pronouncing Dictionary**: phát âm Mỹ (ARPAbet đổi sang IPA), nguồn bù khi Wiktionary thiếu.
- **Tần suất (wordfreq/SUBTLEX)**: `frequency_rank`, `frequency_band`; khi không có wordlist CEFR thì ước lượng `level` từ đây và đặt `level_is_estimated = true`.
- **Tatoeba**: câu ví dụ kèm bản dịch và audio.
- **Wikidata Lexemes**: liên kết chéo ngôn ngữ. **Wikidata/Commons (P18)**: ảnh cho danh từ cụ thể.

Luật merge: Wiktionary làm nền cấu trúc; Cambridge bổ sung CEFR + Anh-Việt + audio; các nguồn còn lại lấp tần suất/ví dụ/ảnh/liên kết. Khi xung đột, ưu tiên theo thứ tự đã nêu và ghi nguồn từng trường vào `provenance`.

## 7. Phạm vi enrichment v1

Có trong v1: senses, IPA, inflections, relations, tần suất, ví dụ, ảnh cho danh từ, audio, liên kết chéo ngôn ngữ. Hoãn: phần văn hóa/lịch sử/câu chuyện do LLM viết (bảng `lex.enrichment` đã để sẵn, sẽ làm pass riêng cho tập từ đã chọn, kèm trích nguồn để không bịa).

## 8. Nguồn gốc, giấy phép, tier

Bảng `lex.sources` là danh mục nguồn kèm giấy phép và tier. Mọi bản ghi tham chiếu `source_id`. Mục đã merge giữ thêm `provenance` (jsonb) ghi từng trường lấy từ nguồn nào. Dữ liệu crawl từ trang từ điển đặt `tier=personal`; dữ liệu từ dump mở đặt `tier=open`. Nhờ vậy sau này lọc hoặc thay phần personal-only được sạch sẽ.

## 9. QA, validate, xử lý lỗi

- **Validate ở ranh giới**: mỗi bản ghi trung gian validate bằng pydantic; record sai hình dạng tách ra artifact `errors/`, pipeline vẫn chạy tiếp và tổng kết cuối.
- **Báo cáo độ phủ**: sau mỗi lần chạy in % mục có IPA, có `gloss_vi`, có ví dụ, có audio, có ảnh (với danh từ), phân bố theo dải tần suất, số mục trùng đã gộp.
- **Đối chiếu chọn mẫu**: lấy mẫu ngẫu nhiên, so với Cambridge để bắt sai lệch nghĩa/IPA/CEFR.
- **Xử lý lỗi crawl/mạng**: retry có backoff, cache lại; trường nào nguồn không có thì để null và provenance ghi rõ thiếu, không bịa.

## 10. Kiểm thử

- TDD cho phần thuần: unit test từng parser (input mẫu cho ra record kỳ vọng), test luật ưu tiên khi merge, test chuẩn hóa (ánh xạ IPA/POS), test migration schema.
- Một smoke test đầu cuối trên fixture nhỏ (vài từ) chạy hết các stage tới load (vào DB test cục bộ hoặc mock load).

## 11. Tái lập

- `data/manifest.json` ghi phiên bản và checksum của từng dump nguồn.
- Artifact trung gian đủ để chạy lại từ giữa pipeline mà không tải/parse lại.
- Upsert theo id ổn định nên chạy lại không nhân bản.

## 12. Rủi ro và điểm cần xác minh

- **Giấy phép từng nguồn**: các giấy phép nêu trong tài liệu này (ví dụ CC-CEDICT, Unihan, Wikidata Lexemes CC0, Wiktionary CC BY-SA) là theo hiểu biết hiện tại và **cần xác minh chính xác** trước khi dựa vào, dù với dùng cá nhân thì không chặn.
- **Trường Hán-Việt của Unihan (`kVietnamese`)**: cần xác minh tên trường và độ phủ thực tế khi bắt tay tiếng Trung.
- **`gloss_vi` chất lượng**: nghĩa tiếng Việt là phần khó nhất; cần đối chiếu và đánh dấu rõ chỗ nào là máy dịch.
- **Level CEFR mở**: không có wordlist CEFR mở đầy đủ; phần ước lượng từ tần suất phải đánh dấu `level_is_estimated`.
- **Đồng tự nhiều từ nguyên**: `entries.id` cần quy ước phân biệt rõ.
- **Dung lượng Supabase free-tier**: theo dõi kích thước; audio/ảnh chỉ lưu URL; nếu đụng trần thì cắt bớt corpus ví dụ hoặc cân nhắc Storage.
- **Độ ổn định crawl**: cấu trúc trang từ điển có thể đổi; parser crawl cần khoanh vùng và dễ sửa.

## 13. Công cụ Python dự kiến

`wiktextract`/dữ liệu Kaikki, `pydantic`, `pandas` hoặc `duckdb`, `requests`/`httpx` cho crawl, `beautifulsoup4`/`lxml` cho HTML, `mlconjug3`/`verbecc` (es), `pypinyin` và parser CC-CEDICT/Unihan (zh), `supabase` (client Python) cho bước load. Danh sách chính xác và phiên bản chốt trong kế hoạch triển khai.
