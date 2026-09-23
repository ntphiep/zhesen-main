import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { awsHealthConfig, getHealth, type Health } from '@/lib/admin/aws'
import { HealthPanel } from '@/components/admin/HealthPanel'

export const metadata = { title: 'Máy chủ · Quản trị' }

export default async function AdminHealthPage() {
  const supabase = await createClient()
  await requireAdmin(supabase)

  const cfg = awsHealthConfig()
  if (!cfg) {
    return <p className="text-sm text-black/60">Chưa cấu hình quyền đọc AWS cho bản triển khai này (AWS_ROLE_ARN).</p>
  }

  let health: Health
  try {
    health = await getHealth(cfg)
  } catch (e) {
    // The error name (AccessDenied, ExpiredToken) says what to fix; the message can carry ARNs.
    const name = e instanceof Error ? e.name : 'Error'
    return <p className="text-sm text-red-600">Không đọc được trạng thái từ AWS ({name}).</p>
  }
  return <HealthPanel health={health} />
}
