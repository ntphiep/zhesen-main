import Link from 'next/link'

export const metadata = { title: 'Không tìm thấy trang' }

/**
 * Shown for an address that matches no route, and for every `notFound()` call --
 * an unknown language code, an entry id the dictionary does not hold. Without
 * this file Next serves its own black-and-white page, which drops the visitor
 * out of the site with no way back in.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-xl flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-sm font-medium tracking-wide text-black/40">404</p>
      <h1 className="mt-2 text-3xl font-bold">Không có trang này</h1>
      <p className="mt-3 text-black/60">
        Địa chỉ bạn mở không tồn tại, hoặc mục từ đã bị gỡ khỏi từ điển.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/dictionary"
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/80"
        >
          Dịch từ khác
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5"
        >
          Về trang chủ
        </Link>
      </div>
    </main>
  )
}
