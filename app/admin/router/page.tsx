import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { PageHeader, Section } from '@/components/admin/Page'
import { RouterAccess } from '@/components/admin/RouterAccess'

export const metadata = { title: '9router · Admin' }

/** The password and the link load only after the guard, so neither is in this page's HTML. */
export default async function AdminRouterPage() {
  const supabase = await createClient()
  await requireAdmin(supabase)
  return (
    <div>
      <PageHeader title="9router" lead="The model router behind the assistant: provider logins, API keys, combos and usage." />
      <Section title="Dashboard">
        <RouterAccess />
      </Section>
    </div>
  )
}
