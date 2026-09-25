import type { DictTable } from '@/lib/admin/dictionary'

/** One table in the diagram. `external` is a table outside the schema that one of its tables references. */
export interface ErdBox {
  id: string
  label: string
  rows: number | null
  rank: number
  x: number
  y: number
  external: boolean
}

/** One foreign key, drawn from the table holding it to the table it references. */
export interface ErdEdge {
  from: string
  to: string
  columns: string[]
  d: string
}

export interface Erd {
  boxes: ErdBox[]
  edges: ErdEdge[]
  width: number
  height: number
}

export const BOX_W = 176
export const BOX_H = 44
const GAP_X = 64
const GAP_Y = 14
/** Room to the right of the last column for a self-reference loop. */
const PAD = 24

/**
 * Referenced tables on the left, the tables that hold foreign keys to them to the right:
 * a table's rank is one more than the deepest table it references. Each column is ordered
 * by the mean height of the tables it references, which keeps most edges short.
 */
export function layoutErd(tables: DictTable[], schema: string): Erd {
  const own = tables.filter((t) => t.schema === schema)
  const byId = new Map(own.map((t) => [t.id, t]))
  const rank = new Map<string, number>()
  const visit = (id: string, path: Set<string>): number => {
    const known = rank.get(id)
    if (known !== undefined) return known
    const t = byId.get(id)
    if (!t || path.has(id)) return 0
    path.add(id)
    const refs = t.references.filter((r) => r.table !== id).map((r) => visit(r.table, path))
    path.delete(id)
    const r = refs.length === 0 ? 0 : Math.max(...refs) + 1
    rank.set(id, r)
    return r
  }
  for (const t of own) visit(t.id, new Set())

  const external = [...new Set(own.flatMap((t) => t.references.map((r) => r.table)))].filter((id) => !byId.has(id)).sort()
  const columns: string[][] = []
  const put = (id: string, r: number) => (columns[r] ??= []).push(id)
  const incoming = (id: string) => own.filter((t) => t.references.some((r) => r.table === id)).length
  own.map((t) => t.id).sort((a, b) => incoming(b) - incoming(a) || a.localeCompare(b)).forEach((id) => put(id, rank.get(id) ?? 0))
  external.forEach((id) => put(id, 0))
  for (let r = 0; r < columns.length; r++) columns[r] ??= []

  const tallest = Math.max(1, ...columns.map((c) => c.length))
  const height = tallest * (BOX_H + GAP_Y) - GAP_Y
  const y = new Map<string, number>()
  columns.forEach((col, r) => {
    if (r > 0) {
      const mean = (id: string) => {
        const ys = byId.get(id)!.references.map((ref) => y.get(ref.table)).filter((v): v is number => v !== undefined)
        return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0
      }
      col.sort((a, b) => mean(a) - mean(b) || a.localeCompare(b))
    }
    const top = (height - (col.length * (BOX_H + GAP_Y) - GAP_Y)) / 2
    col.forEach((id, i) => y.set(id, top + i * (BOX_H + GAP_Y)))
  })

  const boxes: ErdBox[] = columns.flatMap((col, r) => col.map((id) => {
    const t = byId.get(id)
    return {
      id,
      label: t ? t.name : id,
      rows: t ? t.rows : null,
      rank: r,
      x: r * (BOX_W + GAP_X),
      y: y.get(id)!,
      external: !t,
    }
  }))
  const at = new Map(boxes.map((b) => [b.id, b]))

  // Several keys meet on one side of a box, so each gets its own point along that side.
  const fks = own.flatMap((t) => t.references.map((r) => ({ from: t.id, to: r.table, columns: r.columns })))
  const slot = (list: string[], id: string, n: number) => {
    const all = list.filter((x) => x === id).length
    const k = list.slice(0, n).filter((x) => x === id).length
    return (BOX_H * (k + 1)) / (all + 1)
  }
  const outs = fks.map((f) => f.from)
  const ins = fks.map((f) => f.to)
  const edges: ErdEdge[] = fks.map((f, i) => {
    const a = at.get(f.from)!
    const b = at.get(f.to)!
    if (f.from === f.to) {
      const x = a.x + BOX_W
      return { ...f, d: `M ${x} ${a.y + 12} C ${x + 22} ${a.y + 12}, ${x + 22} ${a.y + BOX_H - 12}, ${x} ${a.y + BOX_H - 12}` }
    }
    const x1 = a.x
    const y1 = a.y + slot(outs, f.from, i)
    const x2 = b.x + BOX_W
    const y2 = b.y + slot(ins, f.to, i)
    const dx = Math.max(32, Math.abs(x1 - x2) / 2)
    return { ...f, d: `M ${x1} ${y1} C ${x1 - dx} ${y1}, ${x2 + dx} ${y2}, ${x2} ${y2}` }
  })

  return { boxes, edges, width: columns.length * (BOX_W + GAP_X) - GAP_X + PAD, height }
}
