# Zhesen đang ở đâu, 18/09/2026

Một tệp trả lời: sản phẩm hiện làm được gì, chạy nhanh chậm ra sao, vừa sửa gì, và còn
nợ gì. Viết cho người không theo dõi quá trình. Thay ba bản báo cáo của các đợt 16/09 và
17/09, vì việc trong đó đã xong và ba tệp mô tả cùng một hệ thống ở ba thời điểm khác
nhau.

## Sản phẩm

Từ điển và sổ tay từ vựng cho người Việt học tiếng Trung, Tây Ban Nha và Anh. Tra xuôi từ
ba ngôn ngữ đó, tra ngược từ tiếng Việt, lưu từ vào sổ tay, ôn lại theo lịch, luyện tập
bằng sáu chế độ. Có một trợ lý AI tuỳ chọn.

Chạy tại <https://zhesen-main.vercel.app>. Máy chủ đặt ở Seoul, cùng nơi với database, và
mỗi lần đẩy mã lên nhánh `master` là một bản deploy mới.

Quy mô dữ liệu: 36.361 mục từ, 183.526 nghĩa, 144.997 câu ví dụ, 699 file phát âm.

## Trang chạy nhanh chậm thế nào

Đo từ Hà Nội, hôm nay. Sàn của đường mạng là khoảng 130 ms: đó là thời gian lấy một tệp
tĩnh đã nằm sẵn trong bộ nhớ đệm, nên không con số nào ở đây xuống dưới mức đó được.

| Thao tác | Trước hôm nay | Sau |
| --- | --- | --- |
| Mở lại một trang đã có người xem trong vòng một giờ | 108 tới 144 ms | 138 tới 219 ms |
| Mở một mục từ lần đầu, chưa ai xem | 441 tới 3.467 ms | 288 tới 1.339 ms trên 20 mục từ |
| Gõ tìm một từ tiếng Anh, Trung hoặc Tây Ban Nha chưa ai gõ | 176 tới 513 ms | 357 tới 697 ms |
| Gõ tìm bằng tiếng Việt, chưa ai gõ | 334 tới 4.078 ms | 334 tới 719 ms |
| Gõ lại đúng từ ai đó vừa gõ | khoảng 59 ms | 126 tới 158 ms |
| Bấm bất kỳ liên kết nào tới một mục từ, thấy dấu hiệu đã nhận | không có | 3 ms |

Hai chiều tra cứu giờ tốn như nhau. Trước hôm nay tra bằng tiếng Việt đắt gấp bảy lần
tra xuôi; bây giờ hai dòng đó nằm cùng một khoảng, và phần còn lại là chi phí cố định
của đường mạng cộng máy chủ, đo được 124 tới 189 ms cho một yêu cầu không đụng tới
database.

Một điều còn lại, và nó là lý do các con số trên có đuôi dài: database thỉnh thoảng
đứng vài giây. Trong cùng đợt đo, một mục từ mất 6.333 ms và một lượt tra tiếng Việt mất
3.774 ms, trong khi 20 mục từ đo liền sau đó không có cái nào vượt 1.339 ms. Nguyên nhân
không nằm trong câu truy vấn mà nằm ở cỡ máy: gói miễn phí cho 0,5 GB bộ nhớ, giữ được
224 MB dữ liệu trong bộ nhớ đệm, còn dữ liệu là 383 MB. Phần không vừa phải đọc từ đĩa.
Xem mục Còn nợ.

## Đã sửa gần đây

### Tốc độ

- Câu truy vấn tra ngược tiếng Việt, thứ chậm nhất còn lại của lần trước, đã xử lý. Nó
  dò chuỗi theo hai cách cùng lúc và cách thứ hai, đo độ giống nhau, được đặt quá lỏng:
  database lấy ra 19.206 dòng rồi bỏ đi gần hết để giữ 166. Xiết lại thì nó đọc ít hơn ba
  lần và lần chạy nguội của một truy vấn mẫu xuống từ 3.461 ms còn 189 ms. Chất lượng câu
  trả lời không đổi: đo trên 18 lượt tra tiếng Việt, ba kết quả đầu y nguyên và 16 lượt
  vẫn trả đủ 24 dòng; dòng bị bỏ là loại đuôi, ví dụ tra "xin chào" thì mất `rope`
  ("dây chão") và `soup` ("xúp, canh, cháo"), còn cả mười một lời chào thật đều ở lại.
