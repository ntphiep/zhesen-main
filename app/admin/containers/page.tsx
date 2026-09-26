import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { PageHeader } from '@/components/admin/Page'
import { ContainerBoard } from '@/components/admin/ContainerBoard'
import { CONTAINERS } from '@/lib/admin/architecture'

export const metadata = { title: 'Containers · Admin' }

export default async function AdminContainersPage() {
  const supabase = await createClient()
  await requireAdmin(supabase)
  return (
    <div>
      <PageHeader title="Containers" />
      <div className="mt-6">
        <ContainerBoard roles={Object.fromEntries(CONTAINERS.map((c) => [c.container, c.role]))} />
      </div>
    </div>
  )
}
