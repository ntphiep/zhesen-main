# Kiến trúc lưu trữ dữ liệu cho zhesen, 2026-09-16

Báo cáo trả lời tám câu hỏi: nơi đặt dữ liệu từ điển, nơi đặt dữ liệu người dùng, auth,
đường di trú, file audio, so sánh region, region của Vercel Function, và phương án đẩy
từ điển ra CDN.

Mọi con số giá lấy từ AWS Price List API hoặc trang giá chính thức, kèm ngày tra. Mọi
khẳng định về extension kèm URL doc chính thức. Số đo độ trễ, kích thước payload và kết
quả truy vấn là đo thật từ máy này, đặt tại Việt Nam, ngày 2026-09-16.

## Khuyến nghị

**Không chuyển database đi đâu cả. Vấn đề của zhesen không phải engine database, mà là
Vercel Function đang chạy ở Washington trong khi database ở Seoul. Làm ba việc theo thứ
tự: thêm một file `vercel.json` đặt region, đổi 17 chỗ `revalidate: 3600` thành
`revalidate: false`, và viết lại `lex.suggest` cho dùng được index. Cả ba đều miễn phí và
làm xong trong một buổi. Khi thương mại hoá thì nâng Supabase lên gói Pro 25 đô.**

Ba lý do:

1. **Phần lớn độ trễ nằm ở đường mạng, không ở database.** Đo thật: `lex.search` tốn 46,3
   ms trong database nhưng người dùng chờ 319 tới 582 ms. Repo **không có `vercel.json`**,
   nên Vercel Function chạy ở region mặc định `iad1` Washington
   ([doc](https://vercel.com/docs/regions), tra 2026-09-16), trong khi Supabase ở
   `ap-northeast-2` Seoul. Mỗi truy vấn trượt cache đi Việt Nam tới Washington tới Seoul
   rồi quay ngược. Đổi engine database rút 46 ms xuống 20 ms không cứu được một ngân sách
   520 ms.
2. **PGroonga đang làm việc thật, `idx_scan = 0` là chỉ số sai.** Tôi đã kiểm bằng truy vấn
   thật hôm nay: `lex.search('习', ['zh'], 8)` trả về `習惯` và **`学习`**. Trong định nghĩa
   hiện hành `supabase/migrations/0024_search_candidate_arms.sql:75-83`, không nhánh nào
   ngoài `e.headword &@ q.q_raw` có thể tạo ra dòng `学习` từ truy vấn `习`, vì `习` không
   phải tiền tố của `学习`, nhánh `%` và nhánh tsvector đều bị chặn theo `lang in ('en','es')`,
   và `lex.inflections` không có dòng tiếng Trung nào. Rào cản chuyển sang RDS hay Aurora
   **không** biến mất.
3. **Dung lượng không còn là ràng buộc nếu mua Pro.** 383,2 MB trên trần 500 MB gói Free là
   chật, nhưng gói Pro cho 8 GB với 25 đô. Phương án AWS rẻ nhất tại region gần Việt Nam là
   RDS `db.t4g.micro` ở `ap-southeast-1`, 20,55 đô, và con số đó chưa gồm PostgREST, auth,
   connection pooling, backup, giám sát.

Thứ duy nhất đáng chuyển sang AWS là 699 file audio, tổng 10,7 MB, sang S3 sau CloudFront.
Chi phí dưới 0,01 đô một tháng.

## Bảng so sánh phương án

| Phương án | Tìm kiếm ba ngôn ngữ chạy bằng gì | PGroonga | Độ trễ người dùng cảm nhận, ước tính | Chi phí thấp nhất mỗi tháng | File phải sửa trong `lib/dictionary/` |
| --- | --- | --- | --- | --- | --- |
| **(0) Sửa region và cache, không đổi database** | y nguyên | còn | **khoảng 140 ms khi trượt cache, khoảng 20 ms khi trúng** | 0 đô, hoặc 25 đô gói Pro | **0** |
| (a) Supabase giữ nguyên như hiện tại | y nguyên | còn | khoảng 520 ms khi trượt cache | 0 đô gói Free, 25 đô Pro | 0 |
| (b) Aurora PostgreSQL Serverless v2 | zh phải viết lại `&@` thành `LIKE likequery()` của `pg_bigm` | **mất** | khoảng 110 ms, cộng 15 giây khi resume | 73 đô nếu dùng RDS Proxy | 9 |
| (c) RDS PostgreSQL `db.t4g.micro` | như (b) | **mất** | khoảng 110 ms | 20,55 đô ở `ap-southeast-1` | 9 |
| (d1) Index tĩnh SQLite FTS5 trên S3 sau CloudFront | FTS5 tokenizer `trigram` | **mất, và mất luôn tiếng Trung** | khoảng 20 ms | dưới 1 đô tới 15 đô | 9, cộng viết mới tầng truy vấn |
| (d2) OpenSearch Serverless | analyzer riêng từng ngôn ngữ, viết lại toàn bộ xếp hạng | thay bằng `smartcn` | chưa đo | 350,40 đô với classic collection | 9, cộng viết mới tầng truy vấn |

Cột file phải sửa đếm số file trong `lib/dictionary/` nhận `SupabaseClient` hoặc gọi
`createContentClient`: 9 trên 28. Mười chín file còn lại là logic thuần.

Phương án (0) thắng ở mọi cột. Phần còn lại của báo cáo giải thích vì sao, và vì sao các
phương án di trú không mua được gì tương xứng.

## Số đo trong phiên này

### Độ trễ mạng từ Việt Nam

TCP handshake, tính bằng `time_connect` trừ `time_namelookup`, 7 mẫu mỗi region, tới
endpoint `dynamodb.<region>.amazonaws.com`:

| Region AWS | Mã Vercel | Nhỏ nhất | Trung vị | Lớn nhất |
| --- | --- | --- | --- | --- |
| `ap-southeast-1` Singapore | `sin1` | 38,9 ms | **40,0 ms** | 48,9 ms |
| `ap-northeast-2` Seoul | `icn1` | 82,1 ms | **92,0 ms** | 96,5 ms |
| `ap-northeast-1` Tokyo | `hnd1` | 92,1 ms | 95,3 ms | 103,3 ms |
| `us-east-1` Washington | `iad1` | 245,8 ms | **283,5 ms** | 303,7 ms |
| `ap-southeast-2` Sydney | `syd1` | 328,2 ms | 329,3 ms | 334,7 ms |

Singapore nhanh hơn Seoul 52 ms và nhanh hơn Washington 243 ms, mỗi chặng, mỗi chiều.

### Payload và thời gian đáp ứng qua PostgREST

Đo trực tiếp từ máy này tới Supabase, khoá anon:

| Truy vấn | Payload | Round trip |
| --- | --- | --- |
| `lex.search('dog')` | 3.169 byte | 582 ms |
| `lex.search('狗')` | 223 byte | 329 ms |
| `lex.search('学习')` | 261 byte | 353 ms |
| `lex.search('casa')` | 2.831 byte | 320 ms |
| `lex.search('hola')` | 4.603 byte | 354 ms |
| `lex.search('water')` | 3.706 byte | 325 ms |
| `lex.search_vi('con mèo')` | 8.261 byte | 730 ms |
| `lex.search_vi('nhà')` | 8.888 byte | 406 ms |
| `lex.search_vi('chó')` | 8.887 byte | 459 ms |
| `lex.suggest('dogg')` | 5 dòng | 1.420 ms |
| `lex.suggest('helo')` | 5 dòng | 1.181 ms |
| `lex.suggest('cassa')` | 5 dòng | 837 ms |
| `lex.suggest('xyzzyq')` | 0 dòng | 833 ms |

Truy vấn entry detail, đúng select của `lib/dictionary/entryDetail.ts:17-22`: trung bình
6.514 byte trên 6 mục từ, từ 1.018 byte (`zh:狗`) tới 22.114 byte (`en:take`).

Con số `lex.suggest` đo tại chỗ khớp với `pg_stat_statements` mà bạn đưa, trung bình 1.278
ms trên 501 lượt. Nghĩa là `lex.suggest` chậm thật trong database, không phải chậm vì
mạng. Mục 8 nói vì sao và sửa thế nào.

### Dung lượng, theo số bạn đo

`pg_database_size` 383,2 MB, tức 76,6% trần 500 MB. Tổng `pg_total_relation_size` 281,6
MB; chênh 101,6 MB là tệp riêng của PGroonga mà `pg_relation_size` không thấy, đúng như
`AGENTS.md` ghi.

Toàn bộ dữ liệu người dùng là 0,5 MB: `public.user_words` 413 dòng, `public.review_log` và
`public.profiles` dưới 0,1 MB. Tỷ lệ từ điển trên dữ liệu người dùng là khoảng 766 trên 1.

#### Bổ sung 2026-09-17: PGroonga tốn bao nhiêu, và có ép xuống được không

Đo từng đối tượng Groonga bằng
`extensions.pgroonga_command('object_inspect', array['name', <tên>])`:

| Đối tượng | Byte |
| --- | --- |
| `idx_lex_entries_headword_pgroonga`, cả bốn đối tượng | 43.683.840 |
| `idx_lex_entries_traditional_pgroonga`, cả bốn đối tượng | 39.227.392 |
| `IndexStatuses` | 12.636.160 |
| Tổng | 95.547.392, tức 91,1 MB |

Đã thử ép xuống và thất bại. `lex.entries.traditional` chỉ có giá trị ở 2.358 dòng trên
36.361, nên một index bộ phận `where traditional is not null` đáng lẽ nhỏ hơn mười lần.
Dựng thật rồi đo: bản bộ phận có `n_records` 2.358 thay vì 36.361 nhưng `disk_usage` y
hệt 39.227.392 byte, và `pg_database_size` tăng đúng 38 MB rồi trở lại 401.964.179 byte
sau khi xoá. Kết luận: dung lượng một index PGroonga là khoản cố định khoảng 37 tới 42 MB,
không tỷ lệ với số dòng. Muốn giảm thì chỉ còn cách bỏ hẳn một index, và bỏ
`idx_lex_entries_traditional_pgroonga` là bỏ tính năng tìm chuỗi con trong chữ phồn thể.

Con số này định lượng đúng cái ràng buộc khiến RDS và Aurora không thay được Supabase:
91,1 MB trong 383 MB hiện tại là thứ duy nhất không có bản tương đương trên hai dịch vụ
đó, và nó không nén xuống được.

#### Bổ sung 2026-09-17: đã rà rác, database sạch

Rà toàn bộ trước khi tính chuyện dọn. Không có dòng mồ côi ở bất kỳ quan hệ nào
(`senses`, `pronunciations`, `inflections`, `lex_relations`, `user_words`, `review_log`
đều trả 0). Bloat cao nhất là 102 dòng chết trên `lex.characters`. PGroonga không có tệp
thừa: `object_list` chỉ có `Sources26726` và `Sources26731`, khớp đúng `relfilenode` của
hai index đang sống. `storage.buckets` và `storage.objects` đều rỗng. Publication
`supabase_realtime` không có bảng nào. `auth.users` có 3 tài khoản, cả ba đều có lý do tồn
tại.

Ba thứ thật sự thừa: sáu cột `srs_*` trên `public.user_words` (đã
xoá, migration `0040`), cột `lex.examples.sense_id` (null ở cả 144.997 dòng), và bảng
`lex.entry_characters` (9.077 dòng, không nơi nào đọc). Hai thứ sau cần sửa
`zhesen-pipeline` trước nên chưa đụng.

## 1. Dữ liệu từ điển chỉ đọc nên nằm ở đâu

### PGroonga có đang được dùng không: đã kiểm, có

Đây là câu hỏi quyết định toàn bộ phần còn lại, nên tôi kiểm bằng hành vi thật thay vì
bằng chỉ số.

Định nghĩa hiện hành của `lex.search` là `supabase/migrations/0024_search_candidate_arms.sql`.
CTE `cand` ở dòng 74-83 có đúng chín nhánh `UNION`:

```
exact traditional = q_raw
headword_normalized like q_prefix          -- chỉ tiền tố
headword_normalized % q_norm               -- gated: lang in ('en','es')
search_vector @@ tq_en                     -- gated: lang = 'en'
search_vector @@ tq_es                     -- gated: lang = 'es'
e.headword &@ q.q_raw                      -- PGroonga
e.traditional &@ q.q_raw                   -- PGroonga
pinyin_toneless like q_pinyin || '%'
select id from infl
```

Tôi chạy sáu truy vấn tiếng Trung hôm nay:

| Truy vấn | Kết quả | Thời gian |
| --- | --- | --- |
| `学` | `学`, `学生`, `学校`, `学习`, `学院`, `学者`, `学会`, `学术` | 861 ms |
| `习` | **`习惯`, `学习`** | 460 ms |
| `学习` | `学习` | 557 ms |
| `狗` | `狗` | 1.605 ms |
| `大学` | `大学`, `大学生`, **`芝加哥大学`** | 620 ms |
| `中国` | `中国`, `中国共产党` | 272 ms |

Hai dòng in đậm là bằng chứng. Truy vấn `习` trả về `学习`, và `大学` trả về `芝加哥大学`.
Trong cả hai trường hợp chuỗi tìm nằm ở **giữa hoặc cuối** headword, không phải đầu. Nhánh
`headword_normalized like q_prefix` chỉ khớp tiền tố. Nhánh `%` và hai nhánh tsvector bị
chặn theo `lang in ('en','es')` và `lang = 'en'`, `lang = 'es'`. Nhánh `pinyin_toneless`
so với chuỗi pinyin La tinh, không khớp ký tự Hán. `lex.inflections` có 0 dòng tiếng Trung
theo growth plan. Còn lại đúng một nhánh có thể tạo ra hai dòng đó: `e.headword &@ q.q_raw`.

**Kết luận: PGroonga đang phục vụ, hôm nay, trên production.**

Vậy `idx_scan = 0` nghĩa là gì? Giải thích hợp lý nhất là bộ đếm đó không áp dụng cho
PGroonga. PGroonga là một index access method riêng giữ dữ liệu trong tệp Groonga bên
ngoài, điều mà `AGENTS.md` đã ghi lại và `pg_relation_size` trả 0 cho cả hai index đã xác
nhận. Một access method như vậy không nhất thiết tăng
`pg_stat_user_indexes.idx_scan`. Giả thuyết thay thế là `&@` chạy bằng sequential scan kèm
support function, nhưng khi đó 101,6 MB dung lượng ngoài relation không có lời giải thích
nào khác.

**Hai kịch bản, như bạn yêu cầu:**

- *Nếu PGroonga thật sự đang được dùng*, tức kịch bản mà số đo ủng hộ: bỏ nó là mất tìm
  kiếm chuỗi con tiếng Trung. Chuyển sang RDS hay Aurora bắt buộc phải thay bằng `pg_bigm`
  và phải đối chiếu kết quả trước khi cắt.
- *Nếu PGroonga thật sự chưa bao giờ được dùng*, thì sáu truy vấn trên phải giải thích được
  bằng nhánh khác. Tôi không tìm ra nhánh nào. Trước khi tin kịch bản này, phải chạy
  `explain (analyze, buffers) select * from lex.search('习', array['zh'], 8)` và dán kế
  hoạch thực thi. Đó là bằng chứng duy nhất lật được kết quả trên.

### Cái đang chạy, tóm tắt

`lex.search` xếp hạng bằng bốn cơ chế trong một truy vấn: text search configuration
`lex.zhesen_en` và `lex.zhesen_es` có `unaccent` trong chain dictionary
(`0016_search.sql:39-48`); PGroonga `&@` cho tiếng Trung; cột pinyin sinh từ
`attributes ->> 'pinyin'` (`0016_search.sql:85`); và `pg_trgm` cho fuzzy
(`0024:77`, `0024:129`). `lex.search_vi` quét gloss tiếng Việt trên 183.526 dòng
`lex.senses`. `lex.suggest` là trigram thuần.

### (a) Giữ nguyên Supabase Postgres

Extension đang cài, theo số bạn đo: `pg_trgm` 1.6, `pgroonga` 3.2.5, `unaccent` 1.1,
`pgcrypto` 1.3, `pg_stat_statements` 1.11, `plpgsql`, `supabase_vault`, `uuid-ossp`.
Supabase là nền tảng duy nhất trong sáu phương án có PGroonga.

Giới hạn gói Free ([supabase.com/pricing](https://supabase.com/pricing), tra 2026-09-16):
500 MB database, 5 GB egress, 5 GB cached egress, 50.000 MAU, "Free projects are paused
after 1 week of inactivity". Hiện dùng 383,2 MB, tức 76,6%, dư 116,8 MB.

Gói Pro 25 đô một tháng: 8 GB disk, 250 GB egress, 100.000 MAU. Vượt thì 0,125 đô mỗi GB
disk, 0,09 đô mỗi GB egress.

Growth plan mục 3 có sáu nguồn chờ nạp, trong đó câu ví dụ tiếng Tây Ban Nha và quan hệ từ
vựng tiếng Trung là hai khối lớn. Dư địa 116,8 MB gần như chắc không đủ.

**Một cách lấy lại chỗ mà không đổi nền tảng:** 101,6 MB trong 383,2 MB là tệp PGroonga.
Nếu đổi sang `pg_bigm`, một GIN bigram index trên cột `headword` của 36.361 dòng nhỏ hơn
nhiều, có thể lấy lại phần lớn 101,6 MB đó. Nhưng `pg_bigm` **không nằm trong danh sách
extension đang cài** và Supabase có danh sách extension cố định; **chưa xác minh** Supabase
có cho cài `pg_bigm` hay không. Nếu không cho thì lối này đóng.

File phải sửa trong `lib/dictionary/`: 0.

### (b) Aurora PostgreSQL Serverless v2

PGroonga **không có** trong danh sách extension của Aurora PostgreSQL 17.10 và 16.14
([doc](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraPostgreSQLReleaseNotes/AuroraPostgreSQL.Extensions.html),
tra 2026-09-16). Thay thế duy nhất là `pg_bigm` 1.2_20250903, có trong danh sách đó.

Doc chính thức của pg_bigm ([github.com/pgbigm/pg_bigm](https://github.com/pgbigm/pg_bigm),
file `docs/pg_bigm_en.md`, tra 2026-09-16) ghi hai dòng quyết định trong bảng so sánh với
`pg_trgm`:

- "Full text search for non-alphabetic language (e.g., Japanese)": `pg_trgm` "Not
  supported", `pg_bigm` "Supported".
- "Full text search with 1-2 characters keyword": `pg_trgm` "Slow", `pg_bigm` "Fast".

Đây đúng hai tính chất tiếng Trung cần, vì phần lớn truy vấn dài một tới hai ký tự, đúng
như sáu truy vấn tôi đo ở trên. Đổi lại `pg_bigm` chỉ hỗ trợ toán tử `LIKE` và chỉ index
GIN, nên `e.headword &@ q` phải viết thành `e.headword LIKE extensions.likequery(q)`.

Giá, AWS Price List API ngày 2026-09-16:

| Hạng mục | `us-east-1` | `ap-southeast-1` |
| --- | --- | --- |
| Serverless v2 Standard | 0,12 đô mỗi ACU-hour | 0,20 đô mỗi ACU-hour |
| Serverless v2 I/O-Optimized | 0,16 đô mỗi ACU-hour | 0,26 đô mỗi ACU-hour |
| Storage Aurora Standard | 0,10 đô mỗi GB-tháng | chưa tra |
| I/O Aurora Standard | 0,20 đô mỗi 1 triệu I/O | chưa tra |

Scale to zero có, min capacity 0 ACU kèm auto pause
([doc](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html),
tra 2026-09-16). Ba chi tiết quyết định:

- Khoảng idle tối thiểu 300 giây, cũng là mặc định; tối đa 86.400 giây.
- "the typical time to resume might be approximately 15 seconds"; pause quá 24 giờ thì
  "the resume time can be 30 seconds or longer".
- "If your Aurora cluster has an associated RDS Proxy, the proxy maintains an open
  connection to each DB instance in the cluster. Thus, any Aurora serverless instances in
  such a cluster won't automatically pause."

Dòng cuối là bẫy lớn nhất. Vercel Function là môi trường serverless, mỗi instance mở kết
nối riêng, nên cần RDS Proxy. Bật RDS Proxy là tắt auto-pause, và sàn chi phí thành 0,5
ACU nhân 0,20 đô nhân 730 giờ bằng **73 đô một tháng** ở `ap-southeast-1`. Không bật thì
mỗi lượt tra sau khoảng nghỉ chờ 15 giây, không chấp nhận được với app tra từ.

Giá RDS Proxy: trang giá ghi mô hình "per vCPU per hour" cho provisioned và "per Aurora
Capacity Unit (ACU) per hour consumed" cho Serverless
([aws.amazon.com/rds/proxy/pricing](https://aws.amazon.com/rds/proxy/pricing/), tra
2026-09-16), nhưng **đơn giá chưa tra được**: trang không hiện bảng giá dạng text và Price
List API không trả product family nào cho RDS Proxy ở hai region đã thử.

### (c) RDS PostgreSQL `db.t4g.micro`

PGroonga **không có** trong danh sách extension RDS PostgreSQL 17
([doc](https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-extensions.html),
tra 2026-09-16). Có `pg_bigm` 1.2_20250903, `pg_trgm` 1.6, `unaccent` 1.1, `fuzzystrmatch`
1.2, `pgvector` 0.8.2. Cùng đường thay thế như (b).

Giá on-demand, Single-AZ, PostgreSQL, Price List API ngày 2026-09-16:

| Region | Giá giờ | Một tháng, 730 giờ |
| --- | --- | --- |
| `us-east-1` | 0,016 đô | 11,68 đô |
| `ap-southeast-1` | 0,025 đô | 18,25 đô |

Storage gp3 PostgreSQL `us-east-1`: 0,115 đô mỗi GB-tháng, tối thiểu 20 GB, tức 2,30 đô.
Giá storage `ap-southeast-1` **chưa tra**, thường cao hơn.

Tổng khoảng 13,98 đô ở `us-east-1`, khoảng 20,55 đô ở `ap-southeast-1`, phẳng ở mọi mức
tải.

Reserved instance 1 năm All Upfront cho `db.t4g.micro` ở `us-east-1`: 95 đô trả trước, tức
7,92 đô một tháng. Không mua trước khi chốt kiến trúc.

Giới hạn kỹ thuật: 2 vCPU, 1 GiB RAM. Với 383 MB dữ liệu, working set gần vừa page cache.
Ở mức 50.000 lượt một ngày, tức trung bình 0,58 truy vấn một giây, về lý thuyết đủ, nhưng
**chưa xác minh bằng load test**, và `lex.search_vi` quét 183.526 dòng gloss cộng
`lex.suggest` quét 219.887 dòng là hai truy vấn nặng nhất trong hệ.

RDS free tier 750 giờ một tháng chỉ cho tài khoản mới trong 12 tháng đầu. Tài khoản
đang dùng có 16 bucket S3 từ các bài học cũ nên free tier gần như chắc đã hết;
**chưa xác minh** bằng truy vấn Billing.

### (d1) Index tĩnh SQLite FTS5 trên S3 sau CloudFront

**Phương án này hỏng ở tiếng Trung.** Doc FTS5
([sqlite.org/fts5.html](https://www.sqlite.org/fts5.html), tra 2026-09-16) ghi về tokenizer
`trigram`: "Substrings consisting of fewer than 3 unicode characters do not match any rows
when used with a full-text query." Sáu truy vấn tiếng Trung tôi đo ở trên, năm truy vấn dài
một hoặc hai ký tự. Cả năm trả về 0 dòng trên FTS5 trigram.

Tiếng Anh và Tây Ban Nha chạy được với `unicode61` cộng `remove_diacritics`, nhưng mất
stemming: `lex.zhesen_en` hiện dùng `english_stem`, nên "running" tìm ra "run". FTS5 không
có stemmer tiếng Tây Ban Nha sẵn.

Giá: S3 Standard `us-east-1` 0,023 đô mỗi GB-tháng cho 50 TB đầu (Price List API,
2026-09-16). CloudFront bán theo gói phẳng
([aws.amazon.com/cloudfront/pricing](https://aws.amazon.com/cloudfront/pricing/), tra
2026-09-16): gói Free 0 đô, 1 triệu request, 100 GB data transfer; gói Pro 15 đô. Con số
data transfer của các gói trả phí đọc ra không nhất quán nên **chưa xác minh**.

Kích thước file index **chưa đo được** vì chưa dựng thử.

### (d2) OpenSearch Serverless

Về mặt ngôn ngữ đây là phương án duy nhất ngoài Postgres làm được cả ba: có `smartcn` cho
tiếng Trung và `spanish` cho tiếng Tây Ban Nha. Đổi lại phải dựng lại toàn bộ thang điểm
bốn bậc mà `lib/dictionary/search.ts:103` đang đọc, và luật "xếp hạng trước, làm giàu dữ
liệu sau" mà `AGENTS.md` ghi là ràng buộc bắt buộc.

Giá ([aws.amazon.com/opensearch-service/pricing](https://aws.amazon.com/opensearch-service/pricing/),
tra 2026-09-16): 0,24 đô mỗi OCU-hour ở `us-east-1`. Classic collection: "You will be
billed at least for a minimum of 2 OCUs ... for the first collection in an account", tức
sàn **350,40 đô một tháng** không phụ thuộc tải. NextGen collection: "There is no minimum
OCU requirement. Indexing and Search OCUs scale to zero after 10 minutes of inactivity",
chi phí thật cho workload này **chưa xác minh**. Giá OCU-hour `ap-southeast-1` **chưa tra
được**: Price List API không trả product family `Serverless` cho `AmazonES` ở region đó.

### Công sức thật, vượt xa con số 9 file

Con số "9 file trong `lib/dictionary/`" là mức sàn và dễ gây hiểu nhầm. Cái thật sự phải
làm khi rời Supabase là bỏ PostgREST.

Toàn bộ tầng dữ liệu viết bằng PostgREST client: 25 file trong `lib/`, `app/`,
`components/` gọi `supabase.from(...)`, `supabase.schema('lex')...`, `supabase.rpc(...)`
hoặc nhận `SupabaseClient`. Đếm bằng grep ngày 2026-09-16: `lib/dictionary/` 9 file,
`lib/grammar/queries.ts` 1, `lib/wordlist/` 4, `lib/auth/` 2, `lib/hooks/` 2,
`lib/supabase/` 2, `app/` 6 file.

RDS và Aurora không đi kèm PostgREST. Hai lối: self-host PostgREST trên Fargate, thêm một
service phải vận hành và phải tự dựng phần JWT đặt `request.jwt.claims` cho RLS; hoặc viết
lại tầng dữ liệu bằng `pg` hay Drizzle, tức viết lại 25 file cộng
`lib/supabase/paginate.ts` (tồn tại chỉ vì PostgREST chặn ở 1.000 dòng, xem `paginate.ts:11`)
cộng chuyển toàn bộ RLS sang tầng ứng dụng.

Không lối nào là việc vài ngày.

## 2. Dữ liệu người dùng nên nằm ở đâu

**Kết luận: để nguyên trên Supabase. Tách được nhưng vô nghĩa.**

Bạn nhận xét rằng tỷ lệ 0,5 MB trên 383 MB khiến phương án tách rẻ hơn cảm giác ban đầu.
Đúng về kỹ thuật, nhưng nó dẫn tới kết luận ngược: **tách 0,5 MB ra khỏi Supabase chỉ giải
phóng 0,5 MB.** Hướng có ích là ngược lại, tức đẩy 383 MB từ điển đi và giữ dữ liệu người
dùng cùng auth ở lại. Mục 3 giải thích vì sao đó là hướng duy nhất khả thi nếu buộc phải
lên AWS.

### Không có chỗ nào join hai loại dữ liệu lúc đọc

Grep toàn bộ `lib/`, `app/`, `components/` tìm truy vấn nối `public.user_words` với
`lex.entries`: không có. Mọi truy vấn trên `user_words` là `select` phẳng trên chính bảng
đó: `lib/wordlist/store.ts:96`, `:108`, `:173`, `:182`, `:202`, `:214`,
`lib/wordlist/review.ts:106`, `:146`, `:195`, `lib/wordlist/stats.ts:90`.

Lý do là `user_words` đã denormalise sẵn: `headword`, `reading`, `ipa`, `pos`,
`meaning_vi`, `meaning_en`, `level`, `example`, `example_translation`, `audio_url` đều là
cột riêng (`supabase/migrations/0006_user_words.sql:10-19`). Thẻ ôn tập không đọc
`lex.entries` bao giờ.

### Điểm nối duy nhất là một foreign key lúc ghi

`supabase/migrations/0006_user_words.sql:9`:

```sql
entry_id text references lex.entries(id) on delete set null,
```

Mã đã có sẵn đường xử lý khi FK này vi phạm. `lib/wordlist/store.ts:285-293` bắt lỗi 23503,
giữ từ và bỏ liên kết. `lib/wordlist/csv.ts:180` lọc `entry_id` theo hình dạng `"en:holy"`
trước khi insert, đúng vì lý do đó. Dự án đã coi liên kết này là có thể đứt.

### Mất gì, được gì

Mất: toàn vẹn tham chiếu, và một hệ thứ hai phải cấu hình, theo dõi, backup riêng. Được:
trần dung lượng của từ điển tách khỏi trần của dữ liệu người dùng. Với 25 đô gói Pro cho 8
GB, cái được đó mua được rẻ hơn nhiều bằng tiền.

## 3. Nếu dùng AWS thì auth chạy bằng gì

Auth hiện tại có ba mảnh, cả ba dính Supabase:

1. **Anonymous sign-in.** `lib/supabase/session.ts:29` gọi `signInAnonymously()`, chỉ ở lần
   ghi đầu tiên, vì middleware tạo phiên cho mọi request đã từng sinh 122 tài khoản rỗng và
   chạm trần sign-in của Supabase.
2. **RLS Postgres.** `supabase/migrations/0006_user_words.sql:47-54` so `user_id = auth.uid()`.
   `auth.uid()` đọc JWT mà PostgREST đặt vào `request.jwt.claims`.
3. **Gắn email vào tài khoản ẩn danh.** `lib/auth/account.ts` giữ nguyên user id, đúng vì
   `AGENTS.md` ghi lại vụ mất 407 từ.

Cognito user pools không có anonymous sign-in. Cognito identity pools có guest access,
nhưng doc ghi rõ nó "provides a unique identifier and AWS credentials for users who do not
authenticate with an identity provider"
([doc](https://docs.aws.amazon.com/cognito/latest/developerguide/identity-pools.html), tra
2026-09-16). AWS credentials là thứ để gọi service AWS, không phải JWT mà RLS đọc được.

Giá Cognito ([aws.amazon.com/cognito/pricing](https://aws.amazon.com/cognito/pricing/), tra
2026-09-16): 10.000 MAU miễn phí; Lite 0,0055 đô mỗi MAU cho 90.000 MAU tiếp theo;
Essentials 0,015 đô mỗi MAU. Giá không phải vấn đề ở đây.

| Lựa chọn | Đánh giá |
| --- | --- |
| **Giữ Supabase Auth, chỉ chuyển từ điển sang AWS** | Khả thi nhất nếu buộc lên AWS. `lex.*` không cần auth: `supabase/migrations/0006_user_words.sql:59-63` mở policy select cho `anon` trên năm bảng `lex`. Đúng khớp với tỷ lệ 0,5 MB trên 383 MB: cái nặng thì đi, cái cần auth thì ở lại |
| Tự làm auth | Tự viết anonymous session, ký JWT, refresh token, luồng gắn email. Là viết lại một product |
| Cognito | Cần tầng đệm biến guest identity thành JWT cho RLS, và viết lại `lib/auth/account.ts`. Công sức lớn nhất, lợi ích nhỏ nhất |

## 4. Đường di trú an toàn

Áp cho trường hợp thật sự phải chuyển `lex.*` sang RDS PostgreSQL ở `ap-southeast-1`.

**Bước 0. Làm phương án (0) trước.** Mục 7 và 8. Nếu sau đó độ trễ đã đạt, dừng lại, các
bước sau không cần.

**Bước 1. Dựng RDS instance và nạp schema.** Tạo `db.t4g.micro` ở `ap-southeast-1`, cài
`pg_bigm`, `pg_trgm`, `unaccent`. Chạy migration `0003` tới `0032` trừ phần PGroonga. Quay
lui: xoá instance.

**Bước 2. Viết lại nhánh tiếng Trung.** Thay `e.headword &@ q_raw` bằng
`e.headword LIKE extensions.likequery(q_raw)`, dựng `create index ... using gin (headword gin_bigm_ops)`
và index tương ứng trên `traditional`. Giữ nguyên thang điểm 4.0 / 3.5 / 3.0 để
`lib/dictionary/search.ts:103` không phải sửa. Quay lui: migration mới, chưa ai gọi.

**Bước 3. Nạp dữ liệu và đối chiếu.** `pg_dump` riêng schema `lex`, restore vào RDS. Xác
minh ba mức:

- Đếm dòng từng bảng, phải khớp chính xác: `entries` 36.361, `senses` 183.526, `examples`
  144.997, `inflections` 352.332, `pronunciations` 101.662, `lex_relations` 101.888.
- Checksum: `select md5(string_agg(id, ',' order by id)) from lex.entries` ở cả hai bên.
- **Đối chiếu kết quả tìm kiếm, và đây là bước không được bỏ.** Chạy một bộ truy vấn cố
  định trên cả hai hệ. Nhánh tiếng Anh và Tây Ban Nha phải khớp 100 phần trăm. Nhánh tiếng
  Trung sẽ lệch, và sáu truy vấn tôi đo ở mục 1 là bộ kiểm tối thiểu: `学`, `习`, `学习`,
  `狗`, `大学`, `中国`. Riêng `习` phải trả về `学习` và `大学` phải trả về `芝加哥大学`,
  nếu không thì `pg_bigm` chưa thay được PGroonga.

Quay lui: xoá dữ liệu trong RDS.

**Bước 4. Chạy song song sau một cờ.** Thêm biến `DICTIONARY_BACKEND` nhận `supabase` hoặc
`rds`, mặc định `supabase`. Chỉ `lib/supabase/content.ts` đọc nó, vì mọi truy vấn từ điển
đi qua `createContentClient()` ở file đó và 9 file kia chỉ nhận client làm tham số. Đây là
điểm chèn rẻ nhất trong toàn bộ mã.

Chạy shadow read ít nhất một tuần, ghi log mỗi lần hai bên lệch. Quay lui: đổi cờ.

**Bước 5. Chuyển đọc sang RDS.** Đổi cờ trên preview deployment trước, rồi production. Giữ
Supabase `lex.*` nguyên vẹn. Quay lui: đổi cờ ngược, dưới một phút.

**Bước 6. Cắt liên kết.** Chỉ sau khi RDS chạy ổn ít nhất một tháng: gỡ FK
`user_words.entry_id` (`supabase/migrations/0006_user_words.sql:9`), rồi xoá schema `lex`
khỏi Supabase. **Đây là bước đầu tiên không quay lui được**, phải có `pg_dump` lưu nơi khác
trước. Cắt FK làm `lib/wordlist/store.ts:285-293` thành mã chết; xoá ở commit riêng sau khi
đã xác nhận.

## 5. File audio và ảnh

**Khuyến nghị: có, tự host trên S3 sau CloudFront, nhưng chỉ sau khi pipeline lấy được
thông tin bản quyền từng file.**

Đếm qua PostgREST ngày 2026-09-16: `lex.pronunciations` có 101.662 dòng, trong đó **699
dòng có `audio_url` khác null**. Cả 699 URL trỏ `upload.wikimedia.org`.

Tải 10 file ngẫu nhiên, đo kích thước thật: trung bình 14,9 KB, nhỏ nhất 11,2 KB, lớn nhất
19,7 KB. **Tổng cho 699 file ước khoảng 10,7 MB.** Thời gian tải trung bình từ Việt Nam
0,79 giây một file.

Lấy mẫu 15 file bằng HEAD request, **5 request bị Wikimedia trả HTTP 429**. Hotlink thẳng
vào `upload.wikimedia.org` bị rate limit, và người dùng thật sẽ gặp nút phát âm im lặng.

Giấy phép, tra Commons API `prop=imageinfo&iiprop=extmetadata` trên mẫu 50 file: **48 file
CC BY-SA 4.0, 2 file CC BY-SA 3.0**. Không file nào là public domain. CC BY-SA cho phép
dùng thương mại nên tự host không vướng, nhưng cả hai phiên bản đòi ghi công tác giả và nêu
giấy phép. App hiện phát trực tiếp từ Commons và không hiện dòng ghi công nào, tức nghĩa vụ
này **đang chưa được thực hiện**, dù hotlink hay tự host.

Việc cần làm không phải "copy file sang S3" mà là: pipeline gọi Commons API lấy `Artist` và
`LicenseShortName` cho từng file, ghi vào hai cột mới trên `lex.pronunciations`, component
phát âm hiện dòng ghi công, rồi mới copy.

Chi phí: 10,7 MB tức 0,0107 GB nhân 0,023 đô bằng **0,00025 đô một tháng**. CloudFront gói
Free 1 triệu request và 100 GB đủ cho mọi mức tải trong báo cáo này. `next.config.ts` hiện
có `media-src 'self' https://upload.wikimedia.org` trong CSP; tự host thì bỏ host đó khỏi
CSP và thêm domain CloudFront.

Ảnh: `lex.images` hiện 0 dòng. Chưa có ảnh nào để host.

## 6. Region: `ap-southeast-1` so với `us-east-1`, cho cả Supabase lẫn AWS

Project Supabase hiện ở `ap-northeast-2` Seoul, không phải Singapore.

### Độ trễ

Theo bảng đo ở đầu báo cáo, mỗi round trip từ Việt Nam:

| Đích | RTT trung vị | So với Singapore |
| --- | --- | --- |
| Singapore `ap-southeast-1` | 40,0 ms | mốc |
| Seoul `ap-northeast-2`, nơi đang đặt | 92,0 ms | chậm hơn 52 ms |
| Washington `us-east-1` | 283,5 ms | chậm hơn 243,5 ms |

Một lượt tra trượt cache đi ít nhất một round trip tới database, thường kèm bắt tay TLS mất
thêm một tới hai round trip khi kết nối chưa nóng. Chuyển database từ Seoul sang Singapore
tiết kiệm 52 tới 156 ms mỗi lượt tuỳ trạng thái kết nối.

**Supabase không cho đổi region của project tại chỗ.** Muốn sang Singapore phải tạo project
mới và di trú, tức đổi `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, và quan trọng nhất là **di trú cả `auth.users`**, vì mọi hàng
`user_words` treo dưới `user_id`. Đây là thao tác rủi ro nhất trong toàn bộ báo cáo và
**chưa xác minh** Supabase có công cụ nào hỗ trợ. Không làm trước khi làm xong mục 7 và 8.

### Chi phí

| Hạng mục | `us-east-1` | `ap-southeast-1` | Chênh |
| --- | --- | --- | --- |
| RDS `db.t4g.micro` PostgreSQL | 0,016 đô/giờ | 0,025 đô/giờ | +56% |
| Aurora Serverless v2 Standard | 0,12 đô/ACU-hr | 0,20 đô/ACU-hr | +67% |

Supabase tính giá theo gói, không theo region: gói Pro 25 đô ở Seoul hay Singapore đều như
nhau.

**Kết luận về region:** `ap-southeast-1` đắt hơn `us-east-1` từ 56 tới 67 phần trăm nhưng
nhanh hơn 243,5 ms mỗi round trip. Với một ứng dụng tra cứu nơi người dùng gõ từng ký tự,
243,5 ms là chênh lệch giữa dùng được và không dùng được. **`us-east-1` không phải lựa
chọn cho zhesen, ở bất kỳ phương án nào.**

## 7. Vercel Function chạy ở region nào, và đặt ở đâu thì ngắn nhất

### Hiện trạng: `iad1` Washington

Repo **không có `vercel.json`**. Doc Vercel ghi: "The default Function region is *Washington,
D.C., USA* (`iad1`) **for all new projects**"
([doc](https://vercel.com/docs/functions/configuring-functions/region), tra 2026-09-16), và
"Vercel Functions default to running in the `iad1` (Washington, D.C., USA) region"
([doc](https://vercel.com/docs/regions), tra 2026-09-16).

Vậy đường đi hiện tại của một lượt tra trượt cache, **suy luận từ hai dữ kiện trên, chưa đo
trên deployment thật**:

```
trình duyệt (Việt Nam)
  -> Vercel PoP gần nhất
  -> Vercel Function ở iad1 (Washington)
  -> Supabase ở ap-northeast-2 (Seoul)
  -> ngược lại toàn bộ
```

Doc Vercel giải thích kiến trúc PoP: "PoPs terminate TCP and route requests over a private
network to the nearest Vercel region with single-digit millisecond latency". Chặng
PoP tới region **gần nhất** là vài ms, nhưng function không chạy ở region gần nhất, nó chạy
ở `iad1`, nên vẫn phải trả toàn bộ quãng đường vật lý.

### Giới hạn theo gói

Doc ghi bảng:

| Plan | Function regions |
| --- | --- |
| Hobby | Single region |
| Pro | 5 regions |
| Enterprise | All regions |

Gói Hobby được chọn **một** region, không bị ép dùng `iad1`. Đặt region bằng
`vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["icn1"]
}
```

Mã region theo doc: `sin1` là Singapore `ap-southeast-1`, `icn1` là Seoul `ap-northeast-2`,
`hnd1` là Tokyo, `hkg1` là Hong Kong, `bom1` là Mumbai, `iad1` là Washington.

### Đặt gần Seoul hay gần Singapore

Có hai chặng ngược nhau: trình duyệt tới function, và function tới database. Database đang
ở Seoul.

| Cấu hình | Trình duyệt tới function | Function tới database | Truy vấn | Tổng ước tính |
| --- | --- | --- | --- | --- |
| Hiện tại: `iad1`, DB Seoul | 283,5 ms | Washington tới Seoul, **chưa đo được** | 46,3 ms | **khoảng 520 ms** |
| `icn1`, DB Seoul | 92,0 ms | cùng region, vài ms | 46,3 ms | **khoảng 140 ms** |
| `sin1`, DB Seoul | 40,0 ms | Singapore tới Seoul, **chưa đo được** | 46,3 ms | **khoảng 170 ms** |
| `sin1`, DB Singapore | 40,0 ms | cùng region, vài ms | 46,3 ms | **khoảng 90 ms** |

Hai ô "chưa đo được" là hai chặng giữa hai điểm ở xa, không đo được từ máy này. Số công bố
thường thấy là khoảng 180 ms cho Washington tới Seoul và khoảng 75 ms cho Singapore tới
Seoul, **chưa xác minh**, dùng để ước tổng.

**Trả lời trực tiếp:** chừng nào database còn ở Seoul thì đặt function ở `icn1` Seoul là
ngắn nhất, vì nó xoá hẳn chặng function tới database. Nếu sau này chuyển database sang
Singapore thì đặt function ở `sin1` và tổng còn khoảng 90 ms.

**Đây là thay đổi có tỷ lệ lợi ích trên công sức cao nhất trong toàn bộ báo cáo: một file
`vercel.json` bốn dòng, 0 đô, tiết kiệm khoảng 380 ms mỗi lượt tra trượt cache.**

Lưu ý một ràng buộc: Routing Middleware chạy ở mọi region bất kể cấu hình, theo doc "Vercel
deploys Routing Middleware to all regions by default, regardless of your region settings.
On the Hobby plan, Routing Middleware runs in fewer regions". Middleware của dự án chỉ làm
refresh session nên không đọc `lex.*`, không bị ảnh hưởng.

## 8. Ngân sách độ trễ từng phương án, và phương án CDN

### Ngân sách độ trễ, tách ba phần

Cột "truy vấn" lấy từ `pg_stat_statements` của bạn cho `lex.search`, trung bình 46,3 ms
trên 4.619 lượt. Cột "trình duyệt tới function" lấy từ bảng đo RTT ở đầu báo cáo.

| Phương án | Trình duyệt tới function | Function tới database | Truy vấn | Tổng ước tính |
| --- | --- | --- | --- | --- |
| Hiện tại: Supabase Seoul, function `iad1` | 283,5 ms | chưa đo, khoảng 190 ms | 46,3 ms | **khoảng 520 ms** |
| **(0) Supabase Seoul, function `icn1`** | 92,0 ms | vài ms | 46,3 ms | **khoảng 140 ms** |
| **(0) trúng CDN cache, bất kể database ở đâu** | 10 tới 20 ms tới PoP | 0 | 0 | **khoảng 20 ms** |
| (b) Aurora `ap-southeast-1`, function `sin1` | 40,0 ms | vài ms | ước 20 tới 46 ms | khoảng 110 ms, **cộng 15 giây nếu vừa resume** |
| (c) RDS `ap-southeast-1`, function `sin1` | 40,0 ms | vài ms | ước 46 ms | khoảng 110 ms |
| (d1) SQLite FTS5 trên CloudFront | 10 tới 20 ms | 0 | trong trình duyệt | khoảng 20 ms, **nhưng mất tiếng Trung** |

Đọc bảng này theo hàng chứ không theo cột. Chuyển từ Supabase sang RDS ở Singapore rút tổng
từ 140 ms xuống 110 ms, tức **30 ms**, và đổi lại là mất PGroonga, viết lại 25 file, và trả
20,55 đô một tháng. Trong khi chỉ đổi region của function rút từ 520 ms xuống 140 ms, tức
**380 ms**, với một file cấu hình và 0 đô.

Đó là toàn bộ lập luận của báo cáo này gói trong một bảng.

### Phương án (0c): đẩy từ điển ra CDN

Dự án đã dựng gần hết phương án này. `app/dictionary/search/route.ts` có:

- `unstable_cache` với `tags: ['lex']` (dòng 10-14),
- `CDN-Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` (dòng 57),
- `Cache-Control: public, max-age=0, must-revalidate` (dòng 56),
- và `app/api/revalidate/route.ts:29` gọi `revalidateTag('lex', 'max')` để pipeline chủ
  động xoá cache khi nạp dữ liệu mới.

Khi trúng CDN cache, phản hồi được phục vụ từ PoP gần người dùng và **không đi tới Seoul,
không đi tới Washington, không chạm database**. Tổng độ trễ khoảng 20 ms. Không phương án
di trú nào trong báo cáo này đạt gần con số đó.

**Bốn thứ còn thiếu:**

**Thiếu 1, quan trọng nhất: `revalidate: 3600` nên là `revalidate: false`.** Có **17 chỗ**
đặt `revalidate: 3600`, trong ba file: `app/dictionary/search/route.ts`,
`lib/dictionary/cached.ts`, `lib/grammar/cached.ts`. Từ điển chỉ đổi khi pipeline chạy, và
`app/api/revalidate/route.ts` đã có sẵn đường để pipeline báo. Cửa sổ một giờ vì vậy không
mua được gì, mà bảo đảm rằng **mỗi truy vấn đều phải quay về Seoul ít nhất một lần mỗi
giờ**. Đổi thành `revalidate: false` giữ cache tới khi pipeline nói ngược lại. Đây là đổi
một từ ở 17 chỗ.

**Thiếu 2: trang chi tiết mục từ hoàn toàn không có CDN cache.**
`app/dictionary/[lang]/[id]/page.tsx` là Server Component động, nó `await params`. Dữ liệu
bên trong có `unstable_cache`, nhưng **trang đã render thì không nằm trong CDN**. Grep toàn
bộ `app/` chỉ tìm thấy `Cache-Control` và `CDN-Cache-Control` ở đúng một chỗ, là
`app/dictionary/search/route.ts:56-57`. Nghĩa là mọi lượt mở một mục từ đều chạy function ở
`iad1`. Theo `pg_stat_statements` của bạn, truy vấn trang chi tiết trung bình 471 ms trên
190 lượt, và trang này gọi tới tám truy vấn cached khác nhau (`page.tsx:18-26`,
`:36`, `:45`). Cách sửa: `generateStaticParams` cho vài nghìn mục từ thông dụng nhất, hoặc
đặt header cache cho segment. Next 16 có `cacheComponents` và `"use cache"`;
`next.config.ts` hiện **không bật** `cacheComponents`.

**Thiếu 3: `lex.suggest` chậm vì không dùng được index, và đây là lỗi truy vấn chứ không
phải lỗi hạ tầng.** `lex.suggest` chỉ được định nghĩa ở
`supabase/migrations/0018_reverse_lookup.sql` và chưa bao giờ sửa lại. Cả hai CTE của nó
lọc bằng:

```sql
where ... and extensions.similarity(e.headword_normalized, q_norm) > 0.15
```

và

```sql
where ... and extensions.similarity(s.gloss_vi_normalized, q_norm) > 0.15
```

Hai index GIN trigram tồn tại và đúng cột: `idx_lex_entries_headword_trgm` trên
`headword_normalized` (`0016_search.sql:69`) và `idx_lex_senses_gloss_vi_trgm` trên
`gloss_vi_normalized` (`0018_reverse_lookup.sql:29`). Nhưng GIN trigram chỉ phục vụ toán tử
`%`, không phục vụ một lời gọi hàm `similarity(...) > x`. Nên cả hai CTE quét toàn bảng:
36.361 dòng `lex.entries` cộng 183.526 dòng `lex.senses`, mỗi dòng tính một độ tương tự
trigram. Đó là lời giải thích cho 1.278 ms.

Tác giả biết sự khác biệt này: `0024_search_candidate_arms.sql:77` dùng đúng `%` trong
nhánh fuzzy của `lex.search`, và `lex.search` chỉ tốn 46,3 ms. `lex.suggest` bị bỏ lại ở
khuôn cũ từ `0018`.

Cách sửa: dùng `%` trong `where` để index vào cuộc, giữ `similarity()` chỉ trong `select`
để chấm điểm, và nếu cần ngưỡng 0,15 thay vì mặc định 0,3 thì
`set local pg_trgm.similarity_threshold = 0.15` ngay trong hàm.

**Đây là suy luận từ định nghĩa hàm và danh sách index, chưa chạy `EXPLAIN`.** Trước khi
sửa hãy chạy `explain (analyze, buffers) select * from lex.suggest('dogg', 5)` để xác nhận
hai `Seq Scan`.

Cùng lý do đó áp cho truy vấn `lex.inflections where form_text = any(...)`, 1.691 ms trên
77 lượt theo số của bạn, gọi từ `lib/dictionary/resolveTokens.ts:30`. Cần kiểm xem có index
trên `lex.inflections(form_text)` không; grep các migration không thấy dòng
`create index` nào cho cột đó.

**Thiếu 4: trình duyệt phải hỏi lại mỗi lần.** `Cache-Control: public, max-age=0,
must-revalidate` (`route.ts:56`) buộc trình duyệt gửi một request cho mọi truy vấn, kể cả
truy vấn nó vừa gõ. Lý do ghi ở `route.ts:48-54` là đúng: chỉ đặt `s-maxage` thì trình
duyệt tự suy ra độ tươi và `revalidateTag` không với tới được. Nhưng cái giá là một chặng
trình duyệt tới PoP cho mọi lượt. Một mức trung gian như `max-age=60` giới hạn độ cũ ở một
phút mà làm cho các lượt lặp trong cùng phiên thành miễn phí. Đây là tham số để chỉnh, không
phải lỗi.

### Cái CDN không che được

Lượt đầu tiên của một chuỗi truy vấn tại một PoP luôn phải đi tới database. Ô tìm kiếm gửi
một request cho mỗi tiền tố người dùng dừng gõ, nên đuôi dài các tiền tố là rất lớn. Và
`lex.suggest`, truy vấn chậm nhất hệ thống, chỉ được gọi khi cả hai chiều tìm kiếm rỗng
(`lib/dictionary/search.ts:134-136`), tức đúng những truy vấn hiếm nhất, tức đúng những
truy vấn không bao giờ trúng cache. Vì vậy thiếu 3 phải sửa dù có CDN hay không.

### Phương án (0) làm các phương án di trú thừa tới mức nào

| Việc | Công sức | Chi phí | Độ trễ tiết kiệm mỗi lượt trượt cache |
| --- | --- | --- | --- |
| Thêm `vercel.json` với `"regions": ["icn1"]` | 1 file, 4 dòng | 0 đô | khoảng 380 ms |
| Đổi 17 chỗ `revalidate: 3600` thành `false` | 3 file | 0 đô | toàn bộ 140 ms, cho mọi lượt lặp trong cả tháng thay vì một giờ |
| Sửa `lex.suggest` dùng `%` | 1 migration | 0 đô | tới khoảng 1.200 ms trên đúng nhóm truy vấn chậm nhất |
| Đưa trang chi tiết vào CDN | 1 file cấu hình cộng `generateStaticParams` | 0 đô | khoảng 470 ms mỗi lượt mở mục từ |
| Chuyển sang RDS `ap-southeast-1` | 25 file, 6 bước di trú, mất PGroonga | 20,55 đô/tháng | khoảng 30 ms |
| Chuyển sang Aurora Serverless v2 | như trên | 73 đô/tháng | khoảng 30 ms, trừ đi 15 giây mỗi lần resume |
| Chuyển sang OpenSearch Serverless | viết lại toàn bộ tầng xếp hạng | 350,40 đô/tháng | chưa đo |

Bốn dòng đầu cộng lại tiết kiệm nhiều hơn ba dòng cuối hơn một bậc độ lớn, với chi phí 0 đô
và không đụng tới một dòng nào trong 25 file tầng dữ liệu.

## Bảng chi phí ba mức tải

Giả định, nêu rõ để kiểm lại được:

- Một lượt tra bằng một `lex.search` cộng một lần mở mục từ. Egress đo thật: search trung
  bình 4.537 byte, entry detail trung bình 6.514 byte. Làm tròn lên **15 KB một lượt tra**
  để bao các truy vấn phụ.
- Ba mức tải: 10, 1.000, 50.000 lượt một ngày, tức 300, 30.000, 1.500.000 lượt một tháng,
  tức **4,5 MB, 450 MB, 22,5 GB** egress một tháng.
- **Trường hợp xấu nhất: mọi lượt đều trượt cache.** Sau khi làm phương án (0), phần lớn
  các con số dưới đây giảm mạnh.
- Giá lấy ngày 2026-09-16, region `ap-southeast-1` trừ chỗ ghi khác.

| Phương án | 10 lượt/ngày | 1.000 lượt/ngày | 50.000 lượt/ngày | Ghi chú |
| --- | --- | --- | --- | --- |
| **(0) Supabase Free cộng sửa region và cache** | **0 đô** | **0 đô** | không dùng được | Sửa region và cache là 0 đô. Trần 5 GB egress và 500 MB database vẫn là hai ràng buộc |
| **(0) Supabase Pro cộng sửa region và cache** | **25 đô** | **25 đô** | **25 đô** | 8 GB disk, 250 GB egress, 100.000 MAU đều thừa ở cả ba mức |
| Aurora Serverless v2, min 0 ACU, không RDS Proxy | khoảng 10 đô | khoảng 96 đô | khoảng 292 đô | Mỗi lượt sau khoảng nghỉ chờ 15 giây. Ước theo 2 ACU lúc resume, 1 ACU trung bình ở mức giữa, 2 ACU liên tục ở mức cao. Chưa đo tải thật |
| Aurora Serverless v2, có RDS Proxy | 73 đô | 73 đô | ít nhất 292 đô | RDS Proxy tắt auto-pause. Giá RDS Proxy chưa tra được |
| RDS `db.t4g.micro` `ap-southeast-1` | 20,55 đô | 20,55 đô | 20,55 đô | 18,25 đô instance cộng 2,30 đô storage gp3 20 GB. Giá storage Singapore chưa tra. Mức 50.000 chưa load test trên 1 GiB RAM |
| RDS `db.t4g.micro` `us-east-1` | 13,98 đô | 13,98 đô | 13,98 đô | Rẻ nhất nhưng RTT 283,5 ms. Không dùng được cho người Việt Nam |
| Index tĩnh S3 sau CloudFront | dưới 1 đô | dưới 1 đô | 15 đô | Gói CloudFront Free hết ở 1 triệu request. **Mất hẳn tìm kiếm tiếng Trung** |
| OpenSearch Serverless classic | 350,40 đô | 350,40 đô | 350,40 đô | Sàn 2 OCU cho collection đầu tiên trong tài khoản |
| S3 cộng CloudFront cho 699 file audio | dưới 0,01 đô | dưới 0,01 đô | dưới 0,01 đô | Cộng vào bất kỳ dòng nào ở trên |

Ba khoản chưa nằm trong bảng, làm mọi phương án AWS đắt hơn nữa: tầng data API thay
PostgREST, từ 15 tới 30 đô một tháng nếu self-host trên Fargate; data transfer out từ AWS
ra Vercel, **đơn giá `ap-southeast-1` chưa tra được**; và backup cùng giám sát, thứ Supabase
Pro đã gồm.

Ngoài ra gói Vercel Hobby ghi nguyên văn "the Hobby plan restricts users to non-commercial,
personal use only". Thương mại hoá thì cần Vercel Pro 20 đô một người một tháng. Cộng
Supabase Pro 25 đô là **45 đô một tháng cho toàn bộ hạ tầng**.

## Rủi ro và cách giảm

| Rủi ro | Mức | Cách giảm |
| --- | --- | --- |
| **Vercel Function chạy ở `iad1` Washington trong khi database ở Seoul.** Mỗi lượt trượt cache đi vòng qua nửa vòng trái đất, ước khoảng 380 ms lãng phí | Cao, đang xảy ra | Thêm `vercel.json` với `"regions": ["icn1"]`. Gói Hobby cho một region. Sau đó đo lại bằng `curl -w` trên deployment thật để xác nhận, vì con số 520 ms hiện là suy luận, chưa đo trên production |
| **`revalidate: 3600` ở 17 chỗ buộc mọi truy vấn quay về Seoul mỗi giờ** | Trung bình, đang xảy ra | **Khuyến nghị ban đầu của mục này, đổi sang `revalidate: false`, đã bị bác ngày 2026-09-16.** Nó dựa trên giả định pipeline gọi `POST /api/revalidate`; `grep -rni revalidate` trong `zhesen-pipeline`, bỏ `.venv`, ra 0 dòng. Không ai gọi hàm đó, nên cửa sổ một giờ là bảo đảm tươi duy nhất và tắt nó sẽ đóng băng cache vĩnh viễn. Muốn bỏ cửa sổ thì phải thêm lời gọi vào pipeline TRƯỚC |
| **`lex.suggest` quét toàn bộ 219.887 dòng vì `similarity() > 0.15` không dùng được GIN trigram.** Đo thật 833 tới 1.420 ms | Cao, đang xảy ra | Viết lại dùng toán tử `%` trong `where`. Chạy `explain (analyze, buffers)` trước để xác nhận hai `Seq Scan`. Cùng cách kiểm cho `lex.inflections where form_text = any(...)`, 1.691 ms |
| **Trang chi tiết mục từ không nằm trong CDN**, mỗi lượt mở chạy function ở `iad1` và tốn trung bình 471 ms truy vấn | Cao, đang xảy ra | `generateStaticParams` cho các mục từ thông dụng, hoặc bật `cacheComponents` trong `next.config.ts` và dùng `"use cache"` |
| **Vỡ trần 500 MB gói Free sau lần nạp tới.** Hiện 383,2 MB, dư 116,8 MB, mà growth plan có sáu nguồn chờ nạp | Cao | Nâng Pro trước khi nạp, không phải sau khi vỡ. Lối thứ hai: đổi PGroonga sang `pg_bigm` để lấy lại phần lớn 101,6 MB, nhưng **chưa xác minh** Supabase cho cài `pg_bigm` |
| **Project bị pause sau 7 ngày không hoạt động** trên gói Free | Cao trên Free, bằng 0 trên Pro | Trước mắt một lượt ping định kỳ từ GitHub Actions. Lâu dài gói Pro không pause |
| **Mất tìm kiếm chuỗi con tiếng Trung khi rời Supabase.** PGroonga không có trên RDS lẫn Aurora, và đã đo thật rằng nó đang phục vụ | Cao nếu chuyển, bằng 0 nếu ở lại | Nếu buộc chuyển: `pg_bigm`, và bắt buộc đối chiếu sáu truy vấn `学`, `习`, `学习`, `狗`, `大学`, `中国` trước khi cắt. `习` phải trả về `学习` |
| **Aurora auto-pause và Vercel serverless loại trừ nhau.** RDS Proxy cần cho connection pooling lại tắt auto-pause | Cao nếu chọn Aurora | Không chọn Aurora cho workload này. Nếu vẫn chọn: chấp nhận sàn 73 đô và bỏ hẳn ý định scale to zero |
| **Di trú Supabase sang region Singapore đòi tạo project mới và di trú cả `auth.users`.** Mọi hàng `user_words` treo dưới `user_id` | Cao nếu làm, và lợi ích chỉ 52 ms | Không làm cho tới khi đã làm xong mục 7 và 8 và đo lại. Nếu vẫn cần: dump `auth.users` trước, thử trên project nháp, giữ project cũ ít nhất một tháng |
| **Rate limit 429 từ Wikimedia làm nút phát âm im lặng.** Đo thật 5 trên 15 request bị 429 | Trung bình, đang xảy ra | Copy 699 file, 10,7 MB, sang S3 sau CloudFront. Dưới 0,01 đô một tháng. Sửa `media-src` trong `next.config.ts` |
| **Chưa ghi công tác giả cho audio CC BY-SA.** Mẫu 50 file: 48 CC BY-SA 4.0, 2 CC BY-SA 3.0 | Trung bình, đang vi phạm | Pipeline lấy `Artist` và `LicenseShortName` từ Commons API, thêm hai cột vào `lex.pronunciations`, component phát âm hiện dòng ghi công. Làm trước khi copy file |
| **`db.t4g.micro` 1 GiB RAM có thể không chịu nổi mức 50.000 lượt/ngày** | Chưa xác minh | Nếu đi đường RDS: load test bằng bộ truy vấn ở bước 3 mục 4, chạy đồng thời |
| **AWS credit hết khoảng giữa năm 2027** | Thấp trong 12 tháng tới | Chỉ dùng AWS cho S3 và CloudFront, nơi chi phí gần 0 kể cả khi hết credit |

## Nguồn

Mọi URL tra ngày 2026-09-16.

Extension và engine:
- [Danh sách extension RDS PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-extensions.html)
- [Danh sách extension Aurora PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraPostgreSQLReleaseNotes/AuroraPostgreSQL.Extensions.html)
- [pg_bigm, repo và doc](https://github.com/pgbigm/pg_bigm), file `docs/pg_bigm_en.md`
- [SQLite FTS5](https://www.sqlite.org/fts5.html)

Region và độ trễ:
- [Vercel global network and regions](https://vercel.com/docs/regions)
- [Vercel configuring regions for Functions](https://vercel.com/docs/functions/configuring-functions/region)

Giá:
- AWS Price List API, `aws pricing get-products`, service code `AmazonRDS` và `AmazonS3`,
  ngày hiệu lực trong kết quả là 2026-09-01 và 2026-09-11
- [Supabase pricing](https://supabase.com/pricing)
- [OpenSearch Service pricing](https://aws.amazon.com/opensearch-service/pricing/)
- [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/)
- [Cognito pricing](https://aws.amazon.com/cognito/pricing/)
- [RDS Proxy pricing](https://aws.amazon.com/rds/proxy/pricing/), mô hình tính tiền có, đơn
  giá chưa tra được

Hành vi:
- [Aurora Serverless v2 auto pause](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html)
- [Aurora Serverless v2 administration](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-administration.html)
- [Cognito identity pools](https://docs.aws.amazon.com/cognito/latest/developerguide/identity-pools.html)
- [Supabase free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)

Số đo thật trong phiên này: RTT tới năm region AWS; payload và round trip của `lex.search`,
`lex.search_vi`, `lex.suggest` qua PostgREST; payload truy vấn entry detail; sáu truy vấn
tiếng Trung chứng minh PGroonga đang phục vụ; đếm dòng `lex.entries`, `lex.pronunciations`
và số dòng có `audio_url`; kích thước 10 file audio Wikimedia; giấy phép 50 file audio qua
Commons API.

Chưa xác minh, đã đánh dấu tại chỗ: đơn giá RDS Proxy; giá storage và OCU-hour ở
`ap-southeast-1`; data transfer out từ AWS; chặng mạng `iad1` tới `icn1` và `sin1` tới
`icn1`; Supabase có cho cài `pg_bigm` hay không; đường đi thật của một request trên
deployment production; RDS free tier của tài khoản còn hay hết.