- Bấm một liên kết giờ có phản hồi, ở mọi liên kết dẫn tới một mục từ: kết quả tìm kiếm,
  từ vựng hôm nay, hai danh sách theo cấp độ, và ba khung liên kết trên chính trang mục
  từ. Đó là cú bấm phải chờ lâu nhất trong ứng dụng. Đo trên bản chạy thật, chấm hiện 3 ms
  sau khi bấm và tắt ở 2.101 ms khi trang tới. Trước đó trang cũ đứng im suốt quãng đó.
  Sáu liên kết dẫn tới trang cần đăng nhập đã có chấm này từ đợt trước.
- Tra bằng tiếng Việt bớt được 276 tới 829 ms ở lần tra đầu tiên của mỗi từ, vì hai hướng
  tra giờ chạy cùng lúc thay vì nối đuôi.
- Trang mục từ bớt một lượt chờ, khoảng 272 tới 716 ms tuỳ mục từ.
- Trang từ điển, ngữ pháp và học theo cấp độ được lưu vào bộ nhớ đệm ở biên mạng, nên lần
  mở thứ hai trở đi xuống còn khoảng 130 ms thay vì 250 tới 310 ms.
- Header không còn tải trước bốn trang cần đăng nhập mỗi lần mở bất kỳ trang nào, và trình
  duyệt không còn hỏi máy chủ xác thực hai lần trên mỗi trang mục từ.
- Bỏ một phông chữ mà cả ứng dụng chỉ dùng ở một dòng.

### Lỗi

- Tra một chữ Hán không phải mục từ chính xác làm máy chủ trả lỗi 500. Đã sửa.
- Gõ ký tự đặc biệt như `a((` vào ô tìm kiếm làm máy chủ trả lỗi. Đã sửa.
- Trang mục từ báo lỗi ngầm trong trình duyệt mỗi khi bật trạng thái đang tải. Lỗi này
  từng làm một đợt trước phải bỏ tính năng đó thay vì sửa. Đã truy ra nguyên nhân là nút
  trợ lý AI và sửa.
- Một lỗ hổng chuyển hướng cho phép kẻ tấn công đẩy người vừa đăng nhập sang trang của họ.
  Đã sửa.
- Địa chỉ trang trong sitemap và thẻ chia sẻ trỏ về `localhost`. Đã sửa.
- Bộ đọc file CSV hiểu sai dấu nháy kép và ký tự xuống dòng, nên file hợp lệ báo lỗi sai.
  Đã sửa.
- Trợ lý AI dùng chung một hạn mức cho tất cả mọi người, nên một người chạy script lấy sạch
  được. Giờ tính theo từng địa chỉ.

### Database

- Rà toàn bộ và không tìm thấy rác: không có dòng mồ côi ở bất kỳ bảng nào, không có tệp
  thừa của bộ tìm kiếm tiếng Trung. Đã xoá sáu cột của cơ chế ôn tập cũ.
- Tám hàm tìm kiếm trước đây chạy được hay báo lỗi tuỳ người gọi là ai. Đã ghim lại.
- Đánh dấu rõ phần nào của database là của dự án: một schema tên `lex` và bốn bảng, phần
  còn lại đi kèm nền tảng.

### Phụ thuộc

Bốn pull request tự động đang treo đã xử lý xong: ba bản nâng cấp đã gộp, một bản bị đóng
vì nó nâng TypeScript lên phiên bản mà công cụ kiểm tra mã chưa hỗ trợ. Bản kiểm tra tự
động trước đây luôn báo đỏ cho mọi pull request loại này vì một lý do nằm ngoài nội dung
của chúng; đã sửa để nó báo đúng.

## Còn nợ, theo thứ tự nên làm

1. **Quyết gói Supabase.** Đây giờ là việc số một, và nó là một quyết định của bạn chứ
   không phải một việc sửa mã. Hai lý do gộp lại. Thứ nhất, dung lượng: đang dùng 383 MB
   trên trần 500 MB của gói miễn phí, nạp thêm dữ liệu từ điển là chạm trần. Thứ hai, và
   đây là điều mới đo được hôm nay: cỡ máy của gói miễn phí là thứ duy nhất còn làm trang
   đứng vài giây. Máy có 0,5 GB bộ nhớ và giữ được 224 MB trong bộ nhớ đệm, nhỏ hơn 383 MB
   dữ liệu, nên mỗi lần chạm vào phần không vừa thì phải đọc đĩa. Không có cách sửa nào
   trong mã đi vòng được chỗ này. Gói trả phí 25 đô một tháng nâng lên 8 GB dung lượng và
   máy 1 GB bộ nhớ; cả 383 MB sẽ vừa bộ nhớ đệm, suy luận, chưa xác minh.
