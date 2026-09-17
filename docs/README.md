# Tài liệu

Thư mục này giữ lịch sử thiết kế, không phải hướng dẫn sử dụng. Muốn chạy dự án thì đọc
[`README.md`](../README.md) ở gốc; quy ước bắt buộc khi sửa mã nằm ở
[`AGENTS.md`](../AGENTS.md).

## Đọc gì

| Muốn biết | Đọc |
| --- | --- |
| Dự án đang ở đâu, vừa sửa gì, còn nợ gì | [`specs/2026-09-18-zhesen-status.md`](superpowers/specs/2026-09-18-zhesen-status.md) |
| Có nên chuyển database sang AWS không | [`research/2026-09-16-storage-architecture.md`](superpowers/research/2026-09-16-storage-architecture.md) |
| Có nên tự lưu 699 file phát âm không | [`research/2026-09-17-audio-hosting.md`](superpowers/research/2026-09-17-audio-hosting.md) |

Ba tệp trên là tất cả những gì còn hiệu lực. Hai tệp `research/` là hồ sơ của hai quyết
định chưa tới lúc làm: bảng giá, số đo và lý do chọn. Không cần đọc trừ khi chuẩn bị làm
đúng việc đó.

## Quy ước

Mỗi tệp ghi lại quyết định tại thời điểm viết và mang ngày trong tên. Tệp cũ không được
sửa cho khớp mã hiện tại: giá trị của chúng nằm ở chỗ cho biết lúc đó đã cân nhắc những
gì. Khi mã và tài liệu mâu thuẫn, mã là đúng.

Đường dẫn `docs/superpowers/` là quy ước của bộ kỹ năng superpowers, đừng đổi: các skill
ghi tệp mới vào đúng đường dẫn đó.

Khi một đợt làm việc kết thúc, spec và plan của nó không tự động có giá trị lưu trữ. Hãy
hỏi: một người đọc tệp này sáu tháng nữa sẽ hiểu đúng hơn hay sai hơn? Nếu là sai hơn thì
xoá ngay lúc đó, đừng để tích lại. Lịch sử vẫn nằm trong git: `git log --diff-filter=D
--name-only` tìm commit xoá, rồi `git show <commit>^:<đường dẫn>` đọc lại.

## Đã xoá, và vì sao

**18/09/2026, ba bản báo cáo của các đợt 16/09 và 17/09.** Việc trong đó đã xong, và ba
tệp mô tả cùng một hệ thống ở ba thời điểm khác nhau thì người đọc phải tự ghép lại mới
biết cái nào còn đúng. Thay bằng một tệp trạng thái duy nhất.

**13/09/2026, 14 tệp** của các đợt đã hoàn thành: năm bản plan, sáu bản spec, hai bản khảo
sát sản phẩm và một spec mô tả hệ thống hook đã bị thay. Lý do không phải cho gọn mắt: các
tệp đó mô tả kiến trúc đã bị cố tình gỡ bỏ, nên ai đọc để lấy bối cảnh sẽ bị dẫn ngược lại
đúng chỗ dự án đã rời bỏ. Tài liệu sai nguy hiểm hơn là không có tài liệu.
