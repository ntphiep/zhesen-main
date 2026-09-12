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
| [`specs/2026-09-12-zhesen-handoff.md`](superpowers/specs/2026-09-12-zhesen-handoff.md) | **Đọc trước tiên.** Trạng thái đã kiểm chứng, việc còn nợ, bẫy của môi trường |
| [`specs/2026-09-12-zhesen-restart-design.md`](superpowers/specs/2026-09-12-zhesen-restart-design.md) | Đợt khởi động lại: đổi tên, thu hẹp phạm vi về tra cứu, sổ tay và ôn tập |
| [`specs/2026-06-20-zhesen-improvement-roadmap.md`](superpowers/specs/2026-06-20-zhesen-improvement-roadmap.md) | Danh sách cải tiến F1-F12, vẫn còn mục chưa làm |
| [`research/2026-07-01-claude-recurring-mistakes.md`](superpowers/research/2026-07-01-claude-recurring-mistakes.md) | Sổ lỗi lặp lại của agent. Lỗi nào lặp nhiều thì được nâng thành rule trong `AGENTS.md` |
| [`specs/2026-06-21-zhesen-pipeline-data-fixes-handoff.md`](superpowers/specs/2026-06-21-zhesen-pipeline-data-fixes-handoff.md) | Việc còn nợ bên repo pipeline, vì dữ liệu chưa đủ thì mã không sửa được |

## Lịch sử

`superpowers/specs/` và `superpowers/plans/` còn lại là các đợt đã hoàn thành, theo thứ
tự thời gian: MVP proof-of-concept, chuyển sang Supabase, pipeline dữ liệu, sổ tay từ
vựng, trang tra cứu chi tiết, trình đọc, và đợt tái cấu trúc quy trình làm việc với AI.
`superpowers/research/` giữ hai bản khảo sát các sản phẩm cùng loại.

Đường dẫn `docs/superpowers/` là quy ước của bộ kỹ năng superpowers, đừng đổi: các skill
ghi tệp mới vào đúng đường dẫn đó.
