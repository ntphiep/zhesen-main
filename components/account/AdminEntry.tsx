import Link from 'next/link'
import { LinkPending } from '@/components/ui/LinkPending'
import s from './Account.module.css'

/** The only way into /admin from the site, drawn by /account for an admin profile. The
 *  console itself is gated on the server and in the database; this decides a link. */
export function AdminEntry() {
  return (
    <section className={s.panel} data-m="admin">
      <h2>Quản trị</h2>
      <p>Tài khoản này có quyền quản trị.</p>
      <Link
        href="/admin"
        prefetch={false}
        className={`${s.btn} mt-4`}
      >
        Mở trang quản trị
        <LinkPending />
      </Link>
    </section>
  )
}
