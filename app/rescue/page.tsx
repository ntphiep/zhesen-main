import { cookies } from 'next/headers'
import { RESCUE_COOKIE } from '@/lib/admin/rescue'
import { RescuePanel } from '@/components/admin/RescuePanel'

export const metadata = { title: 'Rescue', robots: { index: false, follow: false } }

/** Outside proxy.ts's matcher and never calls Supabase, so it opens while the database is
 *  off. The cookie is only a hint here; /api/rescue verifies it on every call. */
export default async function RescuePage() {
  const unlocked = (await cookies()).has(RESCUE_COOKIE)
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Rescue</h1>
      <p className="mt-2 text-sm text-black/60">
        Bật lại instance khi admin không mở được. Mỗi lần unlock và start đều gửi email.
      </p>
      <div className="mt-6">
        <RescuePanel unlocked={unlocked} />
      </div>
    </main>
  )
}
