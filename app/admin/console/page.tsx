import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { awsHealthConfig, listDumps } from '@/lib/admin/aws'
import { PageHeader, Section } from '@/components/admin/Page'
import { RestorePanel, ShellConsole, SqlConsole } from '@/components/admin/Console'

export const metadata = { title: 'Console · Quản trị' }

type Dumps = Awaited<ReturnType<typeof listDumps>>

async function readDumps(): Promise<Dumps | null | 'error'> {
  const cfg = awsHealthConfig()
  if (!cfg) return null
  try {
    return await listDumps(cfg)
  } catch {
    return 'error'
  }
}

export default async function AdminConsolePage() {
  const supabase = await createClient()
  await requireAdmin(supabase)
  const dumps = await readDumps()

  if (dumps === null) {
    return (
      <div>
        <PageHeader title="Console" lead="SQL, lệnh shell và khôi phục bản dump, chạy trên máy chủ production qua SSM." />
        <p className="mt-6 text-sm text-black/60">Chưa cấu hình quyền AWS cho bản triển khai này (AWS_ROLE_ARN).</p>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Console"
        lead="SQL, lệnh shell và khôi phục bản dump, chạy trên máy chủ production qua SSM. Lệnh ghi và lệnh shell cần gõ lại tên, đăng nhập trong 10 phút gần nhất, và được ghi nguyên văn vào nhật ký."
      />
      <Section title="SQL">
        <SqlConsole />
      </Section>
      <Section title="Lệnh shell">
        <ShellConsole />
      </Section>
      <Section title="Khôi phục bản dump">
        {dumps === 'error' ? <p className="text-sm text-rose-700">Không đọc được danh sách bản dump từ S3.</p> : <RestorePanel dumps={dumps.slice(0, 14)} />}
      </Section>
    </div>
  )
}
