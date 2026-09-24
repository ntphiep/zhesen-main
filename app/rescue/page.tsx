import { cookies } from 'next/headers'
import { RESCUE_COOKIE } from '@/lib/admin/rescue'
import { RescuePanel } from '@/components/admin/RescuePanel'

export const metadata = { title: 'Cứu hộ máy chủ', robots: { index: false, follow: false } }

/** Outside proxy.ts's matcher and never calls Supabase, so it opens while the database is
 *  off. The cookie is only a hint here; /api/rescue verifies it on every call. */
export default async function RescuePage() {
  const unlocked = (await cookies()).has(RESCUE_COOKIE)
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Cứu hộ máy chủ</h1>
      <p className="mt-2 text-sm text-black/60">
        Dùng khi máy chủ database đã tắt và bảng điều khiển không mở được. Mỗi lần mở khoá và mỗi lần bật máy đều gửi email cho chủ dự án.
      </p>
      <div className="mt-6">
        <RescuePanel unlocked={unlocked} />
      </div>
    </main>
  )
}
