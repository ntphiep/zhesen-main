---
paths:
  - "app/**"
  - "components/**"
  - "lib/**"
---

# Vietnamese interface copy

Every Vietnamese string a learner sees follows one voice: minimal. No form of address, no
explanation, only what happened and what to do next. The owner chose it in #68. The admin
area and `/rescue` are all English (#66) and are not covered here. `test/copy-style.test.ts`
enforces the rules it can measure; the rest are on the writer.

## Rules

1. One idea per sentence: what happened, then the next action. Drop any clause that explains
   why or how. A consequence the reader must know before a destructive action stays.
2. No form of address or politeness particle: no "bạn", "Vui lòng", "Hãy", "Xin", "nhé",
   "nha".
3. A failure a retry can fix is "Chưa <verb> được." plus the action, usually "Thử lại." A
   permanent state is "Không ...", as in "Không tìm thấy trang." An empty state is
   "Chưa có <thing>." plus the action.
4. A page description is one sentence that starts with a verb, never a list of nouns.
5. Vietnamese punctuation: no semicolon, no comma before "và" or "hoặc", no "&", no dash.
6. Active voice. No "bởi" as an English passive ("bởi vì" is fine), and no "được" standing
   in for "is done by".
7. Do not name internals: "máy chủ", "bản triển khai", "hệ thống", "FSRS", "RPC", "cache".
8. One word per concept, from the glossary. Write it as a Vietnamese learner says it, not as
   a translation of an English string.

## Glossary

| Concept | Use | Not |
| --- | --- | --- |
| CEFR or HSK level | trình độ | cấp độ |
| Delete | xóa | xoá |
| File | file | tệp |
| Review a saved word | ôn | ôn tập |
| Look up | tra | tra cứu |
| The learner's saved words | sổ tay | danh sách của bạn |
| A tag on a word | thẻ | nhãn |
| The card grid view of the wordlist | lưới | thẻ |
| The AI assistant | AI | trợ lý |

## Before and after

| Before | After |
| --- | --- |
| Không lưu được thay đổi. Vui lòng thử lại. | Chưa lưu được. Thử lại. |
| Chưa có từ nào. Bấm Thêm từ để bắt đầu. | Chưa có từ. Tra một từ để lưu. |
| Thêm vài từ vào sổ tay trước nhé. | Lưu thêm vài từ vào sổ tay. |
| Trang không dựng được. Tải lại giúp trong phần lớn trường hợp. | Chưa mở được trang. Tải lại trang. |
| Bản triển khai này chưa bật dịch cả đoạn. | Chưa hỗ trợ dịch cả đoạn. |
| Ôn tập theo lịch FSRS, kiểm tra, viết từ, nghe chép, ghép cặp và luyện nói. | Ôn từ đã lưu bằng nhiều cách. |
| Cấp độ ước lượng bởi hệ thống, không phải phân loại chính thức. | Trình độ do Zhesen ước lượng, không theo phân loại chính thức. |
| Xóa "${headword}" khỏi sổ tay? Tiến độ ôn tập của từ này mất theo. | Xóa "${headword}" khỏi sổ tay? Tiến độ ôn của từ này cũng mất. |

Short labels that already say one thing ("Thử lại", "Xóa", "Lưu") stay as they are. A test
that asserts a string changes in the same commit as the string, and only its literal.
