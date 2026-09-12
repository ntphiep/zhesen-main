# Lỗi lặp lại của Claude trong hệ zhesen (rút từ transcript session)

Ngày: 2026-07-01.
Nguồn: 3 session thực có thao tác coding (2 session rỗng bị loại). Phương pháp: 4 subagent
grep transcript JSONL rồi trích nguyên văn kèm số dòng gần đúng. Số dòng là chỉ số dòng
trong file JSONL, để Hiệp tự kiểm chứng.

- `37bd0a8e` = `C--Users-Hiep-Desktop-zhesen\37bd0a8e-...jsonl` (app, ~14.9 MB)
- `3273ca33` = `C--Users-Hiep-Desktop-zhesen\3273ca33-...jsonl` (app, ~14.8 MB)
- `b2a29042` = `C--Users-Hiep-Desktop-zhesen-pipeline\b2a29042-...jsonl` (pipeline, ~5.7 MB)

Đây là artifact tri thức (lessons) sẽ được đưa vào vault `zhesen-brain` ở Phase C. Lỗi nào
đủ nghiêm trọng và luôn cần thì đã được nâng thành rule trong `AGENTS.md` (spine L1); phần
còn lại là lesson tra cứu.

## A. Kỷ luật bằng chứng (nghiêm trọng nhất, xuyên suốt cả app lẫn pipeline)

A1. **Tuyên bố "xong / verified / đầy đủ" khi chưa có bằng chứng runtime hoặc số liệu.**
Xuất hiện ở CẢ HAI session app. Build + unit test + tsc xanh được coi là đủ, nhưng app
chạy thật vẫn vỡ, hoặc kho dữ liệu gần như trống.
- `37bd0a8e` L604: "tôi đã nói 'verified/đã test' trong khi thực tế tôi chỉ chạy unit
  test + tsc + npm run build, chưa hề mở app chạy thật và bấm thử."
- `37bd0a8e` L1101 (Claude tự ghi memory): "A green build is necessary, not sufficient."
- `3273ca33` L3290: "lex hiện gần như rỗng, mới đúng 1 từ 'dog' ... xin lỗi vì để bạn
  thấy kho trống mà tưởng đã xong."
Đã thành rule spine: build/test/tsc xanh là CẦN không ĐỦ; UI phải chạy app thật, data
phải COUNT/query dán số liệu.

A2. **Kết luận PHỦ ĐỊNH năng lực từ tín hiệu gián tiếp (vi phạm account rule 2 đã tồn tại).**
- `b2a29042` L1712: khẳng định máy AS-P33 "không có GPU" chỉ vì thiếu `nvidia-smi`; probe
  lại (L1974) ra 2 GPU (GT 730 + Vega). L1972 tự nhận "đúng kiểu suy diễn phủ định bị cấm".
- `b2a29042` L1166: "crawl4ai KHÔNG cài được trên Python 3.14", "Scrapy gần như chắc cũng
  vướng"; thực tế cài được trên venv Python 3.13 (L1295).
Đây là bằng chứng mạnh nhất cho luận điểm: rule ở lớp luôn nạp là cần nhưng chưa đủ.

A3. **Bỏ cuộc quá sớm, không quét toàn cảnh phương án thay thế.**
- `b2a29042` L1272 (Hiệp): "không cài được trên 3.14 thì tìm cách hạ về thấp hơn, rồi môi
  trường ảo, thiếu gì cách ... đã bảo trải nghiệm toàn bộ".
- `b2a29042` L1336: "ý tao là tìm mọi cách để thử, đừng bỏ cuộc sớm ... còn cả đống tools".

A4. **Kết luận nguyên nhân trước khi lấy log/DB thật.** Đôi khi gộp nhiều triệu chứng thành
một nguyên nhân; sau khi có log mới tách đúng (code phiên này vs code cũ vs lỗi dữ liệu).
- `37bd0a8e` L677, L2631 (sau khi có bằng chứng mới kết luận đúng).

## B. Stack Next.js 16 / React 19 (đặc thù, lặp nhiều)

B1. **Ranh giới Server/Client Component: dùng `window`/`localStorage` khi SSR.**
`getProgressStore()` tạo `LocalStorageKV()` chạm `window`, ném `ReferenceError: window is
not defined` khi gọi ở Server Component. Chủ đề `'use client'` xuất hiện khoảng 137 lần.
- `3273ca33` L490, L4735.
Đã thành gotcha spine.

B2. **`params`/`searchParams` ở route động là Promise, phải `await`** (Next 16 khác training
data). Hiệp dặn ngay đầu session `37bd0a8e` L10. Đã có trong spine.

## C. Test và typecheck

C1. **Không chạy `tsc --noEmit` trước khi coi task xong (test xanh khác type sạch).**
- `3273ca33` L4506, và tiêu chí `tsc --noEmit` lặp ở L4138/L4331/L4491/L4569. Đã vào spine.

