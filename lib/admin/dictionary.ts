import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from '@/lib/zod'

/** `admin.dictionary()` (supabase/migrations/0061_data_dictionary.sql). */
const columnRow = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean(),
  default: z.string().nullable(),
  generated: z.boolean(),
  identity: z.boolean(),
  primary_key: z.boolean(),
  comment: z.string().nullable(),
})

const foreignKeyRow = z.object({
  columns: z.array(z.string()),
  ref_schema: z.string(),
  ref_table: z.string(),
  ref_columns: z.array(z.string()),
  on_delete: z.enum(['cascade', 'set null', 'set default', 'restrict', 'no action']),
})

const tableRow = z.object({
  schema: z.string(),
  name: z.string(),
  comment: z.string().nullable(),
  rows: z.number(),
  /** Planner statistics rather than a count, for a table of 100,000 rows or more (0110). */
  estimated: z.boolean().default(false),
  bytes: z.number(),
  rls: z.boolean(),
  columns: z.array(columnRow),
  foreign_keys: z.array(foreignKeyRow),
  indexes: z.array(z.object({ name: z.string(), definition: z.string(), bytes: z.number() })),
})

const dictionaryRow = z.object({
  schemas: z.array(z.object({ name: z.string(), comment: z.string().nullable() })),
  tables: z.array(tableRow),
})

export interface DictColumn {
  name: string
  type: string
  nullable: boolean
  default: string | null
  generated: boolean
  identity: boolean
  primaryKey: boolean
  comment: string | null
  /** The table and column this one references, when it is a single-column foreign key. */
  references: { table: string; column: string; onDelete: string } | null
}

export interface DictLink {
  /** `schema.table` on the other side. */
  table: string
  columns: string[]
  refColumns: string[]
  onDelete: string
}

export interface DictTable {
  /** `schema.table`, the key the page links by. */
  id: string
  schema: string
  name: string
  comment: string | null
  rows: number
  /** True when `rows` is the planner's estimate, not a count. */
  estimated: boolean
  bytes: number
  rls: boolean
  columns: DictColumn[]
  /** Foreign keys this table holds. */
  references: DictLink[]
  /** Foreign keys other project tables hold on this one. */
  referencedBy: DictLink[]
  indexes: { name: string; definition: string; bytes: number }[]
}

export interface Dictionary {
  schemas: { name: string; comment: string | null }[]
  tables: DictTable[]
}

export function parseDictionary(raw: unknown): Dictionary {
  const x = dictionaryRow.parse(raw)
  const tables = x.tables.map((t): DictTable => {
    const references = t.foreign_keys.map((fk) => ({
      table: `${fk.ref_schema}.${fk.ref_table}`,
      columns: fk.columns,
      refColumns: fk.ref_columns,
      onDelete: fk.on_delete,
    }))
    return {
      id: `${t.schema}.${t.name}`,
      schema: t.schema,
      name: t.name,
      comment: t.comment,
      rows: t.rows,
      estimated: t.estimated,
      bytes: t.bytes,
      rls: t.rls,
      columns: t.columns.map((c) => {
        const fk = references.find((r) => r.columns.length === 1 && r.columns[0] === c.name)
        return {
          name: c.name,
          type: c.type,
          nullable: c.nullable,
          default: c.default,
          generated: c.generated,
          identity: c.identity,
          primaryKey: c.primary_key,
          comment: c.comment,
          references: fk ? { table: fk.table, column: fk.refColumns[0], onDelete: fk.onDelete } : null,
        }
      }),
      references,
      referencedBy: [],
      indexes: t.indexes,
    }
  })
  for (const t of tables) {
    for (const r of t.references) {
      tables.find((o) => o.id === r.table)?.referencedBy.push({ ...r, table: t.id })
    }
  }
  return { schemas: x.schemas, tables }
}

export async function getDictionary(supabase: SupabaseClient): Promise<Dictionary> {
  const { data, error } = await supabase.schema('admin').rpc('dictionary')
  if (error) throw error
  return parseDictionary(data)
}
