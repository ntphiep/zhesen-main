# Refactor luồng AI agent coding cho hệ sinh thái zhesen

Ngày: 2026-06-29
Trạng thái: đã duyệt kiến trúc (Hiệp), đang triển khai theo phase.
Loại: design spec kiêm ADR (architecture decision record).

## Bối cảnh và vấn đề

Hiệp dùng Claude Code để phát triển zhesen nhưng agent mắc lỗi nhiều và lặp lại:
quên rule và convention của project, càng làm phiên càng dài thì càng bỏ qua cả
quy tắc coding căn bản lẫn memo do người dùng cung cấp, phá code đang chạy mà không
test, và mất ngữ cảnh giữa phiên dài hoặc qua phiên mới.

Đối chiếu với nghiên cứu về suy giảm năng lực của LLM agent, đây không phải một lỗi
đơn mà là nhiều failure mode chồng nhau, mỗi cái cần một lớp phòng thủ riêng:

| Lỗi quan sát | Cơ chế | Lớp chữa |
|---|---|---|
| Quên rule, càng làm càng bỏ rule | instruction-following decay + self-conditioning | rule LUÔN nạp (CLAUDE.md) + hook bơm lại |
| Phá code, không test | thiếu tín hiệu ngoài để tự bắt lỗi | hook tự chạy typecheck/lint/test |
| Mất ngữ cảnh phiên dài, xuyên phiên | statelessness + context rot | second-brain (Obsidian) + episodic memory |
| Bỏ memo người dùng đưa | memo trôi nổi trong chat, không neo | neo vào CLAUDE.md hoặc vault |

## Nguyên tắc cốt lõi (từ nghiên cứu)

1. Rule bị rớt phải nằm ở lớp luôn nạp trong context, không phải lớp truy hồi.
   Memory qua MCP/vault là retrieval: model phải chủ động query mới thấy; một model
   đang suy giảm thì cũng lười query, nên để rule sống còn chỉ trong vault sẽ làm lỗi
   nặng thêm.
2. Agent chỉ tự bắt lỗi đáng tin khi có tín hiệu NGOÀI (test, lint, build, verifier).
   Do đó hook verify gate là đòn bẩy mạnh nhất, vì nó chạy bất kể model có đang suy
   giảm hay không.
3. Obsidian + MCP là lớp tri thức, không phải lớp enforcement. Nó xứng đáng cho
   second-brain phủ cả ecosystem nhưng không phải thứ chính chữa được rule-dropping.
4. Mỗi MCP server ngốn context budget; dùng sai chỗ làm context rot nặng hơn.

## Quyết định kiến trúc: stack 5 lớp

- L1 Spine luôn nạp: CLAUDE.md/AGENTS.md thật cho từng repo (rule cứng, gotcha version,
  bản đồ kiến trúc rút gọn, verify gate, con trỏ tới vault). Dưới ~150 dòng.
- L2 Enforcement tự động: hook trong `.claude/settings.json` của repo, chạy
  typecheck/lint/test sau khi sửa và đẩy lỗi vào context.
- L3 Second-brain Obsidian (phủ ecosystem): vault thật cấu trúc raw/ wiki/ outputs/
  cộng sổ lessons. Nối qua Obsidian MCP. Seed từ docs/superpowers và zhesen-sdd.
- L4 Episodic xuyên phiên: claude-mem và auto-memory (đang bật).
- L5 Quy trình: giữ luồng spec, plan, implement, review; thêm bước ghi lesson sau mỗi
  task và định kỳ chưng cất lesson thành rule L1.

## Lựa chọn của người dùng (đã chốt)

- Phạm vi: toàn hệ sinh thái zhesen (app `zhesen`, `zhesen-pipeline`, artifact `zhesen-sdd`).
- Vault: riêng cho zhesen tại `C:\Users\Hiep\Documents\zhesen-brain`, đứng ngoài các repo.
- Hook: mức mạnh (typecheck + lint + chạy test liên quan + nhắc verify trước khi tuyên bố xong).
- Thứ tự: theo phase A, B, C, D.

## Kế hoạch theo phase và tiêu chí hoàn thành

