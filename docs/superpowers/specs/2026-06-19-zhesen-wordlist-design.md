# Thiết kế: Wordlist cá nhân (Phase 1)

**Mục tiêu:** Xây một nơi để người dùng lưu các từ đã học (thêm, sửa, xóa, ghi chú), với thông tin từ vựng đầy đủ và phát âm, lấy tự động từ kho từ điển `lex`. Đồng thời sửa các nguyên nhân gốc khiến UI hiện tại phản hồi chậm.

**Kiến trúc:** Bảng `public.user_words` lưu wordlist theo từng người dùng (RLS chặt). Khi thêm từ, người dùng tìm trong từ điển `lex` và hệ thống tự điền (snapshot) IPA/nghĩa/ví dụ/audio vào dòng, đồng thời giữ `entry_id` trỏ về `lex` để xem chi tiết đầy đủ. Trang wordlist render danh sách ban đầu phía server rồi giao cho một Client Component xử lý thêm/sửa/xóa theo kiểu optimistic (phản hồi tức thì).

**Tech Stack:** Next.js 16.2.9 (App Router), React 19.2, Supabase (`@supabase/ssr`, `@supabase/supabase-js`), Tailwind CSS 4, Zod 4, Vitest + Testing Library.

## Global Constraints

- Đây KHÔNG phải Next.js như trong dữ liệu huấn luyện. Trước khi viết code đụng tới caching, async request API, hay route conventions, PHẢI đọc guide tương ứng trong `node_modules/next/dist/docs/` và tuân theo bản 16.2.9.
- Mọi khẳng định về dữ liệu phải có bằng chứng từ DB/code. Số liệu độ phủ dữ liệu (đã truy vấn live ngày 2026-06-19): en 101 từ (nghĩa VI 100%, IPA 100%, ví dụ 100%, audio 53%, level 15%); es 100 từ (nghĩa VI 0%, chỉ nghĩa Anh); zh 30 từ (nghĩa VI 0%, có Hán-Việt/pinyin/bộ/nét).
- App dùng đăng nhập ẩn danh (`signInAnonymously` trong `proxy.ts`), nên `auth.uid()` luôn tồn tại và mọi request chạy dưới role `authenticated`.
- Dữ liệu từ điển `lex` và bảng nội dung công khai là dữ liệu công cộng (nguồn mở Wiktionary/CC-CEDICT/Unihan/Cambridge), không chứa dữ liệu cá nhân.
- TDD: mỗi đơn vị logic có test (Vitest đã cấu hình sẵn). Commit nhỏ, thường xuyên. Không push lên origin khi chưa được yêu cầu.

---

## 1. Bối cảnh hiện tại

App hiện tối giản: `app/page.tsx` (chọn ngôn ngữ), `app/learn/[lang]` (dashboard bài học), lesson runner, review SRS. Tầng dữ liệu (`lib/content/SupabaseContentSource.ts`) đọc bảng cũ `public.vocab_items` và chỉ hiển thị `term`/`reading`/`translation.vi`. Dữ liệu giàu nằm ở schema `lex` (đã expose Data API qua migration 0005), chưa được app dùng.

Nguyên nhân gốc gây chậm (đã xác minh trong code):
1. Mỗi `createClient()` trong `lib/supabase/server.ts` gọi `cookies()`, ép mọi trang render động và **tắt toàn bộ cache**; mỗi lần điều hướng là query Supabase lại từ đầu.
2. `getLessons`/`getLesson` query tuần tự kiểu waterfall (lessons rồi lesson_vocab).
3. `LangDashboard` và `ReviewSession` gọi `auth.getUser()` qua mạng rồi query trong `useEffect` phía client (waterfall sau hydration).
4. `getVocabByLang` lấy toàn bộ vocab làm pool đáp án nhiễu, không giới hạn; `countDue` đổ toàn bộ hàng về để đếm trong JS.
5. `proxy.ts` gọi `auth.getUser()` (qua mạng) trên mọi request.

