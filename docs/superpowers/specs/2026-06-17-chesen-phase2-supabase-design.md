# Thiết kế Phase 2: Tích hợp Supabase (Chesen)

Ngày: 2026-06-17
Trạng thái: Bản thiết kế chờ duyệt
Tiền đề: Phase 1 (POC chạy local) đã hoàn tất, commit và push lên `github.com/ntphiep/chesen`.

## 1. Tổng quan và mục tiêu

Phase 2 chuyển Chesen từ chạy hoàn toàn cục bộ sang dùng Supabase làm backend thật. Nội dung học và tiến độ người dùng được lưu trên PostgreSQL của project `cvltsyoweddhpkomuevz` (region ap-northeast-2). Người dùng được cấp một phiên đăng nhập ẩn danh ngay từ lần đầu vào trang, và dữ liệu được bảo vệ bằng Row-Level Security.

Mục tiêu cốt lõi là thay phần lưu trữ mà **không đổi giao diện và logic học**, nhờ hai interface `ContentSource` và `ProgressStore` đã dựng ở Phase 1. Toàn bộ vòng học (chọn ngôn ngữ, bài học, trắc nghiệm, ôn flashcard) phải chạy y như Phase 1 nhưng dữ liệu nằm trên cloud và gắn với từng người dùng.

## 2. Phạm vi

### Có trong Phase 2

- Schema Supabase cho nội dung và tiến độ, kèm RLS.
- Đăng nhập ẩn danh tự động qua `@supabase/ssr`, phiên lưu trong cookie.
- Middleware Next.js tạo phiên ẩn danh trước khi render để server component đọc được nội dung.
- Hai cài đặt mới `SupabaseContentSource` và `SupabaseProgressStore` thay cho bản local.
- Seed nội dung Phase 1 lên Supabase.
- Validate dữ liệu đọc về bằng zod ở ranh giới.

### Không nằm trong Phase 2

- Nâng cấp phiên ẩn danh lên tài khoản email/OAuth (để Phase sau).
- Crawler/nhập nội dung tự động (Phase 3).
- Realtime, Storage, Edge Functions.
- Triển khai (deploy) lên hosting.

## 3. Quyết định kiến trúc đã chốt

1. **Nội dung chỉ cho người đã xác thực đọc** (kể cả người ẩn danh). Không đọc công khai. Hệ quả: server component cần một phiên, nên dùng `@supabase/ssr` với cookie và một middleware bootstrap phiên ẩn danh.
2. **Thay hẳn sang Supabase**, bỏ bản local trong app. Giữ lại phần logic thuần (thuật toán SRS, bộ sinh quiz, kiểu dữ liệu, zod schema) và hai interface. Gỡ `LocalContentSource`, `LocalProgressStore`, `kv.ts` cùng test của chúng.
3. Tái dùng hàm SRS thuần `review()` bên trong `SupabaseProgressStore` theo lối đọc rồi ghi (read-modify-write), giữ thuật toán là nguồn chân lý duy nhất.

## 4. Lược đồ cơ sở dữ liệu

Tạo bằng `apply_migration`. Bảng nội dung và bảng tiến độ tách bạch.

### Bảng nội dung

```sql
create table languages (
  code text primary key check (code in ('zh','es','en')),
  name text not null,
  native_name text not null,
  script text not null check (script in ('han','latin'))
);

create table vocab_items (
  id text primary key,
  lang text not null references languages(code),
  term text not null,
  reading text,
  translation jsonb not null,            -- { "vi": "..." }
  part_of_speech text,
  level text,
  examples jsonb,                        -- [{ sentence, reading, translation:{vi} }]
  audio text
);

create table lessons (
  id text primary key,
  lang text not null references languages(code),
  title text not null,
  description text not null default '',
  position int not null check (position > 0)
);

create table lesson_vocab (
  lesson_id text not null references lessons(id),
  vocab_id text not null references vocab_items(id),
  position int not null,
  primary key (lesson_id, vocab_id)
);
```

