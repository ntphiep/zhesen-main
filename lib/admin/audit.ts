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
  delete_account: 'Delete account',
  merge_account: 'Merge accounts',
  update_sense: 'Edit sense',
  flag_entry: 'Flag entry',
  unflag_entry: 'Unflag entry',
  'infra.start': 'Start instance',
  'infra.stop': 'Stop instance',
  'infra.reboot': 'Reboot instance',
  'infra.restart': 'Restart container',
  'infra.backup': 'Backup now',
  'infra.resize': 'Change instance type',
  'infra.alert_channels': 'Change alert channels',
  'console.sql': 'Write SQL',
  'console.shell': 'Shell command',
  'console.restore': 'Restore dump',
  'console.learner_status': 'Hide or publish learner layer',
  'secret.reveal': 'Reveal secret',
  'secret.update': 'Change secret',
}