## 2. Mô hình dữ liệu

### 2.1. Bảng `public.user_words`

Snapshot + liên kết: chép thông tin từ điển vào dòng để người dùng sửa/ghi chú tự do, giữ `entry_id` để truy ngược về `lex`.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK, default `gen_random_uuid()` | |
| `user_id` | uuid NOT NULL, default `auth.uid()` | references `auth.users(id)` on delete cascade |
| `lang` | text NOT NULL | `'en' | 'es' | 'zh'`, có CHECK |
| `entry_id` | text NULL | references `lex.entries(id)` on delete set null; null nếu thêm thủ công |
| `headword` | text NOT NULL | từ hiển thị |
| `reading` | text NULL | pinyin/phiên âm phụ |
| `ipa` | text NULL | |
| `pos` | text NULL | từ loại |
| `meaning_vi` | text NULL | nghĩa tiếng Việt, người dùng sửa được |
| `meaning_en` | text NULL | nghĩa tiếng Anh (hữu ích cho zh/es chưa có nghĩa VI) |
| `level` | text NULL | CEFR/HSK |
| `example` | text NULL | câu ví dụ / ngữ cảnh nguồn |
| `example_translation` | text NULL | dịch câu ví dụ |
| `audio_url` | text NULL | file audio thật nếu có |
| `notes` | text NULL | ghi chú cá nhân |
| `status` | text NOT NULL, default `'new'` | `'new' | 'learning' | 'known'`, có CHECK |
| `tags` | text[] NOT NULL, default `'{}'` | nhãn tùy chọn |
| `created_at` | timestamptz NOT NULL, default `now()` | |
| `updated_at` | timestamptz NOT NULL, default `now()` | trigger tự cập nhật khi UPDATE |

Index: `(user_id, created_at desc)` cho list; `(user_id, lang)` cho lọc theo ngôn ngữ.

### 2.2. RLS cho `user_words`

Enable RLS. Bốn policy cho role `authenticated`, tất cả `using (user_id = auth.uid())` và `with check (user_id = auth.uid())`:
- SELECT own rows
- INSERT own rows
- UPDATE own rows
- DELETE own rows

### 2.3. Hỗ trợ đọc từ điển công khai + cache (sửa gốc chậm)

Để dùng client đọc nội dung **không đụng cookie** (bật được cache) cho dữ liệu công khai, migration mở quyền đọc cho role `anon` trên:
- Các bảng `lex.*` (hiện chỉ có policy SELECT cho `authenticated`): thêm policy SELECT cho `anon` (`using (true)`), và `grant select` đã có từ 0005.
- Các bảng nội dung công khai trong `public` mà trang chủ/dashboard đọc (`languages`, `lessons`, `lesson_vocab`, `vocab_items`): xác minh RLS hiện trạng trong lúc lập plan và thêm policy/grant SELECT cho `anon` nếu thiếu.

Index phục vụ tìm từ khi thêm: index trên `lex.entries (lang, headword)` (hoặc index hỗ trợ `ILIKE` prefix) để search-as-you-type nhanh.

## 3. Tích hợp từ điển `lex`

Module đọc từ điển (`lib/dictionary/`):
- `searchEntries(lang, query, limit)`: query `lex.entries` lọc theo `lang` và `headword ILIKE`, kèm nghĩa chính (sense `sense_order` nhỏ nhất), IPA, level, audio để xem trước. Dùng cho hộp thêm từ.
- `getEntryDetail(entryId)`: lấy đầy đủ một entry (tất cả senses, pronunciations theo accent, examples, lex_relations). Dùng cho "xem chi tiết". Ưu tiên một truy vấn lồng nhau của PostgREST (`select` embedding theo FK) thay vì nhiều query; cấu trúc FK chính xác sẽ xác minh khi lập plan.

