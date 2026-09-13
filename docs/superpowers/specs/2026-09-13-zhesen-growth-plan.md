# Kế hoạch phát triển zhesen, 2026-09-13

Tệp này trả lời bốn câu hỏi được đặt ra ngày 13/09/2026: deploy thử miễn phí ở đâu,
crawl thêm dữ liệu gì, tích hợp AI thế nào, và học được gì từ các nền tảng tra cứu
cùng loại. Nó cũng ghi lại tình trạng dữ liệu đo được trong cùng ngày, vì mọi quyết
định dưới đây đều dựa vào các con số đó.

Mỗi khẳng định về giấy phép hoặc hạn mức đều kèm nguồn. Chỗ nào chưa tra được thì ghi
rõ, không lấp bằng phỏng đoán.

## 1. Tình trạng dữ liệu, đo ngày 13/09/2026

Đếm trực tiếp qua PostgREST với `Prefer: count=exact`, khoá anon.

| Bảng | Tổng | en | zh | es |
| --- | --- | --- | --- | --- |
| `lex.entries` | 36.361 | 21.004 | 4.045 | 11.312 |
| `lex.senses` | 183.526 | 146.071 | 10.477 | 26.978 |
| `lex.examples` | 144.997 | 137.069 | 7.928 | 0 |
| `lex.inflections` | 352.332 | 45.940 | 0 | 306.392 |
| `lex.pronunciations` | 101.662 | 69.830 | 4.042 | 27.790 |
| `lex.lex_relations` | 101.888 | 88.063 | 0 | 13.825 |

Bảng nhỏ còn lại: `characters` 1.841, `grammar_points` 114, `grammar_examples` 228,
`grammar_point_entries` 399, `public.languages` 3.

Sáu lỗ hổng, xếp theo mức nghiêm trọng:

1. **77,9% câu ví dụ nguồn Cambridge bị dính chữ.** Đo trên mẫu 20.000 câu tiếng Anh,
   đối chiếu với toàn bộ 21.004 mục từ và 41.939 dạng biến đổi. Tatoeba sạch hơn hẳn,
   chỉ 6,4% bị nghi (và phần lớn trong số đó là dương tính giả, do từ điển thiếu từ như
   "breadfruit" hay "oceanographer"). Tính chung cả hai nguồn là 45,3%. Con số "6% số
   trang" trong báo cáo cũ là đếm theo trang, không phải theo câu, nên nhẹ hơn thực tế
   rất nhiều.
2. **58,1% câu ví dụ không có bản dịch tiếng Việt** (84.303 trên 144.997), và 30,4% câu
   nguồn Cambridge có trường dịch chứa nghĩa của mục từ chứ không phải bản dịch câu.
3. **Nghĩa tiếng Việt của tiếng Trung và Tây Ban Nha gần như toàn bộ là máy dịch.**
   zh 10.466/10.477 (99,9%), es 26.455/26.978 (98,1%), en 64.665/146.071 (44,3%). Cột
   `gloss_vi_is_mt` có trong cơ sở dữ liệu nhưng chưa một dòng mã nào đọc tới.
4. **35,7% nghĩa không có tiếng Việt gì cả** (65.554 dòng `gloss_vi` rỗng).
5. **32,6% mục từ không có trình độ CEFR** (11.866 dòng). Riêng tiếng Anh thiếu 48,0%.
   Không có mục từ nào ở mức C1 hay C2 trong mẫu 3.000 dòng.
6. **Tiếng Tây Ban Nha không có câu ví dụ nào; tiếng Trung không có quan hệ từ vựng nào.**

Ba lỗi đầu đã sửa ở gốc trong repo `zhesen-pipeline` ngày 13/09/2026, chưa nạp lại.
Phía web app có hai lớp chắn tạm ở `lib/dictionary/textQuality.ts`, sẽ tự vô hiệu khi
dữ liệu sạch về.

### Rác trong cơ sở dữ liệu

Chỉ có một bảng rác thật: `lex.cross_language_links`, 13.124 dòng không đường nào với
tới, đã có migration `0030` chờ chạy.

Ba bảng rỗng **không** phải rác: `lex.entry_characters`, `lex.images`, `lex.sources`
đều 0 dòng nhưng pipeline có ghi vào cả ba (`pipeline/load/supabase_load.py`). Chúng
rỗng vì lần nạp hiện tại bỏ qua. Xoá là làm vỡ pipeline để lấy lại 0 byte.

