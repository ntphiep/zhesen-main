import type { DictTable } from '@/lib/admin/dictionary'
import { BOX_H, BOX_W, layoutErd } from '@/lib/admin/erd'
import { num } from '@/components/admin/Page'

/** One schema's tables and foreign keys. A box links to its table; a muted box lies outside the schema. */
export function Erd({ tables, schema, href }: { tables: DictTable[]; schema: string; href: (id: string) => string | null }) {
  const erd = layoutErd(tables, schema)
  const marker = `erd-arrow-${schema}`
  return (
    <details open className="rounded-lg border border-black/10">
      <summary className="cursor-pointer px-4 py-2 text-sm text-black/60 select-none hover:text-black">
        Diagram · {erd.edges.length} foreign keys
      </summary>
      <div className="overflow-x-auto border-t border-black/10 bg-black/[0.015] p-4">
        <svg
          width={erd.width}
          height={erd.height}
          viewBox={`0 0 ${erd.width} ${erd.height}`}
          role="img"
          aria-label={`Foreign keys between the tables of ${schema}`}
          className="block max-w-none"
        >
          <defs>
            <marker id={marker} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M 0 0 L 8 4 L 0 8 z" className="fill-black/45" />
            </marker>
          </defs>
          <g fill="none" className="stroke-black/25">
            {erd.edges.map((e, i) => (
              <path key={i} d={e.d} strokeWidth={1.25} markerEnd={`url(#${marker})`}>
                <title>{`${e.from} (${e.columns.join(', ')}) → ${e.to}`}</title>
              </path>
            ))}
          </g>
          {erd.boxes.map((b) => {
            const link = href(b.id)
            const box = (
              <g transform={`translate(${b.x} ${b.y})`} className={link ? 'group/box' : undefined}>
                <rect
                  width={BOX_W}
                  height={BOX_H}
                  rx={7}
                  strokeDasharray={b.external ? '4 3' : undefined}
                  className={b.external
                    ? 'fill-white stroke-black/20'
                    : 'fill-white stroke-black/20 group-hover/box:stroke-black/60'}
                />
                <text x={12} y={19} className={`font-mono text-[12px] ${b.external ? 'fill-black/50' : 'fill-black font-medium'}`}>
                  {b.label}
                </text>
                <text x={12} y={34} className="text-[11px] tabular-nums fill-black/45">
                  {b.rows === null ? 'outside schema' : `${num(b.rows)} rows`}
                </text>
              </g>
            )
            return link ? <a key={b.id} href={link} aria-label={b.id}>{box}</a> : <g key={b.id}>{box}</g>
          })}
        </svg>
      </div>
    </details>
  )
}