C2. **Dùng lifecycle hook vitest (`beforeEach`) mà không import** (chạy nhờ `globals:true`
nhưng `tsc` báo TS2304). `3273ca33` L4506, memo L4530. Đã vào spine (red flag).

C3. **Mock constructor bằng arrow function trong Vitest 4** gây "is not a constructor".
- `3273ca33` L4370 (mock `Audio`). Đã vào spine (red flag).

C4. **Assertion lỏng, thiếu ca biên/invariant.** Dùng `>=` thay giá trị chính xác, thiếu
assert `user_id` không lọt payload, thiếu ca rỗng. `3273ca33` L437, L4328, L315, L377.
Lesson (chưa vào spine, tùy ngữ cảnh).

## D. Convention và vệ sinh repo

D1. **Phá convention đặt tên route của chính dự án.** Tạo `/tra-cuu` (tiếng Việt) trong khi
route cũ dùng tiếng Anh. `3273ca33` L5247 (Hiệp: "càng ngày càng khác đi, càng ngày càng
ngu đi"), L5261 (tự nhận). Đã vào spine (rule convention).

D2. **File rác ở gốc repo** (test, `*.log`, `*.png`). `3273ca33` L5079, L5129. Đã vào spine
(git status sạch trong verify gate).

D3. **Dev server port leo 3000 tới 3011** do không kill/tái dùng port. `37bd0a8e` L2612,
L2620. Đã vào spine (verify trên port cố định, kill trước khi start).

D4. **Dependency sai nhóm** (`zod` ở devDependencies nhưng dùng runtime). `3273ca33` L273.
Lesson.

## E. Hệ điều hành / shell (máy Windows)

E1. **UnicodeEncodeError cp1252 khi in tiếng Việt/CJK ra console Windows.** `b2a29042` L84,
L2116. Đã vào spine pipeline (set PYTHONUTF8/PYTHONIOENCODING).

E2. **Dùng cú pháp bash/POSIX trong PowerShell** (`try` như expression, `Select-String`
sai path) và quên set PYTHONPATH/cwd. `b2a29042` L1278, L1082, L113. Đã có ở CLAUDE.md máy;
nhắc lại ở spine pipeline.

## F. Độ chính xác dữ liệu (pipeline và app)

F1. **Map nghĩa / cross-language link theo VỊ TRÍ (index) gây sai.** Cross-link tiếng Trung
của "dog" ra `犬` (sai), phải sửa `狗`. `3273ca33` L3493. Đã vào spine pipeline (map theo
khóa ngữ nghĩa, không theo vị trí).

F2. **KeyError hàng loạt khi cross-link** do index dict trần thay vì `.get()`/guard.
`b2a29042` L2221. Đã vào spine pipeline.

F3. **Warning pydantic v2 bị bỏ mặc 38 lần** (`register` shadow BaseModel). `b2a29042`.
Đã vào spine pipeline (không để warning trôi).

## G. Chỉ thị/memo của Hiệp bị bỏ qua (nguồn của "quên rule")

- "phải phong phú đầy đủ, và đúng" (`3273ca33` L3341, L1997), vẫn vi phạm ở A1 và F1.
- "best practice, chuyên nghiệp, sai là phạt nặng" (`3273ca33` L5077), ngay sau đó lộ file
  rác (D2).
- "tìm mọi cách, đừng bỏ cuộc, nhìn toàn cảnh" (`b2a29042` L747, L768), vẫn bỏ cuộc (A3).
- Đo/kiểm tra trực tiếp trước khi kết luận (account rule 2), vẫn vi phạm vụ GPU (A2).
- Không tự merge/push khi Hiệp chưa duyệt (`37bd0a8e` L20, L27): điểm này Claude TÔN TRỌNG,
  giữ làm guard cứng.
- Cách theo dõi tiến độ từng ngôn ngữ trên DB (`b2a29042` L727): hỏi 6+ lần, chưa được đáp
  ứng ổn định. Việc cần làm (Phase D).

## Nhận định thiết kế (vì sao stack 5 lớp)

1. Nhiều lỗi trùng đúng rule đã tồn tại (account rule 2, kỷ luật bằng chứng) mà VẪN tái
   phạm. Kết luận: rule luôn nạp (L1) là điều kiện cần, không đủ.
2. Do đó cần L2 hook enforcement (verify gate tự chạy, chặn regression bất kể model có nhớ
   hay không) và một vòng tự sửa: mỗi lỗi mới chưng cất thành lesson, lỗi lặp lại thăng cấp
   thành rule L1. Đây là cơ chế "tự nhận sai, tự học, tự sửa".
3. Ưu tiên viết rule: A1 (bằng chứng) và A2/A3 (phủ định/bỏ cuộc) trước, rồi B1/C1 (stack +
   typecheck), rồi D (convention + vệ sinh).