`public.languages` giữ nguyên: ba dòng, là đích khoá ngoại của `lex.entries.lang`,
`lex.characters.lang` và `lex.grammar_points.lang`.

**Dung lượng database chưa đo được.** PostgREST từ chối truy vấn quản trị với khoá anon
(`HTTP 401`, "Only secret API keys can be used for this endpoint"), máy không có `psql`
lẫn Supabase CLI. Dán `supabase/scripts/db-audit.sql` vào SQL Editor để lấy số thật.
Con số ~400 MB trong `AGENTS.md` là từ lần đo trước, không phải hiện tại.

## 2. Deploy thử miễn phí

**Khuyến nghị: Vercel Hobby.** Là nền tảng chính chủ của Next.js nên không có rủi ro
tương thích với Server Component, route handler và `revalidateTag`; hạn mức 100 GB băng
thông, 1.000.000 lượt gọi hàm, thời lượng hàm tới 300 giây
([vercel.com/docs/limits](https://vercel.com/docs/limits),
[vercel.com/docs/plans/hobby](https://vercel.com/docs/plans/hobby), tra 13/09/2026);
Vercel tự ghi đúng `x-forwarded-for` nên khớp thiết kế `TRUST_PROXY_HEADER` đã có.

**Một ràng buộc phải quyết trước khi deploy, và nó không phải quyết định kỹ thuật:**
trang gói Hobby ghi nguyên văn "the Hobby plan restricts users to non-commercial,
personal use only". Nếu zhesen từng có ý định thu phí hoặc gắn quảng cáo thì phải dùng
gói Pro, 20 đô một người một tháng.

Các nền tảng khác:

| Nền tảng | Kết luận |
| --- | --- |
| Cloudflare Workers | 100.000 request/ngày nhưng **10 ms CPU mỗi lượt** — quá chặt cho một lần render Server Component kèm gọi Supabase. Cloudflare hiện khuyến nghị `vinext` thay `@opennextjs/cloudflare` cho dự án mới, nên đường adapter đang chuyển giao |
| Deno Deploy | 1.000.000 request/tháng, **50 ms CPU mỗi lượt**. Tự nhận hỗ trợ Next 16 kể cả `"use cache"`, nhưng là edge runtime, chưa kiểm `@supabase/ssr` chạy đủ API Node hay không |
| Netlify | Tài khoản mở sau 04/09/2025 dùng mô hình 300 credit/tháng, tương đương khoảng 15 GB băng thông. Function free timeout 10 giây |
| Render | Free tier thật, nhưng service **tự ngủ sau 15 phút**, khởi động lại mất 30-50 giây. Với một app tra cứu thì đó là trải nghiệm tệ |
| Railway | Đã bỏ free tier từ tháng 7/2023 |
| Fly.io | Đã bỏ free tier từ 07/10/2024 |

**Rủi ro riêng cần xử lý:** Supabase gói Free **tạm dừng dự án sau 7 ngày** không có đủ
hoạt động truy vấn
([supabase.com/docs/guides/platform/free-project-pausing](https://supabase.com/docs/guides/platform/free-project-pausing)),
trần 500 MB database và 5 GB egress ([supabase.com/pricing](https://supabase.com/pricing)).
Muốn bản demo sống lâu thì cần một lượt ping định kỳ, ví dụ GitHub Actions gọi một truy
vấn nhẹ vài ngày một lần.

**Checklist:** đặt bốn biến `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`REVALIDATE_SECRET`, `TRUST_PROXY_HEADER=1`. Không cần sửa mã. Sau khi deploy, gọi
`POST /api/revalidate` với header `x-revalidate-secret` để xác nhận route sống.

## 3. Crawl và làm giàu dữ liệu

Thứ tự nạp, ưu tiên giá trị trên mỗi megabyte vì trần Free chỉ còn khoảng 100 MB dư địa:

| Thứ tự | Nguồn | Giấy phép | Bổ sung gì |
| --- | --- | --- | --- |
| 1 | CEFR-J (A1-B2) | Giấy phép riêng, miễn phí kể cả thương mại nếu ghi trích dẫn ([cefr-j.org/download.html](https://www.cefr-j.org/download.html)) | Lấp 48% mục từ tiếng Anh đang thiếu trình độ |
| 2 | CEFR-J Octanove (C1-C2) | CC BY-SA 4.0 ([github.com/openlanguageprofiles/olp-en-cefrj](https://github.com/openlanguageprofiles/olp-en-cefrj)) | Hai mức cao hiện không có mục từ nào |
| 3 | FrequencyWords | CC BY-SA 4.0 ([github.com/hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)) | Nhãn mức độ thông dụng, cho cả ba ngôn ngữ |
| 4 | HSK word lists | MIT, qua repo `drkameleon/complete-hsk-vocabulary` | Trình độ cho tiếng Trung |
| 5 | VNEDICT | CC BY 3.0 ([denisowski.org/Vietnamese/vnedict_readme.htm](http://www.denisowski.org/Vietnamese/vnedict_readme.htm)) | Nghĩa tiếng Việt do người biên soạn, thay dần 99,9% máy dịch |
| 6 | Unihan | Unicode License V3 | Bộ thủ, số nét, biến thể giản-phồn |
| 7 | CC-CEDICT | CC BY-SA 4.0 | Nghĩa và pinyin tiếng Trung, 125.058 mục |
| 8 | Tatoeba đã lọc | CC BY 2.0 FR | Câu ví dụ, đặc biệt cho tiếng Tây Ban Nha đang có 0 |
| 9 | Open English WordNet | CC BY 4.0 | Từ đồng nghĩa tiếng Anh |
| 10 | OMW phần tiếng Tây Ban Nha | CC BY 3.0 | Từ đồng nghĩa tiếng Tây Ban Nha. Phần tiếng Trung có giấy phép riêng, phải đọc trước |

**Không dùng được, đã kiểm:**

- **OPUS/OpenSubtitles** là CC BY-NC-SA 3.0. Cấm dùng thương mại.
- **Oxford 3000/5000** thuộc bản quyền Oxford University Press, không có giấy phép mở.
  Các repo GitHub host lại đều không có uỷ quyền rõ ràng.
- **RAE** cấm tái sản xuất nội dung ([rae.es/aviso-legal](https://www.rae.es/aviso-legal)).
- **Chinese Grammar Wiki** là CC BY-NC-SA 3.0, cấm cả web có quảng cáo. Đã ghi trong
  `AGENTS.md` từ trước.

Hoãn tới khi có ngân sách dung lượng lớn hơn: Kaikki.org, Wikidata Lexemes, ConceptNet
(đều dump rất lớn), và cjkvi-ids (GPLv2, copyleft mạnh nhất trong nhóm, cần cân nhắc
pháp lý riêng).

**Việc quan trọng hơn mọi nguồn mới:** nạp lại dữ liệu bằng pipeline đã sửa. Nguồn mới
không cứu được 77,9% câu ví dụ đang hỏng.

## 4. Tích hợp AI

Dùng Gemini, vì đã có sẵn `GEMINI_API_KEY` và pipeline đã dùng. Gemini 2.5 Flash,
Flash-Lite và Pro đều còn free tier
([ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing),
tra 13/09/2026). Hạn mức RPM/RPD cụ thể không còn công bố tĩnh trên doc, phải xem trong
AI Studio của tài khoản thật trước khi thiết kế rate limit.

Nguyên tắc bắt buộc, vì đây là từ điển: **mọi lượt gọi phải grounding bằng chính dữ liệu
trong `lex`**, và mọi nội dung do AI sinh phải được đánh dấu rõ trên giao diện. Một từ
điển bịa nghĩa mất lòng tin ngay lần đầu.

Kiến trúc: gọi ở route handler để không lộ khoá ra bundle client; cache bằng
`unstable_cache` với **tag riêng**, không dùng chung tag `lex` vì vòng đời khác; áp lại
khuôn `createColdQueryLimiter` ở `lib/http/rateLimit.ts` cho mọi route AI, vì mỗi lượt
tốn tiền thật.

Ba tính năng nên làm trước, theo thứ tự:

1. **Mnemonic cho chữ Hán.** Rủi ro ảo giác thấp nhất vì bộ thủ và pinyin đã có sẵn để
   grounding, số ký tự hữu hạn nên cache gần như vĩnh viễn. Route
   `app/api/ai/mnemonic/route.ts`, grounding từ `lex.characters`, tag `ai-mnemonic`.
2. **Sinh câu ví dụ theo trình độ.** Lấp đúng lỗ hổng lớn nhất: tiếng Tây Ban Nha không
   có câu nào, tiếng Trung chỉ có 7.928. Cache theo cặp `(entry_id, level)`.
3. **Giải thích nghĩa theo ngữ cảnh.** Giá trị cao nhất nhưng khó cache vì đầu vào là
   câu tự do, nên cần rate limit chặt hơn hai cái trên.

Hoãn: chấm câu viết và hội thoại luyện nói. Cả hai cần bảng Supabase riêng để lưu lịch
sử, và chấm sai mà ghi vào lịch FSRS thì xoá mất tiến độ thật của người học. Nguyên tắc
này `AGENTS.md` đã ghi cho phần luyện nói.

**Một ứng dụng AI ngoài giao diện, có thể đáng giá hơn cả ba mục trên:** dùng AI trong
pipeline để thay 101.586 nghĩa máy dịch bằng bản dịch có grounding từ nghĩa tiếng Anh
và ngữ cảnh, rồi đánh dấu lại `gloss_vi_is_mt`. Đó là sửa gốc chất lượng từ điển, không
phải thêm một nút bấm.

## 5. Học từ các nền tảng cùng loại

Khảo sát Hanzii, Laban, VDict, Pleco, MDBG, Yellowbridge, Hanping, Wiktionary, Linguee,
Reverso Context, Glosbe, Forvo, Anki, Migaku, LingQ, Readlang, Skritter, WaniKani,
Duolingo, Quizlet.

Hai mục trong báo cáo khảo sát bị loại vì zhesen đã có: stroke-order animation
(`components/lookup/StrokeOrder.tsx`, chạy trên `hanzi-writer`) và bảng từ ở ngôn ngữ
khác (`components/lookup/CrossLanguagePanel.tsx`, chạy trên `lex.match_cross_language`).

Còn lại, xếp theo giá trị chia cho công sức:

| # | Cải tiến | Học từ | Cần gì | Độ khó |
| --- | --- | --- | --- | --- |
| 1 | Thẻ điền khuyết sinh từ câu ví dụ có sẵn | Migaku, Readlang | Dữ liệu đã có trong `lex.examples` | Thấp |
| 2 | Nhãn mức độ thông dụng trên mục từ | VDict, MDBG, Linguee | Nạp FrequencyWords | Thấp |
| 3 | Gắn cấp CEFR/HSK cho từng điểm ngữ pháp, liên kết chéo | Chinese Grammar Wiki | Thêm cột vào `grammar_points` | Thấp |
| 4 | Trạng thái đã biết / đang học / chưa biết khi đọc đoạn dài | LingQ | Cờ mới trong sổ tay | Thấp |
| 5 | Luyện thanh điệu riêng, nhập dấu cho pinyin trắng | Pleco | Pinyin đã có trong `attributes` | Thấp |
| 6 | Tra từ tại chỗ khi đọc trang web bất kỳ | Laban, MDBG Reader, Migaku, Readlang, LingQ | Extension hoặc bookmarklet mới | Vừa đến cao |
| 7 | Kho ví dụ từ ngữ cảnh thật | Reverso Context, Glosbe | Tatoeba đã lọc; **không** dùng OPUS | Vừa đến cao |
| 8 | Câu chuyện cấu tạo chữ Hán, mnemonic theo bộ thủ | Yellowbridge, WaniKani | Bộ thủ đã có; nội dung sinh bằng AI | Vừa |
| 9 | Phát âm nhiều giọng vùng miền | Forvo | API Forvo có phí, phải kiểm giá trước | Vừa đến cao |
| 10 | Chuỗi ngày ôn liên tục | Duolingo | Đếm ngày có `gradeWordById` | Thấp |

Mục 6 đáng chú ý nhất: nó xuất hiện ở năm nền tảng khác nhau trong khảo sát, là mẫu
hình lặp lại nhiều nhất, và zhesen đã có sẵn `lex.search` cùng `TappableText` để dựng.

## 6. Thứ tự đề nghị

1. Chạy `supabase/scripts/db-audit.sql`, lấy dung lượng thật, rồi chạy migration `0030`
   và `0031`.
2. Nạp lại dữ liệu bằng pipeline đã sửa. Không có bước này thì mọi cải tiến giao diện
   đều đang đánh bóng dữ liệu hỏng.
3. Nạp CEFR-J, FrequencyWords, HSK. Ba nguồn nhỏ, giấy phép sạch, lấp hai lỗ hổng lớn.
4. Deploy lên Vercel Hobby sau khi đã quyết chuyện giấy phép thương mại.
5. Làm cải tiến 1 đến 5 trong bảng trên, đều là việc nhỏ trên dữ liệu đã có.
6. Mnemonic chữ Hán bằng AI, rồi câu ví dụ theo trình độ.
7. Nạp VNEDICT và dùng AI trong pipeline để thay dần nghĩa máy dịch.
