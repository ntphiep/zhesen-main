# Tài liệu thiết kế

Thư mục này giữ lịch sử thiết kế của dự án, không phải tài liệu hướng dẫn. Muốn biết
cách chạy dự án thì đọc [`README.md`](../README.md) ở gốc; muốn biết quy ước bắt buộc
khi sửa mã thì đọc [`AGENTS.md`](../AGENTS.md).

Mỗi tệp ghi lại quyết định tại thời điểm viết. Tệp cũ không được sửa cho khớp mã hiện
tại: chúng có giá trị đúng vì cho biết lúc đó đã cân nhắc những gì. Khi mã và tài liệu
mâu thuẫn, mã là đúng.

## Đang dùng

| Tệp | Nội dung |
| --- | --- |
| [`specs/2026-09-17-db-cleanup-and-deploy.md`](superpowers/specs/2026-09-17-db-cleanup-and-deploy.md) | **Đọc trước tiên.** Mười hai schema trên Supabase là của ai, đã dọn được gì, và hai lỗi tìm được trong lúc dọn |
| [`specs/2026-09-16-zhesen-overhaul-status.md`](superpowers/specs/2026-09-16-zhesen-overhaul-status.md) | Báo cáo tổng thể đợt rà soát 16/09: lỗi đã sửa, sáu migration đã chạy, kết luận lưu trữ, việc còn nợ |
| [`research/2026-09-16-storage-architecture.md`](superpowers/research/2026-09-16-storage-architecture.md) | Kiến trúc lưu trữ: đo độ trễ và dung lượng, vì sao database ở lại Supabase, việc cần làm theo thứ tự |
| [`research/2026-09-17-audio-hosting.md`](superpowers/research/2026-09-17-audio-hosting.md) | 699 file phát âm: kích thước thật, độ trễ đo từ Việt Nam, chi phí bốn phương án, và vì sao phần ghi công tác giả phải làm trước |
| [`specs/2026-09-13-zhesen-growth-plan.md`](superpowers/specs/2026-09-13-zhesen-growth-plan.md) | Tình trạng dữ liệu đo ngày 13/09, deploy, nguồn dữ liệu mở kèm giấy phép, tích hợp AI, thứ tự việc |
| [`specs/2026-09-12-zhesen-handoff.md`](superpowers/specs/2026-09-12-zhesen-handoff.md) | Trạng thái đã kiểm chứng, việc còn nợ, bẫy của môi trường |
| [`specs/2026-09-12-zhesen-restart-design.md`](superpowers/specs/2026-09-12-zhesen-restart-design.md) | Đợt khởi động lại: đổi tên, thu hẹp phạm vi về tra cứu, sổ tay và ôn tập |
| [`specs/2026-06-20-zhesen-improvement-roadmap.md`](superpowers/specs/2026-06-20-zhesen-improvement-roadmap.md) | Khảo sát tháng Sáu, F1-F12 đã làm xong hết; giữ làm hồ sơ, kèm bảng đối chiếu từng mục với mã |
| [`research/2026-07-01-claude-recurring-mistakes.md`](superpowers/research/2026-07-01-claude-recurring-mistakes.md) | Sổ lỗi lặp lại của agent. Lỗi nào lặp nhiều thì được nâng thành rule trong `AGENTS.md` |
| [`specs/2026-06-21-zhesen-pipeline-data-fixes-handoff.md`](superpowers/specs/2026-06-21-zhesen-pipeline-data-fixes-handoff.md) | Việc còn nợ bên repo pipeline, vì dữ liệu chưa đủ thì mã không sửa được |

Mười tệp trên là tất cả những gì còn hiệu lực. Đây là danh sách đầy đủ, không phải danh
sách chọn lọc.

## Đã xoá, và vì sao

Ngày 2026-09-13 xoá 14 tệp: năm bản plan của các đợt đã hoàn thành (MVP, chuyển sang
Supabase, pipeline dữ liệu, sổ tay từ vựng, trang tra cứu), sáu bản spec cùng các đợt đó,
hai bản khảo sát sản phẩm cùng loại hồi tháng Sáu, và một spec mô tả hệ thống hook đã
được thay.

Lý do không phải để cho gọn mắt. Các tệp đó mô tả kiến trúc đã bị cố tình gỡ bỏ: bản plan
MVP còn hướng dẫn dựng hai lớp trừu tượng `ContentSource` và `ProgressStore` mà `AGENTS.md`
ghi rõ là đừng dựng lại. Một agent đọc chúng để lấy bối cảnh sẽ bị dẫn ngược lại đúng chỗ
dự án đã rời bỏ. Tài liệu sai nguy hiểm hơn là không có tài liệu.

Lịch sử vẫn nằm trong git. Cần đọc lại thì `git log --diff-filter=D --name-only` tìm
commit xoá, rồi `git show <commit>^:<đường dẫn>`.

## Quy ước

Đường dẫn `docs/superpowers/` là quy ước của bộ kỹ năng superpowers, đừng đổi: các skill
ghi tệp mới vào đúng đường dẫn đó.

Khi một đợt làm việc kết thúc, spec và plan của nó không tự động có giá trị lưu trữ. Hãy
hỏi: một agent đọc tệp này sáu tháng nữa sẽ làm đúng hơn hay sai hơn? Nếu là sai hơn thì
xoá ngay lúc đó, đừng để tích lại.