2. **Nâng hạn chót của một câu truy vấn từ 3 giây lên 8 giây, hoặc chấp nhận build đỏ.**
   Database cắt mọi câu truy vấn của ứng dụng ở 3 giây và trả về lỗi. Lần build của hôm
   nay đã chết đúng vì lẽ đó, ở trang `/learn/en`, với `canceling statement due to
   statement timeout`; chạy lại thì xanh. Trước khi sửa câu truy vấn tra ngược, nó chạy
   nguội mất 3.461 ms, tức là vượt hạn chót đó: một số lượt tra tiếng Việt không chỉ chậm
   mà trả lỗi. Giờ nó không còn vượt, nhưng những đường khác vẫn có thể. Hai lối: nâng hạn
   chót cho ứng dụng lên 8 giây, bằng với mức người đã đăng nhập đang dùng, hoặc bỏ việc
   dựng sẵn ba trang `/learn/<ngôn ngữ>` lúc build để build không còn phụ thuộc vào
   database. Việc 1 làm rồi thì việc này gần như tự hết.
3. **Ghi công tác giả cho 647 file phát âm.** 647 trên 699 file đòi ghi công theo giấy phép
   và ứng dụng hiện không hiện dòng nào. Phải làm dù có đổi nơi lưu file hay không.
4. **Sửa repo pipeline trước, rồi mới dọn được ba thứ thừa trong database**: một cột rỗng
   ở bảng câu ví dụ, một bảng 9.077 dòng không nơi nào đọc, và đoạn thừa trong địa chỉ file
   âm thanh.
5. **68 file phát âm nằm trong database nhưng chưa từng phát**, vì hệ thống kiểm tra thấy
   chúng đọc không đúng từ. Chưa quyết xoá hay sửa.
6. **Thu hồi token deploy cũ** nếu muốn chặt chẽ: nó từng được dán trong một cửa sổ chat.
   Cùng lý do với token Supabase được dán trong phiên hôm nay.

## Đã thử đo và bỏ

Hai ý nghe hợp lý cho khung "Từ này ở ngôn ngữ khác" trên trang mục từ, đo
xong thì bỏ cả hai. Ghi lại để không ai thử lại.

- **Cắt bớt phần giải thích trong nghĩa tiếng Việt trước khi dùng nó đi tìm từ tương
  đương.** Nghĩa trong dữ liệu thường viết kiểu "kiến (côn trùng thuộc họ Formicidae)", và
  cả chuỗi đó nghe như một câu tìm kiếm vô nghĩa. Đo trên 30 mục từ thông dụng nhất có
  dạng này: cả chuỗi trả về 88 dòng, phần đầu đã cắt trả về 84. Cắt không tốt hơn.
- **Chạy hai bước tìm từ tương đương cùng lúc thay vì nối đuôi.** Bước thứ hai hiện chỉ
  chạy khi bước thứ nhất còn để trống một ngôn ngữ. Đo trên 300 mục từ thông dụng nhất:
  189 mục, tức 63 phần trăm, không cần tới bước thứ hai. Chạy sẵn cùng lúc là bắt hai phần
  ba số trang trả một câu truy vấn không ai đọc.

## Hai quyết định đã nghiên cứu xong, chưa tới lúc làm

Hai báo cáo trong `research/` giữ số đo và bảng giá cho hai quyết định này. Không cần đọc
trừ khi chuẩn bị làm.

- **Chuyển database đi nơi khác: không nên.** Bộ tìm kiếm tiếng Trung mà dự án đang dùng
  không có trên các dịch vụ của AWS, và phương án AWS rẻ nhất vẫn đắt hơn gói trả phí của
  Supabase mà lại thiếu nửa số thứ đi kèm.
- **Chuyển 699 file phát âm khỏi Wikimedia: nên, nhưng chỉ sau khi làm phần ghi công.**
  Nhanh hơn khoảng 380 ms mỗi lần bấm nút phát âm, tốn dưới 0,01 đô một tháng.
