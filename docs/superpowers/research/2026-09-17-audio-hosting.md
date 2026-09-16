# Đưa file phát âm khỏi Wikimedia, 2026-09-17

Báo cáo trả lời bốn câu hỏi về 699 file audio phát âm mà zhesen đang hotlink thẳng vào
`upload.wikimedia.org`: khả thi, độ trễ, chi phí, và nên làm gì. Đây là nghiên cứu, không
phải bản triển khai. Không file mã nào trong repo bị sửa và không tài nguyên AWS nào được
tạo trong phiên này.

Mọi kích thước file lấy từ Commons API `prop=imageinfo`, không ước lượng. Mọi số đo độ trễ
đo thật từ máy này, đặt tại Việt Nam, ngày 2026-09-17. Mọi đơn giá lấy từ AWS Price List API
hoặc trang giá chính thức, kèm ngày hiệu lực.

## Khuyến nghị

**Chuyển sang S3 ở `ap-northeast-2` đặt sau CloudFront, nhưng chỉ đi kèm phần ghi công tác
giả, không đi trước. Nếu phần ghi công không được làm thì đừng chuyển: giữ nguyên Wikimedia.**

Ba lý do:

1. **Chi phí không quyết định được gì.** Toàn bộ kho là 10.543.887 byte, tức 10,06 MiB. Cả
   bốn phương án đều rơi vào khoảng từ 0 tới 0,12 đô một tháng ngay cả ở kịch bản tăng
   trưởng 300.000 lượt phát một tháng. Ai chọn phương án nào vì tiền cũng là chọn sai lý do.
2. **Độ trễ có chênh thật và đo được.** CloudFront phục vụ máy này từ PoP Hà Nội `HAN50`,
   đo trên một file 15.086 byte cho time to first byte trung vị 32,3 ms. Wikimedia cho 167
   ms khi file còn nóng ở edge Singapore và 411 ms khi đã nguội. Nút phát âm là nút bấm rồi
   chờ, nên 380 ms là khoảng người dùng cảm nhận được.
3. **Tự host biến zhesen từ bên nhúng thành bên phân phối lại.** Trong 699 file, **647 file
   có `AttributionRequired = true`** theo Commons API. App hiện không hiện dòng ghi công nào.
   Nghĩa vụ này đã tồn tại sẵn dù hotlink hay tự host, nhưng copy file về hạ tầng của mình
   làm nó rõ ràng hơn hẳn. Chuyển host mà bỏ phần ghi công là đánh đổi một khoản rủi ro
   giấy phép lấy 380 ms.

