import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { AdminNav } from '@/components/admin/AdminNav'

export const metadata = { title: 'Admin', robots: { index: false, follow: false } }

/**
 * The shell of every admin page. The gate here decides the first load; each page calls
 * `requireAdmin` again because a layout does not re-render on client navigation, and the
 * `admin.*` functions check the role a third time in the database.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  await requireAdmin(supabase)
  return (
    <div className="bg-(--zs-bg) font-ui text-(--zs-ink)">
      <div className="mx-auto max-w-page px-4 py-6 sm:px-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10 lg:py-10">
        {/* Below the site header, which is sticky too. */}
        <aside className="lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:self-start lg:rounded-2xl lg:bg-(--tint-2) lg:p-2">
          <p className="hidden px-3 pt-2 pb-4 text-xs font-bold tracking-[0.08em] text-(--zs-soft) uppercase lg:block">Admin</p>
          <AdminNav />
        </aside>
        <main className="mt-5 min-w-0 lg:mt-0">{children}</main>
      </div>
    </div>
  )
}