Ánh xạ khi thêm từ từ từ điển vào `user_words`: `headword←headword`, `ipa←pronunciation.ipa` (ưu tiên `en-US` rồi `en-UK`), `pos←sense.pos`, `meaning_vi←sense.gloss_vi`, `meaning_en←sense.gloss_en`, `level←entries.level`, `example/example_translation←example.text/translation_vi`, `audio_url←pronunciation.audio_url`, `entry_id←entries.id`, `lang←entries.lang`.

## 4. Tính năng (Phase 1)

1. **Bảng wordlist** với cột: chọn (checkbox) / Từ / IPA / Từ loại / Nghĩa / Cấp độ / Ngữ cảnh (ví dụ) / Ngày thêm / Audio / Thao tác (xem/sửa/xóa). Có hai chế độ xem **Bảng** và **Thẻ**, lưu lựa chọn vào localStorage.
2. **Thêm từ**: hộp thoại có search-as-you-type trong `lex` (tự điền mọi trường), và tab "thêm thủ công" cho từ chưa có trong từ điển.
3. **Sửa từ**: hộp thoại sửa nghĩa, ghi chú, trạng thái, ví dụ, tag.
4. **Xóa**: xóa từng từ (có xác nhận) và chọn nhiều rồi xóa hàng loạt.
5. **Tìm / sắp xếp / lọc**: tìm trong wordlist (theo từ và nghĩa), sắp xếp theo cột (từ, ngày thêm, cấp độ), lọc theo ngôn ngữ và theo trạng thái học.
6. **Xem chi tiết**: mở rộng dòng hoặc nút info, hiện tất cả nghĩa + ví dụ + từ liên quan lấy từ `lex` (qua `getEntryDetail`); với từ thủ công thì hiện đúng các trường người dùng nhập.
7. **Audio**: component phát file thật khi có `audio_url`, ngược lại đọc bằng `speechSynthesis` của trình duyệt với đúng `lang`.
8. **Cá nhân hóa**: ghi chú, trạng thái học (mới/đang học/đã thuộc), tag.
9. **Phản hồi tức thì**: thêm/sửa/xóa cập nhật UI ngay (optimistic) rồi đồng bộ Supabase, rollback nếu lỗi.

### Phase 2 (ngoài phạm vi bản này)
Tích hợp ôn tập SRS phóng thẳng từ wordlist, AI flashcard / AI tạo bài đọc, export, thư mục/bộ sưu tập, đồng bộ tài khoản thật, nghĩa tiếng Việt cho zh/es (chờ crawl hanzii/babla).

## 5. Định tuyến và component

- Route `/wordlist` (Server Component `app/wordlist/page.tsx`): lấy wordlist của người dùng phía server (client có cookie/auth) và truyền xuống.
- `app/wordlist/WordlistClient.tsx` (`'use client'`): bảng/thẻ tương tác, search/sort/filter, chọn nhiều, CRUD optimistic qua browser supabase client.
- `components/wordlist/AddWordDialog.tsx`: search từ điển + thêm thủ công.
- `components/wordlist/EditWordDialog.tsx`: sửa từ.
- `components/wordlist/WordDetail.tsx`: chi tiết một từ (gọi `getEntryDetail` khi mở).
- `components/AudioButton.tsx`: audio thật + TTS fallback.
- Thêm liên kết "Danh sách từ" từ `app/page.tsx`.

Tầng lib:
- `lib/wordlist/types.ts` (kiểu `UserWord` + Zod schema), `lib/wordlist/store.ts` (CRUD `user_words`).
- `lib/dictionary/types.ts`, `lib/dictionary/search.ts` (search + detail từ `lex`).
- `lib/supabase/content.ts`: client đọc nội dung công khai không đụng cookie (anon key), bọc cache của Next 16 (API cache chính xác xác minh trong plan).

## 6. Luồng dữ liệu

