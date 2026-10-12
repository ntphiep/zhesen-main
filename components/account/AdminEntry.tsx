import Link from 'next/link'
import { LinkPending } from '@/components/ui/LinkPending'
import { Setting } from './Setting'
import s from './Account.module.css'

/** The only way into /admin from the site, drawn by /account for an admin profile. The
 *  console itself is gated on the server and in the database; this decides a link. */
export function AdminEntry() {
  return (
    <Setting title="Quản trị">
      <div className={s.row}>
        <Link href="/admin" prefetch={false} className={s.btn}>
          Mở trang quản trị
          <LinkPending />
        </Link>
      </div>
    </Setting>
  )
}
