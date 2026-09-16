# Dọn database, sửa lỗi tìm kiếm, và deploy, 2026-09-17

Báo cáo đợt làm việc ngày 17/09. Ba việc được giao: thay token deploy, trả lời câu hỏi về
các schema trên Supabase, và dọn rác trong database. Trong lúc dọn thì tìm thêm hai lỗi
thật, một trong số đó đang làm production trả 500.

Mọi con số dưới đây lấy từ output lệnh chạy trong phiên. Chỗ nào chưa đo được thì ghi rõ.

## 1. Token deploy

Secret `VERCEL_TOKEN` trên GitHub đã thay. Token mới thuộc team `zhesen`
(`team_rfK6c0vpzY7uNlCrXsnRt489`), khớp `VERCEL_ORG_ID` trong
[`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml). Lần chạy CI ngay sau đó,
run `35127198869`, cả bốn job xanh kể cả job `Deploy to Vercel` vốn hỏng từ hôm trước.

Token được dán trong một cửa sổ chat. Nó đã nằm ngoài tầm kiểm soát của bạn kể từ lúc đó,
nên nếu muốn chặt chẽ thì tạo token mới rồi thu hồi token này ở
<https://vercel.com/account/settings/tokens>.

## 2. Mười hai schema trên Supabase là những schema nào

Câu hỏi: vì sao danh sách schema dài thế, và cái nào là của zhesen.

Mười một trên mười hai đi kèm nền tảng hoặc extension, không phải do dự án tạo:

| Schema | Của ai | Nội dung |
| --- | --- | --- |
| `auth` | Supabase Auth | 27 bảng, 1.704 kB. Tài khoản, phiên, token |
| `storage` | Supabase Storage | 8 bảng, 240 kB. Hiện rỗng: 0 bucket, 0 object |
| `realtime` | Supabase Realtime | 2 bảng, 56 kB. Publication `supabase_realtime` không có bảng nào |
| `vault` | Supabase Vault | 1 bảng 1 view, 24 kB |
| `graphql`, `graphql_public` | `pg_graphql` | 0 byte |
| `extensions` | Supabase | Nơi cài `pg_trgm`, `pgroonga`, `unaccent`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements` |
| `pgbouncer` | Supabase | Connection pooler |
| `pgroonga` | extension `pgroonga` | 0 byte |
| `supabase_migrations` | Supabase CLI | 1 bảng, 104 kB. Sổ migration |
| `public` | Postgres | Schema mặc định |

zhesen sở hữu đúng **một schema là `lex`** (13 bảng, 197 MB) và **bốn bảng trong `public`**:
`user_words`, `review_log`, `profiles`, `languages`.

### Cách phân biệt: đặt comment, không đổi tên

Migration [`0041_label_zhesen_objects.sql`](../../../supabase/migrations/0041_label_zhesen_objects.sql)
gắn comment cho `lex` và bốn bảng đó. Dashboard Supabase hiển thị comment ngay cạnh tên
schema và tên bảng, nên câu hỏi "cái nào của mình" được trả lời ngay tại chỗ người ta hỏi.

Đổi tên `lex` thành thứ như `zhesen_lex` là phương án còn lại và đã bị loại. `lex` xuất
hiện trong mọi migration, trong `.schema('lex')` ở client, và trong tên tám function mà app
gọi thẳng. Đổi tên là một đợt sửa đồng bộ hai repository để lấy một cái tên dài hơn.

## 3. Dọn rác: database vốn đã sạch

Rà toàn bộ trước khi xoá bất cứ thứ gì. Kết quả:

| Kiểm | Kết quả |
| --- | --- |
| Dòng mồ côi ở `senses`, `pronunciations`, `inflections`, `lex_relations`, `user_words`, `review_log` | 0 ở cả sáu |
| Bloat cao nhất | 102 dòng chết trên `lex.characters`, 5,2% |
| Tệp PGroonga thừa | không có. `object_list` chỉ có `Sources26726` và `Sources26731`, khớp `relfilenode` của hai index đang sống |
| Bucket và object trong `storage` | 0 và 0 |
| Bảng trong publication `supabase_realtime` | 0 |
| Tài khoản trong `auth.users` | 3, cả ba đều có lý do tồn tại |

Nghĩa là không có khoản dung lượng lớn nào để lấy lại. 383 MB hiện tại gồm 197 MB dữ liệu
`lex` thật, 91 MB tệp PGroonga, phần còn lại là schema nền tảng và pg_catalog.

### Đã xoá

Migration [`0040_drop_legacy_srs_columns.sql`](../../../supabase/migrations/0040_drop_legacy_srs_columns.sql)
xoá sáu cột `srs_*` trên `public.user_words` cùng index `user_words_user_due_idx` đi kèm.
`0017_fsrs.sql` đã chuyển dữ liệu sang các cột `fsrs_*` và cố ý để lại cột cũ cho đường lùi
về SM-2; đường lùi đó không còn khả thi. Không mã nào trong app hay trong `zhesen-pipeline`
đọc `srs_`, không function, view, trigger hay constraint nào tham chiếu, và index đi kèm có
`idx_scan` = 0. Trong 416 dòng chỉ có đúng 1 dòng mang lịch sử SM-2, từ 21/06.

Lý do xoá không phải để lấy dung lượng mà để bỏ một cái bẫy: `AGENTS.md` đã ghi một lần
migration lọc theo cột `srs_*` đóng băng và ghi đè tiến độ ôn tập thật.

### Còn thừa nhưng chưa đụng, vì phải sửa `zhesen-pipeline` trước

| Thứ | Bằng chứng | Vì sao chưa xoá |
| --- | --- | --- |
| Cột `lex.examples.sense_id` | null ở cả 144.997 dòng; index `idx_lex_examples_sense` 1.272 kB | `zhesen-pipeline/pipeline/merge.py:124` cố ý gán `sense_id=None` rồi vẫn gửi cột đó lên. Xoá cột trước là làm hỏng loader |
| Bảng `lex.entry_characters` | 9.077 dòng, 1.112 kB, `idx_scan` = 0 trên cả hai index, không mã nào và không function nào đọc | `zhesen-pipeline/pipeline/load/supabase_load.py:194` ghi vào bảng này mỗi lần nạp |
| Chuỗi `utm_*` trong 696 trên 699 `audio_url` | `utm_campaign=index` 677 dòng, `utm_campaign=api` 19 dòng, 3 dòng sạch | Pipeline lấy URL kèm chuỗi đó từ Wiktionary, nên dọn ở database sẽ bị lần nạp sau ghi đè lại |

Ba thứ này cộng lại khoảng 2,4 MB trên 383 MB. Sửa được nhưng phải sửa bên pipeline trước,
và một lần nạp thật để kiểm, nên không làm trong phiên này.

### Bảng `lex.images` không phải rác

540 dòng, `sense_id` của cả 540 đều trỏ tới một `lex.senses` có thật, một nguồn duy nhất.
Không mã nào đọc. Đây là dữ liệu đã nạp cho một tính năng chưa dựng, không phải dữ liệu
hỏng. Giữ.

## 4. PGroonga tốn 91 MB và không ép xuống được

Đo từng đối tượng Groonga bằng `pgroonga_command('object_inspect', ...)`:

| Index | Byte |
| --- | --- |
| `idx_lex_entries_headword_pgroonga` | 43.683.840 |
| `idx_lex_entries_traditional_pgroonga` | 39.227.392 |
| `IndexStatuses` | 12.636.160 |
| Tổng | 95.547.392, tức 91,1 MB |

`lex.entries.traditional` chỉ có giá trị ở 2.358 dòng trên 36.361, nên một index bộ phận
`where traditional is not null` đáng lẽ nhỏ hơn mười lần. Đã dựng thật và đo: bản bộ phận
có `n_records` 2.358 thay vì 36.361 nhưng `disk_usage` **y hệt** 39.227.392 byte.
`pg_database_size` tăng đúng 38 MB rồi trở lại 401.964.179 byte sau khi xoá và chạy
`vacuum lex.entries`, không để lại tệp thừa nào.

Kết luận đã nâng thành một dòng trong `AGENTS.md`: dung lượng một index PGroonga là khoản
cố định khoảng 37 tới 42 MB, không tỷ lệ với số dòng. Muốn giảm thì chỉ còn cách bỏ hẳn
một index, và bỏ `idx_lex_entries_traditional_pgroonga` là bỏ tính năng tìm chuỗi con trong
chữ phồn thể.

Con số này quan trọng cho câu hỏi thay Supabase bằng AWS: 91,1 MB đó là thứ duy nhất trong
383 MB không có bản tương đương trên RDS lẫn Aurora.

## 5. Hai lỗi tìm được trong lúc dọn

### 5.1. `lex.search` phụ thuộc vào `search_path` của người gọi

`%`, `&@`, `&@~` đều nằm trong schema `extensions`. Function trong `lex` không ghim
`search_path`, nên chúng trả lời hay ném `SQLSTATE 42883` là tuỳ role nào gọi. `anon` và
`authenticated` có `extensions` nên app không thấy; role read-only của Management API không
chạy nổi `lex.search`.

Đã thử cách của các migration trước là qualify từng toán tử (`0034`, `0039`, và `0042` viết
trong phiên này) và mỗi lần lệnh tiếp theo lại hỏng ở toán tử kế:

```
sau 0042:  select headword from lex.search('習', array['zh'], 8)
           ERROR: 42883: operator does not exist: text &@ text
```

[`0043_lex_functions_pin_search_path.sql`](../../../supabase/migrations/0043_lex_functions_pin_search_path.sql)
ghim `search_path = lex, extensions, public` cho cả tám function trong `lex`. Cách này phủ
mọi toán tử ở mọi nhánh, kể cả nhánh chưa ai viết, và đúng thứ năm function trong `public`
đã làm từ `0032` cũng như thứ database linter của Supabase yêu cầu.

Kiểm: chạy cả tám function bằng đúng role trước đó không chạy được. `習` trả `学习` và
`习慣`, `search_vi('con cho')` trả 10 dòng, nhánh fuzzy trả 5 dòng cho `dogg`. Chạy lại
bằng `anon` qua PostgREST, 12 lệnh phủ cả tám function, tất cả đều trả lời.

### 5.2. Tìm chữ Trung không phải headword làm production trả 500

`https://zhesen-main.vercel.app/dictionary/search?q=習` trả **HTTP 500**.

Nguyên nhân: `lex.search` tìm ra `学习` qua dạng phồn thể và chấm 1,5, là bậc điểm của
PGroonga, thấp hơn ngưỡng `STRUCTURAL_MATCH` bằng 3,0 trong
[`lib/dictionary/search.ts:103`](../../../lib/dictionary/search.ts). `searchBothDirections`
đọc đó là "chưa tìm được gì hơn phỏng đoán" nên gọi tiếp `lex.search_vi`, là hàm dò chuỗi
người dùng gõ trong các nghĩa tiếng Việt. Tiếng Việt viết bằng chữ Latin, nên một truy vấn
chữ Hán không bao giờ khớp được: đo 780 tới 1.195 ms để trả về 0 dòng, và một lần vượt
statement timeout của Supabase với `SQLSTATE 57014`, thành 500.

Mọi truy vấn tiếng Trung không phải headword chính xác đều trả giá này. `習`, `學習`, `學`,
`沒` đều dính; `狗` không, chỉ vì nó là headword và được chấm 4,02.

Sửa: thêm `looksHan` vào `lib/dictionary/detect.ts`, dùng lại đúng regex `HAN` đã có sẵn cho
`detectOrder`, và bỏ qua reverse lookup khi truy vấn có chữ Hán. Có 22 trên 183.526 nghĩa
tiếng Việt thật sự có chứa chữ Hán, nhưng cả 22 đều thuộc entry tiếng Trung mà forward
search với tới được bằng headword, nên không mục từ nào thành không tìm thấy.

Đo lại trên bản build production chạy tại máy: `習` trả 200 với hai kết quả forward và
không gọi reverse; bốn truy vấn tiếng Trung chạy 235 tới 486 ms lúc nguội. Truy vấn Latin
không đổi: `nhan duoc` vẫn trả 18 dòng reverse, `a((` vẫn trả 18.

## 6. File audio

Nghiên cứu riêng ở [`research/2026-09-17-audio-hosting.md`](../research/2026-09-17-audio-hosting.md).
Tóm tắt: chuyển được và nên chuyển sang S3 `ap-northeast-2` sau CloudFront, nhưng chỉ khi
làm phần ghi công tác giả trước, vì 647 trên 699 file đòi ghi công và app hiện không hiện
dòng nào. Chi phí không quyết định được gì, cả bốn phương án đều dưới 0,12 đô một tháng.
Độ trễ thì có: CloudFront 32,3 ms từ PoP Hà Nội so với Wikimedia 411 ms lúc nguội.

## 7. Còn nợ

- Sửa `zhesen-pipeline` rồi mới xoá được `lex.examples.sense_id`, `lex.entry_characters`,
  và chuỗi `utm_*` trong `audio_url`.
- Ghi công tác giả cho 647 file audio. Phải làm dù có chuyển host hay không.
- 68 file audio nằm trong database mà `audioMatchesHeadword` không cho qua, nên chưa từng
  phát. Chưa quyết xoá hay sửa.
- Chưa quyết gói Supabase. 383 MB trên trần 500 MB của gói Free.
- Token Vercel đã lộ trong chat, nên thu hồi nếu muốn chặt chẽ.
