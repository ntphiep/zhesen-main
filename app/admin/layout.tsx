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
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-bold">Quản trị</h1>
      <AdminNav />
      <div className="mt-8">{children}</div>
    </main>
  )
}