### Bảng tiến độ

```sql
create table srs_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  vocab_id text not null references vocab_items(id),
  lang text not null,
  interval_days int not null default 0,
  ease real not null default 2.5,
  reps int not null default 0,
  lapses int not null default 0,
  due_at timestamptz not null,
  last_reviewed_at timestamptz,
  primary key (user_id, vocab_id)
);

create table lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null references lessons(id),
  status text not null check (status in ('not_started','in_progress','completed')),
  completed_at timestamptz,
  primary key (user_id, lesson_id)
);
```

Ghi chú ánh xạ kiểu: `due_at`/`last_reviewed_at` lưu `timestamptz`; phía client SRS dùng epoch mili giây, nên lớp `SupabaseProgressStore` chịu trách nhiệm chuyển đổi qua lại (ISO ⇄ epoch ms).

## 5. Bảo mật và RLS

- Bật RLS trên cả sáu bảng.
- **Bảng nội dung** (`languages`, `vocab_items`, `lessons`, `lesson_vocab`): policy `SELECT` cho vai trò `authenticated`. Người dùng ẩn danh của Supabase mang vai trò `authenticated` (cờ `is_anonymous = true`), nên họ đọc được. Không có policy ghi từ client; nội dung chỉ được seed bằng migration (chạy quyền cao, bỏ qua RLS). *Cần xác minh lại bằng tài liệu Supabase rằng anonymous user có role `authenticated` khi bắt đầu code.*
- **Bảng tiến độ** (`srs_state`, `lesson_progress`): policy `SELECT/INSERT/UPDATE/DELETE` với điều kiện `user_id = auth.uid()`, cho vai trò `authenticated`. Mỗi người chỉ thao tác trên dữ liệu của chính mình.
- Khóa dùng ở client là publishable/anon key; mọi quyền thực tế do RLS quyết định.

## 6. Xác thực ẩn danh và phiên SSR

- Dùng `@supabase/ssr`: một client trình duyệt (`createBrowserClient`), một client server (`createServerClient` đọc cookie), và một middleware làm mới phiên.
- **Bootstrap phiên ẩn danh trong middleware:** mỗi request, middleware làm mới phiên rồi kiểm tra người dùng; nếu chưa có, gọi `signInAnonymously()` và ghi cookie phiên vào response. Nhờ vậy tới lúc server component render, cookie đã mang phiên, đọc nội dung được. Chỉ tạo phiên khi chưa có, tránh sinh người dùng ẩn danh mới mỗi request.
- Lần truy cập sau, cookie đã có phiên nên middleware bỏ qua bước đăng nhập.
- Bật tính năng "anonymous sign-ins" là một thiết lập Auth của project. Sẽ thử bật qua MCP; nếu MCP không hỗ trợ, bật thủ công trong dashboard (Authentication → Sign In / Providers → Anonymous). Đây là bước cần xác minh khi triển khai.

## 7. Các client Supabase

- `lib/supabase/client.ts`: `createBrowserClient` cho component client.
- `lib/supabase/server.ts`: `createServerClient` đọc/ghi cookie qua API của Next, dùng trong server component và route handler.
- `middleware.ts` (gốc dự án): làm mới phiên và bootstrap ẩn danh.

## 8. Cài đặt hai interface trên Supabase

- `SupabaseContentSource` (gọi được từ server): các truy vấn `getLanguages`, `getLessons(lang)`, `getLesson(id)`, `getVocab(ids)`, `getVocabByLang(lang)` ánh xạ sang truy vấn bảng. Giữ đúng chữ ký interface cũ; `getVocab(ids)` vẫn trả về theo thứ tự yêu cầu (sắp lại phía client sau khi truy vấn).
- `SupabaseProgressStore` (gọi từ client): `ensureCards`, `getDueCards`, `countDue`, `recordReview`, `getLessonProgress`, `setLessonProgress`. `recordReview` đọc dòng `srs_state` hiện tại, gọi `review()` (hàm SRS thuần) để tính trạng thái mới, rồi upsert. `ensureCards` upsert có điều kiện không ghi đè thẻ đã tồn tại (dùng `on conflict do nothing`).
- Singleton trong `lib/content/index.ts` và `lib/progress/index.ts` trả về bản Supabase. Bỏ nhánh local.