Điều kiện làm khuyến nghị này đổi, nêu ở mục [Khi nào đổi ý](#khi-nào-đổi-ý).

## Bảng so sánh bốn phương án

| Phương án | TTFB đo hoặc ước tính, từ Việt Nam | Chi phí ở 699 file, 1.000 lượt phát một tháng | Chi phí ở kịch bản tăng trưởng | Việc phải làm trong repo |
| --- | --- | --- | --- | --- |
| **(a) Giữ trên Wikimedia** | 167 ms nóng, **411 ms nguội** | 0 đô | 0 đô | không |
| (b) S3 `ap-northeast-2` trực tiếp | **277 ms** (đo TTFB tới `s3.ap-northeast-2.amazonaws.com`) | 0,0003 đô | 0,112 đô | copy, đổi CSP, đổi URL trong database, cấu hình CORS |
| **(c) S3 `ap-northeast-2` sau CloudFront** | **32,3 ms** khi trúng cache, khoảng 150 ms khi trượt (suy luận) | 0 đô | 0,007 đô | như (b), thêm một distribution |
| (d) Supabase Storage | chưa đo được, xem mục 2 | 0 đô trong gói Free | 0 đô nếu đã mua Pro | copy, đổi CSP, đổi URL trong database |

Kịch bản tăng trưởng định nghĩa ở mục 3: 10.000 người dùng hoạt động một tháng, mỗi người
30 lượt phát, kho lớn lên 20.000 file.

## 1. Khả thi

### Kích thước thật

Lấy toàn bộ 699 URL từ `lex.pronunciations` qua PostgREST rồi hỏi Commons API
`action=query&prop=imageinfo&iiprop=size|mime` cho đúng 699 tên file. Commons trả về đủ 699,
không file nào mất:

| Chỉ số | Giá trị |
| --- | --- |
| Số file | 699, tất cả khác nhau |
| Tổng dung lượng | **10.543.887 byte, tức 10,06 MiB** |
| Trung bình | 15.084,2 byte |
| Trung vị | 14.349 byte |
| Nhỏ nhất | 7.879 byte |
| Lớn nhất | 71.311 byte |
| MIME | `application/ogg` cho cả 699 file |

Đây là số đếm, không phải ngoại suy từ mẫu. Báo cáo trước ước 10,7 MB từ mẫu 10 file; con
số thật là 10,06 MiB.

Kiểm chéo bằng `Content-Length` trên 25 file tải thật: trung bình 13.797 byte, khớp với
Commons trong sai số của cỡ mẫu.

### Mức phủ của tính năng

| Chỉ số | Giá trị |
| --- | --- |
| Dòng `lex.pronunciations` | 101.662 |
| Dòng có `audio_url` | 699 |
| Entry khác nhau có audio | 505 trên tổng 36.361 entry, tức 1,4% |
| Ngôn ngữ | 696 dòng tiếng Anh, 3 dòng tiếng Tây Ban Nha, 0 tiếng Trung |
| Dòng qua được `audioMatchesHeadword` | **631 trên 699**, phủ 492 entry |

Tôi chạy lại phép kiểm khớp headword bằng một bản dựng lại thuật toán của
`audioMatchesHeadword` (`lib/dictionary/pronunciation.ts:46`) trên dữ liệu thật và ra đúng
631 trên 699, khớp con số ghi trong `AGENTS.md`. Nghĩa là chỉ 631 file từng được phát; 68
file còn lại đang nằm trong database nhưng không đường nào tới được giao diện.

### Một phát hiện phụ về dữ liệu

**696 trên 699 URL mang chuỗi truy vấn theo dõi**, dạng
`?utm_source=en.wiktionary.org&utm_campaign=index&utm_content=original` cho 677 dòng và
`utm_campaign=api` cho 19 dòng. Chỉ 3 URL sạch. Chuỗi này không có tác dụng gì với zhesen,
làm khoá cache khác nhau cho cùng một file, và là lý do tồn tại của cái guard trong
`lib/http/percentDecode.ts`. Copy file về là dịp bỏ nó.

### Những chỗ trong mã phải sửa nếu chuyển

| Chỗ | Vai trò | Có phải sửa không |
| --- | --- | --- |
| `next.config.ts:49` | `media-src 'self' https://upload.wikimedia.org` trong CSP | **có**, đổi sang domain CloudFront |
| `lex.pronunciations.audio_url` (`supabase/migrations/0003_lex_schema.sql:103`) | nơi chứa URL | **có**, một lệnh `update` ghi lại 699 giá trị |
| `user_words.audio_url` (`supabase/migrations/0006_user_words.sql:19`) | bản sao URL chụp tại thời điểm người dùng lưu từ | **có**, và đây là chỗ dễ quên nhất |
| `lib/dictionary/rows.ts:173,186,197` | parser đổi `audio_url` thành `audioUrl` | không, nếu giữ nguyên tên file |
| `lib/dictionary/pronunciation.ts:22,46` | `audioAccent` và `audioMatchesHeadword` đọc **tên file** | không, nếu giữ nguyên tên file |
| `components/ui/AudioButton.tsx:102-103` | `new Audio(url)` với `crossOrigin = 'anonymous'` | không, nhưng bucket phải trả `Access-Control-Allow-Origin` |
| `lib/wordlist/csv.ts:14,38,217` | cột `audioUrl` trong file export và import | không, nhưng file export cũ của người dùng vẫn chứa URL Wikimedia |
| Bảy component gọi `<AudioButton>` với `audioUrl` | hiển thị | không |

Hai điểm đáng lưu ý.

**Tên file phải giữ nguyên.** `audioAccent` (`lib/dictionary/pronunciation.ts:22`) và
`audioMatchesHeadword` (dòng 46) đều đọc tên file để quyết định recording thuộc giọng nào và
có đúng từ đó không. Đổi tên file khi copy là làm hỏng cả hai, mà `tsc` không bắt được.

**`crossOrigin = 'anonymous'` bắt buộc có CORS.** Wikimedia trả
`access-control-allow-origin: *`, đo được trong header của `En-uk-dog.ogg`. Bucket S3 mới
phải được cấu hình CORS tương đương, nếu không mọi file im lặng và rơi về speech synthesis.

**`user_words.audio_url` là bản sao đông cứng.** `lib/wordlist/store.ts:79` ghi `audio_url`
vào `user_words` tại thời điểm người dùng thêm từ. Những hàng đã có vẫn trỏ Wikimedia sau
khi chuyển. Hoặc chạy một `update` ghi lại chúng, hoặc để cả hai host trong CSP một thời
gian. Chưa đo được có bao nhiêu hàng như vậy, vì `user_words` nằm sau RLS và khoá anon
không đọc được của người khác.

### Giấy phép và nghĩa vụ ghi công

Hỏi Commons API `iiprop=extmetadata` cho cả 699 file, không mẫu:

| Giấy phép | Số file |
| --- | --- |
| CC BY-SA 3.0 | 458 |
| CC BY 3.0 us | 122 |
| CC BY-SA 4.0 | 65 |
| Public domain | 39 |
| CC0 | 13 |
| CC BY 4.0 | 1 |
| CC BY-SA 2.5 | 1 |

Trường `AttributionRequired`: **647 file `true`, 52 file `false`**. 52 file không đòi ghi
công đúng bằng 39 public domain cộng 13 CC0.

Không giấy phép nào trong danh sách cấm dùng thương mại, nên tự host không vướng về nguyên
tắc. Nghĩa vụ là ghi công. Theo
[Commons:Credit line](https://commons.wikimedia.org/wiki/Commons:Credit_line), một dòng ghi
công cho file CC BY hoặc CC BY-SA phải có: tên tác giả, tên tác phẩm nếu tác giả đặt, tên
giấy phép kèm liên kết tới nguyên văn giấy phép, liên kết tới trang file gốc trên Commons,
và nêu rõ nếu có sửa đổi. Dạng tối thiểu trang này đưa ra là `John Doe / CC-BY-SA-3.0`.

Về hotlink, [Commons:Reusing content outside
Wikimedia](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia) ghi:
"Directly using a Commons file via embedding its URL ('hotlinking') is also possible, but is
not recommended." Đây là khuyến nghị, không phải cấm, và không miễn nghĩa vụ ghi công.

Một điểm phải cân nhắc nếu có ý transcode: 458 file là CC BY-SA 3.0 và 65 file là CC BY-SA
4.0. Copy nguyên file `.ogg` là phân phối lại, không phải tác phẩm phái sinh. Chuyển mã sang
`.mp3` hay `.m4a` thì là phái sinh, và điều khoản ShareAlike buộc bản chuyển mã cũng phải
mang giấy phép đó. Không phải trở ngại, nhưng phải biết trước.

**Việc cần làm không phải "copy file sang S3".** Việc cần làm là: pipeline gọi Commons API
lấy `Artist` và `LicenseShortName` cho từng file, ghi vào hai cột mới trên
`lex.pronunciations`, `components/lookup/Pronunciation.tsx` hiện dòng ghi công, rồi mới copy.
Phần copy là phần rẻ nhất trong ba phần.

## 2. Độ trễ

### Đo trên Wikimedia

Mẫu 25 file, lấy cách đều trong danh sách 699 file, User-Agent mô tả rõ theo yêu cầu của
Wikimedia. Không request nào bị HTTP 429 trong toàn bộ phiên này.

| Lượt đo | TTFB nhỏ nhất | TTFB trung vị | TTFB trung bình | TTFB lớn nhất |
| --- | --- | --- | --- | --- |
| Lượt 1, file còn **nguội** ở edge | 174 ms | **411 ms** | 458 ms | **882 ms** |
| Lượt 2, file đã **nóng** ở edge, bắt tay TLS mới mỗi file | 131 ms | **167 ms** | 170 ms | 235 ms |
| Lượt 3, một tiến trình curl chạy cả 25 file | 118 ms | 148 ms | 147 ms | 178 ms |

Lượt 1 là số quan trọng. Header `age` ở lượt 1 bằng 0 trên 20 trên 25 file, nghĩa là edge
Wikimedia đã đẩy chúng ra khỏi cache. File duy nhất có `age = 11164` trả về TTFB 174 ms,
thấp nhất trong lượt. Đây là hành vi đúng như trông đợi với một kho 699 file phát âm hiếm
khi ai bấm: gần như lượt bấm nào cũng là cache miss, và người dùng chờ khoảng 400 ms.

Header của `En-uk-dog.ogg` cho thấy thêm ba thứ:

- **Không có `cache-control` nào cả.** Trình duyệt phải tự suy độ tươi theo heuristic dựa
  trên `last-modified`. Không kiểm soát được từ phía zhesen.
- `x-cache: cp5030 miss, cp5030 hit/1`. `cp5xxx` là cụm máy `eqsin` Singapore của Wikimedia,
  tức traffic Việt Nam đi Singapore rồi từ đó về origin nếu miss.
- `x-ratelimit-limit: 600000, 600000;w=60`, tức 600.000 request mỗi 60 giây. Trần này rộng.
  Báo cáo trước ghi 5 trên 15 HEAD request bị 429; phiên này 0 trên 25 GET và 0 trên 25 HEAD
  bị 429 khi gửi kèm User-Agent mô tả. **Chưa xác minh** nguyên nhân khác nhau.

### Đo trên CloudFront

CloudFront phục vụ máy này từ PoP **`HAN50`, đặt tại Hà Nội**, đọc từ header
`X-Amz-Cf-Pop`. Đo trên `https://docs.aws.amazon.com/assets/images/favicon.ico`, một file
15.086 byte, gần đúng bằng kích thước trung bình 15.084 byte của kho audio, với
`X-Cache: Hit from cloudfront`:

| Lượt | TTFB |
| --- | --- |
| 1, kết nối nguội | 77,8 ms |
| 2 tới 7 | 30,9 ms, 32,2 ms, 30,9 ms, 32,4 ms, 33,7 ms, 34,4 ms |

Trung vị sáu lượt nóng: **32,3 ms**. TCP 9 tới 11 ms, TLS thêm 12 tới 14 ms.

### Đo trên S3 Seoul trực tiếp, không CloudFront

Bảy lượt tới `https://s3.ap-northeast-2.amazonaws.com/`:

| Chặng | Khoảng đo |
| --- | --- |
| TCP connect | 85,7 tới 113,2 ms |
| TLS hoàn tất | 182,8 tới 253,4 ms |
| TTFB | 266,1 tới 338,4 ms, trung vị **277,0 ms** |

Đây là lý do phương án (b) thua: Việt Nam tới Seoul là khoảng 90 ms mỗi chặng, và một
request HTTPS nguội tốn ba chặng.

### Supabase Storage

Project chưa có bucket nào nên **không đo được một object đã cache**. Đo endpoint
`storage/v1/object/public/...` trả HTTP 400 với `CF-Cache-Status: BYPASS`: TCP 26 tới 45 ms,
TLS 59 tới 91 ms, TTFB 217 tới 650 ms. Header `CF-Ray` kết thúc bằng `HKG`, tức edge
Cloudflare phục vụ là Hồng Kông, không phải Việt Nam. Suy luận từ chặng TLS 75 ms: một
object trúng cache ở edge Hồng Kông sẽ vào khoảng 100 ms, giữa CloudFront và Wikimedia.
**Chưa xác minh**, vì đo một phản hồi lỗi không thay được đo một file thật.

### Người dùng có nhận ra không

| So sánh | Chênh |
| --- | --- |
| CloudFront trúng cache so với Wikimedia nóng | nhanh hơn **135 ms** |
| CloudFront trúng cache so với Wikimedia nguội | nhanh hơn **379 ms** |
| CloudFront trượt cache (ước tính 150 ms) so với Wikimedia nguội | nhanh hơn khoảng 260 ms |

Với một file 15 KB, thời gian truyền là không đáng kể: tổng thời gian gần bằng TTFB trong cả
ba lượt đo. Toàn bộ chênh lệch nằm ở độ trễ đường mạng, không ở băng thông.

Nút phát âm là thao tác bấm rồi chờ nghe. Mốc 100 ms là ngưỡng người dùng còn thấy phản hồi
tức thì. 167 ms đã qua ngưỡng, 411 ms thì thấy rõ là có độ trễ. Vậy câu trả lời là **có,
nhận ra được**, nhưng phải đặt cạnh việc tính năng này chỉ chạm tới 492 trên 36.361 entry.

CloudFront trượt cache là số duy nhất tôi không đo được, vì đo nó phải tạo distribution
thật. Ước tính 150 ms lấy từ 32 ms ở PoP cộng một vòng Hà Nội tới Seoul đo được là khoảng
90 ms, cộng phần xử lý. **Suy luận, chưa xác minh.**

## 3. Chi phí

Đơn giá, ngày tra 2026-09-17:

| Hạng mục | Đơn giá | Nguồn, ngày hiệu lực |
| --- | --- | --- |
| S3 Standard `ap-northeast-2`, 50 TB đầu | 0,025 đô mỗi GB-tháng | Price List API `AmazonS3`, 2026-08-01 |
| S3 request Tier 1, tức PUT COPY POST LIST | 0,0000045 đô mỗi request | Price List API `AmazonS3` |
| S3 request Tier 2, tức GET | 0,00000035 đô mỗi request | Price List API `AmazonS3` |
| Data transfer out từ Seoul ra internet, 10 TB đầu | 0,126 đô mỗi GB | Price List API `AWSDataTransfer`, 2026-06-01 |
| CloudFront data transfer out, Asia Pacific gồm Việt Nam, 10 TB đầu | 0,120 đô mỗi GB | [CloudFront pay-as-you-go](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/) |
| CloudFront HTTPS request, Asia Pacific | 0,012 đô mỗi 10.000 request | cùng nguồn |
| CloudFront origin fetch từ S3 | 0 đô | cùng nguồn: "Free for origin fetches from any AWS origin" |
| CloudFront free tier, vĩnh viễn | 1 TB data transfer out và 10.000.000 request mỗi tháng | cùng nguồn |
| AWS free tier data transfer out toàn cầu | 100 GB mỗi tháng | Price List API ghi "beyond the global free tier" |
| Supabase Free: storage, egress, cached egress | 1 GB, 5 GB, 5 GB | [Supabase pricing](https://supabase.com/pricing) |
| Supabase Pro: giá gói, storage, egress, cached egress | 25 đô, 100 GB rồi 0,0213 đô mỗi GB, 250 GB rồi 0,09 đô mỗi GB, 250 GB rồi 0,03 đô mỗi GB | cùng nguồn |

### Kịch bản hiện tại: 699 file, 1.000 lượt phát một tháng

Kho 10,06 MiB, tức 0,00982 GiB. Egress 1.000 nhân 15.084 byte bằng 0,014 GiB.

| Phương án | Storage | Request | Egress | **Tổng mỗi tháng** |
| --- | --- | --- | --- | --- |
| (a) Wikimedia | 0 | 0 | 0 | **0 đô** |
| (b) S3 trực tiếp | 0,000245 đô | 0,00035 đô | trong 100 GB free tier | **0,0006 đô** |
| (c) S3 sau CloudFront | 0,000245 đô | trong 10M free tier | trong 1 TB free tier | **0,0002 đô** |
| (d) Supabase Storage | trong 1 GB của gói Free | 0 | trong 5 GB của gói Free | **0 đô** |

Chi phí nạp một lần cho (b) và (c): 699 request PUT nhân 0,0000045 đô bằng **0,0031 đô**.

### Kịch bản tăng trưởng, nêu rõ giả định

Giả định: **10.000 người dùng hoạt động một tháng, mỗi người 30 lượt phát audio, và kho lớn
lên 20.000 file** khi pipeline lấy được recording cho phần lớn 21.004 entry tiếng Anh. Tức
300.000 lượt phát một tháng, kho 20.000 nhân 15.084 byte bằng 287,7 MiB, egress 4,21 GiB.

| Phương án | Storage | Request | Egress | **Tổng mỗi tháng** |
| --- | --- | --- | --- | --- |
| (a) Wikimedia | 0 | 0 | 0 | **0 đô** |
| (b) S3 trực tiếp | 0,0070 đô | 0,1050 đô | 0,531 đô nhưng trong 100 GB free tier | **0,112 đô** |
| (c) S3 sau CloudFront | 0,0070 đô | 0,36 đô nhưng trong 10M free tier | 0,506 đô nhưng trong 1 TB free tier | **0,007 đô** |
| (d) Supabase Storage, gói Free | 287,7 MiB trong 1 GB | 0 | 4,21 GiB trong 5 GB, **dùng chung với mọi traffic khác của app** | **0 đô, nhưng chật** |
| (d) Supabase Storage, gói Pro | trong 100 GB | 0 | trong 250 GB | **0 đô thêm**, gói đã 25 đô |

Điểm duy nhất đáng chú ý trong bảng: phương án (d) trên gói Free tiêu 4,21 trên 5 GB egress,
để lại 0,79 GB cho toàn bộ phản hồi PostgREST của từ điển. Đó là ràng buộc thật, không phải
ràng buộc giá.

Ngoài ra tài khoản AWS này còn credit tới khoảng giữa năm 2027, nên ba phương án AWS đều về
0 đô thật trong suốt giai đoạn đang bàn.

**Kết luận về chi phí: không phương án nào đắt, chênh lệch lớn nhất giữa hai phương án tốn
tiền nhất và rẻ nhất là 0,11 đô một tháng. Chi phí không được dùng để chọn.**

## 4. Khuyến nghị

**Chọn (c): S3 ở `ap-northeast-2` đặt sau CloudFront. Nhưng xếp nó sau phần ghi công, không
trước.**

Lập luận theo thứ tự:

1. Chi phí loại khỏi bàn cân, vì cả bốn đều gần 0.
2. Trong ba phương án còn lại, (b) chậm hơn cả (a): 277 ms so với 167 ms khi Wikimedia nóng.
   S3 trực tiếp không có edge ở Việt Nam. Loại (b).
3. (d) Supabase Storage đơn giản nhất về vận hành, cùng một nhà cung cấp, cùng một khoá.
   Nhưng edge phục vụ Việt Nam là Hồng Kông chứ không phải Hà Nội, và trên gói Free nó ăn
   vào chính hạn mức egress mà từ điển đang dùng. Chưa đo được số thật vì project chưa có
   bucket. Loại (d) vì không đo được và vì nó tranh hạn mức với đường đọc chính.
4. (c) nhanh hơn (a) 135 ms khi Wikimedia nóng và 379 ms khi nguội, mà trạng thái nguội mới
   là trạng thái thường gặp với 699 file ít ai bấm: `age = 0` trên 20 trên 25 file ở lượt đo
   đầu. Thêm nữa, (c) trả lại quyền đặt `Cache-Control`, quyền đặt `Content-Type` đúng là
   `audio/ogg` thay vì `application/ogg`, và gỡ được sự phụ thuộc vào một URL bên thứ ba có
   thể bị đổi tên hoặc xoá trên Commons.
5. Nhưng **(c) chỉ đúng khi đi kèm dòng ghi công**. 647 trên 699 file đòi ghi công và app
   hiện không hiện dòng nào. Nghĩa vụ đó đã nợ sẵn từ trước, nhưng hotlink còn để Wikimedia
   là bên phục vụ file; tự host thì zhesen là bên phân phối lại, rõ ràng và không chối được.
   Đổi một khoản rủi ro giấy phép lấy 380 ms là đổi lỗ.

Thứ tự đề nghị, ba bước, bước một là bước đắt nhất:

1. Pipeline gọi Commons API lấy `Artist` và `LicenseShortName` cho 699 file, ghi vào hai cột
   mới trên `lex.pronunciations`; `components/lookup/Pronunciation.tsx` hiện dòng ghi công
   kèm liên kết tới trang file trên Commons và tới nguyên văn giấy phép. Bước này phải làm
   dù có chuyển host hay không.
2. Copy 699 file sang bucket `ap-northeast-2`, **giữ nguyên tên file**, bỏ chuỗi `utm_*`,
   đặt `Content-Type: audio/ogg`, bật CORS cho domain của app, dựng CloudFront distribution
   trước bucket.
3. Một migration ghi lại `lex.pronunciations.audio_url` và `user_words.audio_url`, rồi đổi
   `media-src` ở `next.config.ts:49`. Giữ cả hai host trong CSP một nhịp deploy để file
   export CSV cũ của người dùng không chết.

### Khi nào đổi ý

- **Nếu bước 1 không được làm**: giữ nguyên Wikimedia, không làm gì cả. Trong trường hợp đó
  câu trả lời trung thực là chuyển host không mua được gì tương xứng.
- **Nếu kho audio vẫn dừng ở mức 492 trên 36.361 entry và không có kế hoạch mở rộng**: để
  nguyên cũng là lựa chọn bảo vệ được. 379 ms trên 1,4% số entry là một khoản nhỏ.
- **Nếu người dùng thật bắt đầu gặp HTTP 429 từ Wikimedia**: chuyển ngay, bỏ điều kiện bước
  1 làm trước, vì lúc đó nút phát âm đang hỏng chứ không phải chậm. Phiên này không tái hiện
  được 429, nên chưa có bằng chứng đó.
- **Nếu dự án bắt đầu tự sinh audio**, ví dụ cache kết quả TTS phía máy chủ: lúc đó cần một
  object store dù sao đi nữa, và (c) là chỗ đúng. Phần copy 699 file Wikimedia đi kèm gần
  như miễn phí.
- **Nếu Supabase project chuyển sang gói Pro vì lý do khác**: (d) mạnh lên đáng kể, vì hạn
  mức egress 250 GB xoá ràng buộc duy nhất của nó. Khi đó phải đo lại một object thật trên
  Supabase Storage trước khi so với (c); số trong báo cáo này không đủ để kết luận.

## Nguồn

Giấy phép và điều khoản tái sử dụng:
- [Commons:Reusing content outside Wikimedia](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)
- [Commons:Credit line](https://commons.wikimedia.org/wiki/Commons:Credit_line)
- Commons API `action=query&prop=imageinfo&iiprop=extmetadata|size|mime`, chạy trên đủ 699
  tên file, ngày 2026-09-17

Giá:
- AWS Price List API, `aws pricing get-products`, service code `AmazonS3`, `AWSDataTransfer`,
  `AmazonCloudFront`; ngày hiệu lực trong kết quả là 2026-08-01, 2026-06-01 và 2025-04-01
- [CloudFront pay-as-you-go pricing](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/)
- [Supabase pricing](https://supabase.com/pricing)

Số đo thật trong phiên này, từ máy đặt tại Việt Nam, ngày 2026-09-17: 699 URL lấy từ
`lex.pronunciations` qua PostgREST; kích thước và giấy phép đủ 699 file qua Commons API;
TTFB và tổng thời gian trên mẫu 25 file Wikimedia ở ba trạng thái cache; header đầy đủ của
`En-uk-dog.ogg`; PoP CloudFront phục vụ máy này và bảy lượt đo một file 15.086 byte; bảy
lượt bắt tay tới `s3.ap-northeast-2.amazonaws.com`; năm lượt tới endpoint Supabase Storage;
đếm entry, pronunciation và tỉ lệ khớp headword.

Chưa xác minh, đã đánh dấu tại chỗ: TTFB của CloudFront khi trượt cache; TTFB của một object
đã cache trên Supabase Storage; số hàng `user_words` đang giữ URL Wikimedia; nguyên nhân
khác biệt giữa 5 trên 15 lần bị 429 trong báo cáo trước và 0 trên 50 lần trong phiên này.
