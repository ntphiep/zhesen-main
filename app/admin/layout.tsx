import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { AdminNav } from '@/components/admin/AdminNav'

export const metadata = { title: 'Quản trị', robots: { index: false, follow: false } }

/**
 * The shell of every admin page. The gate here decides the first load; each page calls
 * `requireAdmin` again because a layout does not re-render on client navigation, and the
 * `admin.*` functions check the role a third time in the database.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  await requireAdmin(supabase)
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10 lg:py-10">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <p className="hidden px-3 pb-5 text-sm font-semibold lg:block">Bảng điều khiển</p>
        <AdminNav />
      </aside>
      <main className="mt-5 min-w-0 lg:mt-0">{children}</main>
    </div>
  )
}