Tiến độ (cập nhật 2026-07-01):
- Phase A: XONG. Spine zhesen (AGENTS.md 86 dòng) và zhesen-pipeline (63 dòng) đã viết và
  tinh chỉnh bằng bằng chứng thật từ transcript (xem `research/2026-07-01-claude-recurring-mistakes.md`).
- Phase B: XONG. Hai hook trong `zhesen/.claude/settings.json` (PostToolUse eslint file vừa
  sửa; Stop gate chặn khi tsc/eslint/test liên quan fail). Đã pipe-test đủ đường sạch/lỗi/chặn.
- Phase C: XONG (vault + seed + context-loading verified). Vault `C:\Users\Hiep\Documents\zhesen-brain`
  (index/wiki/lessons/raw/outputs) đã seed. Đã verify bằng phiên `claude -p` thật: phiên mới
  trong zhesen tự nạp spine + auto-memory và đọc được vault. LƯU Ý: hook và additionalDirectories
  chỉ kích hoạt khi workspace zhesen được TRUST (bấm trust dialog lần mở đầu). Obsidian MCP: recipe
  ở `zhesen-brain/outputs/obsidian-mcp-setup.md`, cần thao tác Obsidian của người dùng, chưa verify.
- Phase D: CHƯA. Vòng lessons + coding cải tiến (roadmap F1..F12).

### Phase A: L1 Spine
- A1 (zhesen): viết rule thật vào `AGENTS.md` (CLAUDE.md import sẵn AGENTS.md, cross-tool).
  Done khi: AGENTS.md có rule cứng + gotcha version + bản đồ kiến trúc + verify gate,
  dưới ~150 dòng, mỗi dòng qua được câu hỏi "bỏ đi có gây lỗi không".
- A2 (zhesen-pipeline): khảo sát nhanh rồi viết CLAUDE.md cho repo Python.
  Done khi: pipeline có rule chạy/test, gotcha (Gemini retry, encoding), bản đồ.

### Phase B: L2 Hook
- Thêm `zhesen/.claude/settings.json` với PostToolUse(Write|Edit): typecheck + lint file
  vừa sửa, chạy test liên quan, đẩy lỗi vào context. Cân nhắc nhắc verify ở Stop.
  Done khi: pipe-test hook chạy đúng và chứng minh hook bắt được lỗi cố ý.

### Phase C: L3 Obsidian vault + MCP
- Tạo vault `zhesen-brain` (raw/ wiki/ outputs/ lessons/), seed từ docs/superpowers,
  zhesen-sdd, và bản đồ kiến trúc. Dựng Obsidian MCP, verify nối được vào Claude Code.
  Done khi: mở được trong app Obsidian, Claude đọc/ghi được, MCP query được (đã verify).

### Phase D: Vòng lessons + coding cải tiến
- Chốt cơ chế ghi/chưng cất lesson. Sau đó bắt đầu coding theo roadmap F1..F12
  (`docs/superpowers/specs/2026-06-20-zhesen-improvement-roadmap.md`), mỗi fix theo
  spec/plan/implement/review và verify gate.

## Rủi ro và đánh đổi

- Hook mạnh thêm độ trễ mỗi lần sửa; chấp nhận để đổi lấy an toàn. Sẽ giữ phạm vi hẹp
  (chỉ file vừa sửa, test liên quan) để không quá chậm.
- Obsidian MCP là mảnh chuyển động phải bảo trì; vault vẫn dùng được bằng công cụ file
  gốc nếu MCP hỏng, nên không phải single point of failure.
- Rule trùng lặp giữa AGENTS.md và managed block của Next.js: chấp nhận lặp lại có chủ
  đích với rule hay bị vi phạm nhất (đọc docs Next.js 16 trước khi code).

## Định nghĩa "xong" tổng thể

Một agent làm việc trên zhesen có rule luôn nạp, có verify gate tự động chặn regression,
có second-brain tra cứu được tri thức ecosystem, và một vòng học từ lỗi để rule ngày càng
chính xác. Sau đó tiếp tục coding cải tiến theo roadmap.
