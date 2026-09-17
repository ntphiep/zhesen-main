# Vì sao mọi trang đều chậm, và cái gì đã sửa

Đo ngày 17/09/2026 từ Hà Nội, trên `https://zhesen-main.vercel.app`. Edge của
Vercel trả lời từ `hkg1`, function chạy ở `icn1`, database ở `ap-northeast-2`.

Sàn mạng của máy đo là **115 tới 120 ms**: đó là thời gian lấy một tệp tĩnh đã
nằm sẵn trong CDN (`/icon.svg`). Mọi con số dưới đây phải đọc so với sàn đó, chứ
không so với 0.

Cách đo lại:

```bash
B=https://zhesen-main.vercel.app
curl -s -o /dev/null -w '%{time_total}\n' "$B/dictionary/en/hello"
curl -s -o /dev/null -D - "$B/dictionary/en/hello" | grep -i 'x-vercel-cache\|cache-control'
```

## Bốn nguyên nhân, đo được từng cái

**Trang từ điển không được cache ở đâu cả.** `/dictionary/[lang]/[id]`,
`/grammar/[lang]`, `/grammar/[lang]/[id]`, `/learn/[lang]` và
`/learn/[lang]/[level]` trả về `Cache-Control: private, no-cache, no-store` và
`X-Vercel-Cache: MISS` ở **mọi** lần truy cập, kể cả lần thứ mười vào cùng một
từ. Không trang nào trong số đó đọc cookie, header hay tham số truy vấn; chúng
chỉ đọc `unstable_cache`. Chúng "dynamic" vì một route segment động chưa khai báo
`generateStaticParams` thì không đủ điều kiện vào route cache, chứ không phải vì
có gì phụ thuộc vào request.

**Proxy chạy trên mọi request.** `proxy.ts` khớp mọi đường dẫn trừ `_next/static`
và vài đuôi ảnh, kể cả tệp trong `public/` và route tìm kiếm. Nó làm mới session,
mà chỉ sáu route đọc session ở phía server. Hai tệp tĩnh cùng được CDN trả về:
`/robots.txt`, bị khớp, mất 178 ms; `/icon.svg`, được loại trừ nhờ luật đuôi tệp,
mất 115 ms.

**Header nạp trước bốn trang cần tài khoản.** `Link` của Next nạp trước ngay khi
vào khung nhìn, và header nằm trong khung nhìn của mọi trang. Mở `/dictionary`
bắn ra mười ba request nạp trước, trong đó có `/practice`, `/wordlist`, `/login`
và `/register`: bốn lần render mà mỗi lần hỏi Supabase, cho một người có thể
không mở cái nào.

**Trình duyệt hỏi máy chủ xác thực xem nên vẽ link nào.** `useAccount` gọi
`auth.getUser()`, là một vòng tới máy chủ auth ở `ap-northeast-2`. Hai component
dùng hook này trên một trang từ vựng, nên một lần mở trang tốn hai vòng như vậy
trước khi vẽ được nút lưu.

Một nguyên nhân nhỏ hơn: Geist Mono khai báo trong root layout nên mọi trang tải
nó, trong khi `font-mono` được dùng ở đúng một chỗ, dòng cấu trúc của một điểm
ngữ pháp.

## Đã sửa gì

| Nguyên nhân | Cách sửa | Tệp |
| --- | --- | --- |
| Trang không vào được route cache | `generateStaticParams` rỗng cho ba route sâu, liệt kê ba ngôn ngữ cho hai route hub, `revalidate = 3600` cho cả năm | năm `page.tsx` dưới `app/dictionary` và `app/grammar`, `app/learn` |
| Proxy chạy khắp nơi | matcher chỉ còn `/account`, `/wordlist`, `/practice`, `/login`, `/register`, `/auth` | `proxy.ts` |
| Nạp trước trang cần tài khoản | `prefetch={false}` cho bốn link trong header, hai cửa đăng nhập và cặp link cuối form | `components/layout/SiteHeader.tsx`, `components/account/AccountLink.tsx`, `components/account/AuthForm.tsx`, `components/lookup/AddToWordlistButton.tsx`, `components/learn/LevelWordList.tsx` |
| Hai vòng tới máy chủ auth mỗi trang | `getSession()` thay `getUser()` trong trình duyệt | `lib/hooks/useAccount.ts` |
| `/practice` gác hai lần | `createClient` và phiên đọc được ghi nhớ bằng React `cache` trong một request | `lib/supabase/server.ts`, `lib/auth/guard.ts` |
| Nạp một font cho một dòng | dùng stack monospace của máy | `app/layout.tsx`, `app/globals.css` |
| Bấm gợi ý đầu tiên phải chờ cả trang | nạp trước đúng dòng bàn phím đang đứng | `components/search/SearchBox.tsx` |

