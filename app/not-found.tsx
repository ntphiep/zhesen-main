import Link from 'next/link'
import s from '@/components/layout/Status.module.css'

export const metadata = { title: 'Không tìm thấy trang' }

/**
 * Shown for an address that matches no route, and for every `notFound()` call --
 * an unknown language code, an entry id the dictionary does not hold. Without
 * this file Next serves its own black-and-white page, which drops the visitor
 * out of the site with no way back in.
 */
export default function NotFound() {
  return (
    <main className={`${s.page} font-ui`}>
      <div aria-hidden="true" className={s.mark}><i /><i /><i /></div>
      <p className={s.code}>404</p>
      <h1 className={s.title}>Không có trang này</h1>
      <p className={s.lede}>
        Địa chỉ sai hoặc trang không còn.
      </p>
      <div className={s.acts}>
        <Link href="/dictionary" prefetch={false} className={s.btn}>
          Dịch từ khác
        </Link>
        <Link href="/" className={s.ghost}>
          Về trang chủ
        </Link>
      </div>
    </main>
  )
}
