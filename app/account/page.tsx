import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { accountKind } from '@/lib/auth/account'
import { getProfile } from '@/lib/auth/profile'
import { getWordlistStats } from '@/lib/wordlist/stats'
import { getReminder, pushConfig } from '@/lib/push/reminders'
import { AccountSettings } from '@/components/account/AccountSettings'
import { AdminEntry } from '@/components/account/AdminEntry'
import s from '@/components/account/Account.module.css'

export const metadata = { title: 'Tài khoản' }

export default async function AccountPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const kind = accountKind(data.user)

  // An anonymous visitor has nothing to manage here, and sending them to
  // /register rather than /login is the difference between keeping the words this
  // browser holds and abandoning them.
  const user = data.user
  if (kind !== 'permanent' || !user?.email) redirect(kind === 'anonymous' ? '/register' : '/login')

  const push = pushConfig()
  const [profile, stats, reminder] = await Promise.all([
    getProfile(supabase, user.id), getWordlistStats(supabase), push ? getReminder(supabase, user.id) : null,
  ])

  return (
    <main className={`${s.acc} mx-auto max-w-page px-6 pt-8 pb-16 font-ui`}>
      <Link href="/" className={s.back}><span aria-hidden="true">←</span>Trang chủ</Link>
      <h1 className={s.title}>Tài khoản</h1>
      <p className={s.lede}>
        Xem tiến độ và chỉnh cài đặt tài khoản.
      </p>
      {profile?.role === 'admin' && <div className="mt-8"><AdminEntry /></div>}
      <div>
        <AccountSettings
          email={user.email}
          profile={profile}
          stats={stats}
          joinedAt={user.created_at ?? null}
          reminders={push ? { publicKey: push.publicKey, userId: user.id, current: reminder } : undefined}
        />
      </div>
    </main>
  )
}
