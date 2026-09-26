import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { PageHeader } from '@/components/admin/Page'
import { ContainerBoard } from '@/components/admin/ContainerBoard'

export const metadata = { title: 'Containers · Admin' }

export default async function AdminContainersPage() {
  const supabase = await createClient()
  await requireAdmin(supabase)
  return (
    <div>
      <PageHeader title="Containers" />
      <div className="mt-6">
        <ContainerBoard />
      </div>
    </div>
  )
}