`getSession` thay `getUser` chỉ đúng ở phía trình duyệt, và chính thư viện đã cài
nói vậy: "Should always be used when checking for user authorization on the
server. On the client, you can instead use `getSession().session.user` for faster
results" (`node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts`, mục
`getUser`). Không có gì ở trình duyệt cấp quyền: `requirePermanentAccount` vẫn
gọi `getUser` trên server và RLS vẫn quyết định mỗi truy vấn trả về gì.

## Kết quả

Bốn lần đo mỗi đường dẫn, sau khi đã làm nóng, đơn vị ms.

| Đường dẫn | Trước | Sau | Cache sau |
| --- | --- | --- | --- |
| `/dictionary/en/hello`, lần thứ hai trở đi | 258 tới 314 | 128 tới 144 | HIT |
| `/dictionary/en/hello`, lần đầu, function nguội | tới 4.513 | 405 | MISS rồi HIT |
| `/dictionary/zh/学习` | 554 | 124 tới 133 | HIT |
| `/learn/zh/HSK1` | 248 tới 279 | 123 tới 132 | HIT |
| `/grammar/zh` | chưa đo | 123 tới 150 | HIT |
| `/dictionary/search?q=dog` | 164 tới 195 | 123 tới 135 | HIT |
| `/practice` | 514 tới 524 | 232 tới 250 | MISS |
| `/login` | 224 tới 226 | 238 tới 242 | MISS |
| `/` | 171 tới 177 | 131 tới 145 | HIT |
| `/grammar` | 176 tới 180 | 117 tới 133 | HIT |
| `/dictionary` | 241 tới 254 | 182 tới 226 | MISS |
| `/robots.txt` | 178 | 138 | HIT |

Gõ "dictionary" từng chữ một, mười tiền tố: 10.581 ms trước, 2.342 ms sau. Phần
lớn khoản chênh không phải là truy vấn nhanh hơn mà là những đợt nguội nhiều giây
biến mất, vì mỗi request tìm kiếm không còn phải đánh thức proxy. Truy vấn chưa
ai gõ bao giờ vẫn tốn 256 tới 565 ms, và đó là Supabase, không phải Vercel.

Một lần mở `/dictionary/en/dog` trên production, đo bằng Navigation Timing:
`TTFB` 117 ms, `first-contentful-paint` 516 ms, `load` 504 ms, **0** lần gọi
`/auth/v1/user` (trước là 2), **0** lần nạp trước `/register` (trước là 3), 3 tệp
font 53 kB (trước là 4 tệp 76 kB).

## Chưa làm, và vì sao

`/dictionary` vẫn dynamic, 182 tới 226 ms. Nó đọc `searchParams` để nhận `?q=` và
`?lang=`. Chuyển sang đọc ở trình duyệt bằng `useSearchParams` sẽ cho phép
prerender trang, nhưng `useSearchParams` trong một trang tĩnh bắt buộc phải nằm
trong `Suspense`, nên ô tìm kiếm sẽ vắng mặt trong HTML đầu tiên và chỉ hiện sau
khi hydrate. Đổi 55 ms lấy một ô tìm kiếm xuất hiện muộn trên chính trang để gõ
là không đáng.

`/practice`, `/login`, `/wordlist`, `/register`, `/account` vẫn dynamic và vẫn
230 tới 250 ms. Chúng đọc phiên đăng nhập thật, nên không có bản nào cache được.

287 kB JavaScript trên một trang từ vựng, 12 tệp. `supabase-js` nằm trong đó vì
`AddToWordlistButton` và `TappableText` import tĩnh `lib/supabase/client`.
Tách được bằng dynamic import giống cách `useAccount` đã làm, nhưng script của
Next đều `defer` nên nó không chặn lần vẽ đầu tiên; chưa đo được nó tốn bao nhiêu
trên máy yếu.
