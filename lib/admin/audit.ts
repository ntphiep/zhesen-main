import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from '@/lib/zod'

/** `public.admin_audit` (supabase/migrations/0058_admin_audit_log.sql), readable by an
 *  admin through RLS and written only by the admin functions. */
const auditRow = z.object({
  id: z.number(),
  at: z.string(),
  actor: z.string().nullable(),
  action: z.string(),
  target: z.string().nullable(),
  detail: z.record(z.string(), z.unknown()),
})

export interface AuditEntry {
  id: number
  at: string
  actor: string | null
  action: string
  target: string | null
  detail: Record<string, unknown>
}

export function parseAuditRow(row: unknown): AuditEntry {
  return auditRow.parse(row)
}

export async function listAudit(supabase: SupabaseClient, limit = 20): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('admin_audit')
    .select('id, at, actor, action, target, detail')
    .order('at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(parseAuditRow)
}

export const ACTION_LABELS: Record<string, string> = {
  delete_account: 'Xoá tài khoản',
  merge_account: 'Gộp tài khoản',
  update_sense: 'Sửa nghĩa',
  flag_entry: 'Đánh dấu mục từ',
  unflag_entry: 'Bỏ đánh dấu mục từ',
  'infra.start': 'Bật máy chủ',
  'infra.stop': 'Tắt máy chủ',
  'infra.reboot': 'Khởi động lại máy chủ',
  'infra.restart': 'Khởi động lại container',
  'infra.backup': 'Sao lưu ngay',
  'console.sql': 'Chạy SQL được ghi',
  'console.shell': 'Chạy lệnh shell',
  'console.restore': 'Khôi phục bản dump',
}
