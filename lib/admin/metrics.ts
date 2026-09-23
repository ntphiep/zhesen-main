import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from '@/lib/zod'

/** `admin.metrics()` (supabase/migrations/0056_admin_metrics_rpc.sql). */
const metricsRow = z.object({
  tables: z.array(z.object({
    schema: z.string(),
    name: z.string(),
    rows: z.number(),
    bytes: z.number(),
  })),
  database_bytes: z.number(),
  relation_bytes: z.number(),
  pgroonga_indexes: z.number(),
  pgroonga_surplus: z.number(),
  accounts: z.object({ total: z.number(), permanent: z.number() }),
  lex_updated_at: z.string().nullable(),
})

export interface TableStat {
  schema: string
  name: string
  rows: number
  bytes: number
}

export interface Metrics {
  tables: TableStat[]
  databaseBytes: number
  relationBytes: number
  /** Files no pg_class row owns: PGroonga's, measured equal to the `pgrn*` files. */
  pgroongaBytes: number
  pgroongaIndexes: number
  pgroongaSurplus: number
  accounts: { total: number; permanent: number; anonymous: number }
  lexUpdatedAt: string | null
}

export function parseMetrics(raw: unknown): Metrics {
  const x = metricsRow.parse(raw)
  return {
    tables: x.tables,
    databaseBytes: x.database_bytes,
    relationBytes: x.relation_bytes,
    pgroongaBytes: Math.max(0, x.database_bytes - x.relation_bytes),
    pgroongaIndexes: x.pgroonga_indexes,
    pgroongaSurplus: x.pgroonga_surplus,
    accounts: {
      total: x.accounts.total,
      permanent: x.accounts.permanent,
      anonymous: x.accounts.total - x.accounts.permanent,
    },
    lexUpdatedAt: x.lex_updated_at,
  }
}

export async function getMetrics(supabase: SupabaseClient): Promise<Metrics> {
  const { data, error } = await supabase.schema('admin').rpc('metrics')
  if (error) throw error
  return parseMetrics(data)
}

/** The row count of one table, or null when the table is not in the list. */
export function rowsOf(m: Metrics, schema: string, name: string): number | null {
  return m.tables.find((t) => t.schema === schema && t.name === name)?.rows ?? null
}

const UNITS = ['B', 'kB', 'MB', 'GB']

/** Binary units: 1 MB here is 1,048,576 bytes, the unit `pg_size_pretty` uses. */
export function formatBytes(bytes: number): string {
  let v = bytes
  let i = 0
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024
    i += 1
  }
  return `${i === 0 ? v : v.toFixed(v < 10 ? 1 : 0)} ${UNITS[i]}`
}
