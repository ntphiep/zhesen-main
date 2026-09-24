import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { awsHealthConfig } from '@/lib/admin/aws'
import { getCosts, type Costs } from '@/lib/admin/control'
import { PageHeader, Section, Figure } from '@/components/admin/Page'
import { InfraControls } from '@/components/admin/InfraControls'

export const metadata = { title: 'Hạ tầng · Quản trị' }

/** Cost Explorer charges per request and refreshes about once a day, so six hours. */
const cachedCosts = unstable_cache(async (): Promise<Costs | null> => {
  const cfg = awsHealthConfig()
  return cfg ? getCosts(cfg) : null
}, ['admin-costs'], { revalidate: 21_600 })

async function readCosts(): Promise<Costs | null | 'error'> {
  try {
    return await cachedCosts()
  } catch {
    return 'error'
  }
}

const usd = (n: number) => `$${n.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function CostSection({ c }: { c: Costs | null | 'error' }) {
  if (c === null) return <p className="text-sm text-black/60">Chưa cấu hình quyền AWS cho bản triển khai này (AWS_ROLE_ARN).</p>
  if (c === 'error') return <p className="text-sm text-rose-700">Không đọc được Cost Explorer.</p>
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="Mức dùng tháng này" value={usd(c.usage)} note={`Từ ${c.from}, chưa trừ credit`} />
        <Figure label="Credit đã trừ" value={usd(-c.credits)} />
        <Figure label="Phải trả tới nay" value={usd(c.net)} />
        <Figure label="Ước tính cả tháng" value={c.monthUsage === null ? '–' : usd(c.monthUsage)} note="Mức dùng, theo dự báo của AWS" />
      </div>
      {c.byService.length > 0 && (
        <ul className="mt-3 divide-y divide-black/5 rounded-lg border border-black/10 text-sm">
          {c.byService.map((s) => (
            <li key={s.service} className="flex justify-between gap-3 px-4 py-2">
              <span>{s.service}</span>
              <span className="tabular-nums">{usd(s.usage)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default async function AdminInfraPage() {
  const supabase = await createClient()
  await requireAdmin(supabase)
  const costs = await readCosts()

  return (
    <div>
      <PageHeader
        title="Hạ tầng"
        lead="Bật, tắt và khởi động lại máy chủ EC2, khởi động lại từng container, chạy sao lưu. Mọi thao tác được ghi nhật ký và gửi email; thao tác làm gián đoạn cần gõ lại tên và đăng nhập trong 10 phút gần nhất."
      />
      <Section title="Máy chủ">
        <InfraControls />
      </Section>
      <Section title="Chi phí AWS" aside="Cập nhật mỗi 6 giờ">
        <CostSection c={costs} />
      </Section>
      <Section title="Khi máy chủ đã tắt">
        <p className="max-w-3xl text-sm text-black/70">
          Trang này cần database để kiểm tra quyền, nên không mở được khi máy chủ tắt. Lối vào cứu hộ ở{' '}
          <code className="font-mono">/rescue</code> chỉ cần khoá cứu hộ lưu trong SSM Parameter Store, và chỉ làm được hai việc: xem trạng thái và bật máy.
        </p>
      </Section>
    </div>
  )
}
