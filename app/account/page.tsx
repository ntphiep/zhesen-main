import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { accountKind } from '@/lib/auth/account'
import { getProfile } from '@/lib/auth/profile'
import { getWordlistStats } from '@/lib/wordlist/stats'
import { AccountSettings } from '@/components/account/AccountSettings'
import { AdminEntry } from '@/components/account/AdminEntry'

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

  const [profile, stats] = await Promise.all([
    getProfile(supabase, user.id), getWordlistStats(supabase),
  ])

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="text-sm text-black/50 hover:underline">← Trang chủ</Link>
      <h1 className="mt-3 text-3xl font-bold">Tài khoản</h1>
      <p className="mt-1 text-sm text-black/60">
        Sổ tay gắn với tài khoản này chứ không phải với trình duyệt.
      </p>
      {profile?.role === 'admin' && <div className="mt-8"><AdminEntry /></div>}
      <div className="mt-8">
        <AccountSettings
          email={user.email}
          profile={profile}
          stats={stats}
          joinedAt={user.created_at ?? null}
        />
      </div>
    </main>
  )
}