- **Tải trang wordlist:** Server Component đọc `user_words` của người dùng (một query, sắp xếp sẵn) rồi render bảng tĩnh; Client Component hydrate để tương tác.
- **Thêm từ:** search `lex` chạy client-side (browser client, đã authenticated qua phiên ẩn danh) để gõ tới đâu thấy tới đó; chọn từ thì INSERT `user_words` (optimistic), hoặc submit form thủ công.
- **Sửa/xóa:** UPDATE/DELETE optimistic qua browser client; rollback nếu lỗi.
- **Xem chi tiết:** gọi `getEntryDetail(entry_id)` khi mở (lazy), cache kết quả trong phiên.

## 7. Hiệu năng (sửa gốc chậm, có giới hạn)

Trong phạm vi bản này, sửa đúng các nguyên nhân đã xác minh ở mục 1:
1. Tách client đọc nội dung công khai không đụng `cookies()` (mục 5, `lib/supabase/content.ts`) và bọc cache; chuyển các trang chỉ đọc dữ liệu công khai (home, learn dashboard) sang dùng client này để hết render động vô ích.
2. Gộp waterfall trong `getLessons`/`getLesson` thành một query lồng nhau.
3. Dời tính toán đếm thẻ đến hạn lên server, truyền prop xuống `LangDashboard`, bỏ `useEffect` waterfall; `ReviewSession` tương tự nếu khả thi gọn.
4. `getVocabByLang` cho pool đáp án: thêm `limit` và chỉ chọn cột cần.
5. `countDue` dùng count phía DB (`head: true`).

Không mở rộng ngoài các điểm trên (YAGNI). `proxy.ts` đổi `getUser()` sang kiểm tra session cục bộ chỉ thực hiện nếu an toàn và rõ ràng; nếu có rủi ro thì ghi nhận để xử lý riêng.

## 8. Audio

`AudioButton`: nếu có `audio_url` thì phát `new Audio(url)` (file `.ogg` từ Wikimedia); nếu lỗi hoặc không có thì gọi `speechSynthesis.speak` với `SpeechSynthesisUtterance(headword)` đặt `lang` theo ngôn ngữ (`en-US`, `es-ES`, `zh-CN`). Trạng thái đang phát có phản hồi trực quan. Phủ 100% từ.

## 9. Bảo mật và lưu ý phiên ẩn danh

- `user_words` bảo vệ bằng RLS theo `auth.uid()`; người dùng chỉ thao tác trên từ của mình.
- Wordlist gắn với phiên ẩn danh hiện tại; xóa cookie hoặc đổi máy là không thấy lại. Đồng bộ đa thiết bị cần tài khoản thật (Phase 2). Ghi rõ giới hạn này cho người dùng ở chỗ phù hợp trên UI.
- Mở quyền đọc `anon` chỉ áp cho dữ liệu từ điển/nội dung công khai, không áp cho `user_words`.

## 10. Kiểm thử

- `lib/wordlist/store`: ánh xạ row ↔ `UserWord`, build payload INSERT/UPDATE (mock supabase).
- `lib/dictionary/search`: ánh xạ kết quả search và detail từ `lex` (mock supabase), chọn IPA/nghĩa chính đúng thứ tự.
- `AudioButton`: có `audio_url` thì phát file; không có thì gọi TTS (mock `Audio` và `speechSynthesis`).
- `WordlistClient`: render đủ cột; thao tác thêm/sửa/xóa cập nhật danh sách (mock store); lọc/sắp xếp đúng.
- Giữ toàn bộ test hiện có xanh.

## 11. Hạng mục cần xác minh khi lập plan

- API cache đúng của Next 16.2.9 (`'use cache'` + `cacheLife`/`cacheTag` hay `unstable_cache`) qua `node_modules/next/dist/docs/`.
- RLS/grant hiện trạng của các bảng `public` công khai (`languages`, `lessons`, `lesson_vocab`, `vocab_items`).
- Tên ràng buộc FK trong `lex` để dùng embedding lồng nhau của PostgREST (`getEntryDetail`); `examples` liên kết qua `entry_id` hay `sense_id` cho dữ liệu tiếng Anh.
- Cú pháp tạo modal/dialog phù hợp (dùng `<dialog>` gốc hay tự dựng) theo phong cách hiện có của codebase.