## 9. Seed nội dung

- Sinh câu lệnh `INSERT ... ON CONFLICT DO NOTHING` từ `content/*.json` cho `languages`, `vocab_items`, `lessons`, `lesson_vocab`.
- Chạy qua `apply_migration` (một migration seed riêng) để idempotent và có thể chạy lại.

## 10. Cấu hình môi trường

- Lấy `project_url` và publishable key qua MCP (`get_project_url`, `get_publishable_keys`), ghi vào `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `.env.local` đã nằm trong `.gitignore` của Next. Không commit khóa.

## 11. Validate ở ranh giới

- Khi đọc nội dung từ Supabase, validate lại bằng zod (tái dùng schema nội dung của Phase 1, điều chỉnh cho hình dạng dòng trả về).
- Thêm zod schema cho dòng `srs_state` và `lesson_progress` đọc về, để bắt dữ liệu sai hình dạng trước khi đưa vào logic.

## 12. Xử lý lỗi

- Lỗi mạng/Supabase không phản hồi: thông báo thân thiện, cho thử lại; không treo UI.
- Tạo phiên ẩn danh thất bại trong middleware: cho phép vào trang nhưng báo rõ chưa lưu được tiến độ, tránh vòng lặp đăng nhập.
- Truy vấn vi phạm RLS hoặc trả rỗng bất thường: log và hiển thị trạng thái rỗng an toàn thay vì crash.
- Dữ liệu đọc về sai schema (zod fail): báo lỗi rõ ràng, không nuốt lỗi.

## 13. Kiểm thử

- Giữ nguyên test thuần: SRS, `buildQuiz`, zod schema nội dung.
- Thêm zod schema test cho dòng tiến độ.
- `SupabaseProgressStore`: test phần logic (đặc biệt `recordReview` đọc-tính-ghi tái dùng `review()`) bằng client Supabase giả lập (mock).
- Phần tích hợp thật (RLS, phiên ẩn danh, vòng học đầu cuối) verify bằng trình duyệt như Phase 1, sau khi seed xong.
- Gỡ test của `LocalContentSource`/`LocalProgressStore` vì hai bản này bị bỏ.

## 14. Chuyển đổi và dọn dẹp

- Gỡ `lib/content/LocalContentSource.ts`, `lib/progress/LocalProgressStore.ts`, `lib/progress/kv.ts` và test tương ứng.
- Giữ `lib/content/types.ts`, `lib/content/schema.ts`, `lib/content/ContentSource.ts`, `lib/progress/types.ts`, `lib/progress/srs.ts`, `lib/progress/ProgressStore.ts`, `lib/quiz/buildQuiz.ts`.
- Thư mục `content/*.json` giữ lại làm nguồn cho seed.

## 15. Rủi ro và điểm cần xác minh

- **Vai trò của anonymous user** (`authenticated` hay không) quyết định policy đọc nội dung — phải xác minh bằng tài liệu/`search_docs` trước khi viết RLS.
- **Bật anonymous sign-ins**: có thể phải làm trong dashboard nếu MCP không hỗ trợ thiết lập Auth.
- **Bootstrap phiên trong middleware** cần cẩn thận để không sinh người dùng ẩn danh trùng lặp mỗi request.
- **Giảm độ phủ test**: bỏ bản local làm mất test contract của ProgressStore; bù lại bằng test mock cho bản Supabase và verify trình duyệt.
- Mỗi người dùng ẩn danh là một hàng trong `auth.users`; xóa cookie sẽ tạo người dùng mới và mất tiến độ cũ (chấp nhận được ở giai đoạn này).
