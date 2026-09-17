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

Đo từ Hà Nội. Sàn của đường mạng là khoảng 115 ms: đó là thời gian lấy một tệp tĩnh đã nằm
sẵn trong bộ nhớ đệm, nên không con số nào ở đây xuống dưới mức đó được.

| Thao tác | Trước hôm nay | Sau |
| --- | --- | --- |
| Mở lại một trang đã có người xem trong vòng một giờ | 108 tới 144 ms | 50 tới 137 ms |
| Mở một mục từ lần đầu, chưa ai xem | 441 tới 3.467 ms | 428 tới 3.121 ms |
| Gõ tìm một từ tiếng Anh, Trung hoặc Tây Ban Nha chưa ai gõ | 176 tới 513 ms | 182 tới 270 ms |
| Gõ tìm bằng tiếng Việt, chưa ai gõ | 334 tới 4.078 ms | 464 tới 4.309 ms |
| Gõ lại đúng từ ai đó vừa gõ | khoảng 59 ms | khoảng 59 ms |
| Bấm một liên kết cần đăng nhập, thấy dấu hiệu đã nhận | không có | 140 ms |

Hai dòng còn chậm, mở một mục từ lần đầu và tra bằng tiếng Việt, có chung một nguyên
nhân và đó là lý do chúng gần như không đổi: một câu truy vấn dò chuỗi tiếng Việt trong
toàn bộ 183.526 nghĩa, nằm trong database chứ không nằm trong ứng dụng. Nó chạy cho mỗi
lần tra bằng tiếng Việt, và chạy thêm một lần nữa khi trang mục từ dựng khung "Từ này ở
ngôn ngữ khác". Sửa nó là việc số một ở mục Còn nợ.

## Đã sửa gần đây

### Tốc độ

- Bấm một liên kết giờ có phản hồi. Sáu liên kết dẫn tới trang cần đăng nhập có một chấm
  nhỏ sáng lên bên cạnh trong lúc trang đang được lấy về; đo trên bản chạy thật, chấm hiện
  sau 140 ms và tắt khi trang tới ở 367 ms. Trước đó trang cũ đứng im suốt quãng đó, không
  có dấu hiệu nào cho thấy cú bấm đã được ghi nhận.
- Tra bằng tiếng Việt bớt được 276 tới 829 ms ở lần tra đầu tiên của mỗi từ, vì hai hướng
  tra giờ chạy cùng lúc thay vì nối đuôi. Phần còn lại là câu truy vấn trong database.
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

1. **Làm câu truy vấn tra ngược tiếng Việt nhanh lên.** Đây là thứ chậm nhất còn lại, nó
   nằm trên đường đi của hai tính năng, và hai dòng chậm nhất trong bảng trên là nó. Cần
   quyền vào thẳng database để đọc kế hoạch thực thi rồi chỉnh chỉ mục; phiên này chỉ có
   quyền đọc qua ứng dụng nên chưa làm được.
2. **Ghi công tác giả cho 647 file phát âm.** 647 trên 699 file đòi ghi công theo giấy phép
   và ứng dụng hiện không hiện dòng nào. Phải làm dù có đổi nơi lưu file hay không.
3. **Quyết gói Supabase.** Đang dùng 383 MB trên trần 500 MB của gói miễn phí. Nạp thêm dữ
   liệu từ điển là chạm trần. Gói trả phí 25 đô một tháng cho 8 GB.
4. **Sửa repo pipeline trước, rồi mới dọn được ba thứ thừa trong database**: một cột rỗng
   ở bảng câu ví dụ, một bảng 9.077 dòng không nơi nào đọc, và đoạn thừa trong địa chỉ file
   âm thanh.
5. **68 file phát âm nằm trong database nhưng chưa từng phát**, vì hệ thống kiểm tra thấy
   chúng đọc không đúng từ. Chưa quyết xoá hay sửa.
6. **Thu hồi token deploy cũ** nếu muốn chặt chẽ: nó từng được dán trong một cửa sổ chat.

## Hai quyết định đã nghiên cứu xong, chưa tới lúc làm

Hai báo cáo trong `research/` giữ số đo và bảng giá cho hai quyết định này. Không cần đọc
trừ khi chuẩn bị làm.

- **Chuyển database đi nơi khác: không nên.** Bộ tìm kiếm tiếng Trung mà dự án đang dùng
  không có trên các dịch vụ của AWS, và phương án AWS rẻ nhất vẫn đắt hơn gói trả phí của
  Supabase mà lại thiếu nửa số thứ đi kèm.
- **Chuyển 699 file phát âm khỏi Wikimedia: nên, nhưng chỉ sau khi làm phần ghi công.**
  Nhanh hơn khoảng 380 ms mỗi lần bấm nút phát âm, tốn dưới 0,01 đô một tháng.
