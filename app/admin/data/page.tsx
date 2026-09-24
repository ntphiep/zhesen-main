import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { getDictionary } from '@/lib/admin/dictionary'
import { PageHeader } from '@/components/admin/Page'
import { TableDetail, TableIndex } from '@/components/admin/DataDictionary'

export const metadata = { title: 'Dữ liệu · Quản trị' }

export default async function AdminDataPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient()
  await requireAdmin(supabase)
  const sp = await searchParams
  const dict = await getDictionary(supabase)

  if (typeof sp.table === 'string') {
    const table = dict.tables.find((t) => t.id === sp.table)
    if (!table) notFound()
    return <TableDetail t={table} />
  }

  return (
    <div>
      <PageHeader
        title="Dữ liệu"
        lead="Mọi bảng của dự án trong ba schema: bảng chứa gì, số dòng đếm chính xác, dung lượng kể cả index. Chọn một bảng để xem từng cột, quan hệ và index. Mô tả lấy từ comment trong database, cùng nội dung Studio hiển thị."
        readAt={new Date()}
      />
      <div className="mt-6"><TableIndex dict={dict} /></div>
    </div>
  )
}
