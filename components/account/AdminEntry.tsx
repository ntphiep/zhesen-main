import Link from 'next/link'
import { LinkPending } from '@/components/ui/LinkPending'

/** The only way into /admin from the site, drawn by /account for an admin profile. The
 *  console itself is gated on the server and in the database; this decides a link. */
export function AdminEntry() {
  return (
    <section className="rounded-xl border border-black/15 px-4 py-4">
      <h2 className="text-lg font-semibold">Quản trị hệ thống</h2>
      <p className="mt-1 text-sm text-black/60">
        Tài khoản này có quyền quản trị. Bảng điều khiển cho xem trạng thái máy chủ, cấu trúc dữ liệu và
        quản lý tài khoản, nội dung.
      </p>
      <Link
        href="/admin"
        prefetch={false}
        className="mt-3 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/85"
      >
        Mở bảng điều khiển
        <LinkPending />
      </Link>
    </section>
  )
}
