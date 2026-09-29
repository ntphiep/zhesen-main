'use client'
import { Fragment, useState } from 'react'
import Link from 'next/link'
import type { DictColumn, DictLink, DictTable, Dictionary } from '@/lib/admin/dictionary'
import { formatBytes } from '@/lib/admin/metrics'
import { CARD, num } from '@/components/admin/Page'
import { Erd } from '@/components/admin/Erd'

/** 0041 and 0061 prefix every table comment with "zhesen:" to mark ownership in Studio. */
export function purpose(comment: string | null): string {
  const text = comment?.replace(/^zhesen:\s*/, '')
  return text ? text[0].toUpperCase() + text.slice(1) : 'No description.'
}

export const tableHref = (id: string) => `/admin/database?table=${id}`

/** Most-read first. `public` carries Supabase's stock comment, so each schema is described here. */
const SCHEMAS: { name: string; about: string }[] = [
  { name: 'lex', about: 'Dictionary content. Loaded by zhesen-pipeline, read-only for users.' },
  { name: 'public', about: 'Per-account data: word lists, reviews, practice days, profiles, audit log.' },
  { name: 'admin', about: 'Tables behind this console. Every function checks the admin role first.' },
]

/** Only the three project schemas have a detail page; auth.users and the like do not. */
const documented = (id: string) => SCHEMAS.some((s) => id.startsWith(`${s.name}.`))

function TableName({ id, children }: { id: string; children: string }) {
  if (!documented(id)) {
    return <span className="font-mono text-(--zs-soft)" title="Supabase table, not documented here">{children}</span>
  }
  return (
    <Link href={tableHref(id)} prefetch={false} className="font-mono text-(--zs-soft) underline decoration-(--zs-pen)/35 hover:decoration-(--zs-pen)">
      {children}
    </Link>
  )
}

function Tag({ children, tone = 'plain', title }: { children: string; tone?: 'plain' | 'key'; title?: string }) {
  return (
    <span title={title} className={`rounded px-1.5 py-px text-[11px] font-medium ${tone === 'key' ? 'bg-amber-50 text-amber-800' : 'bg-(--tint-2) text-(--zs-soft)'}`}>
      {children}
    </span>
  )
}

const chip = 'rounded-full border border-(--edge) px-2 py-0.5 text-xs text-(--zs-soft) tabular-nums'
const th = 'px-4 py-2 text-xs font-medium text-(--zs-soft)'

/** A table's columns, one compact line each, shown when its row is expanded. */
function ColumnGrid({ t }: { t: DictTable }) {
  return (
    <div className="border-t border-(--zs-line) bg-(--tint-1) px-4 py-3">
      <ul className="divide-y divide-(--zs-line)">
        {t.columns.map((c) => (
          <li key={c.name} className="grid gap-x-4 gap-y-0.5 py-1.5 sm:grid-cols-[minmax(0,13rem)_minmax(0,10rem)_7rem_minmax(0,1fr)] sm:items-baseline">
            <span className="font-mono text-xs font-medium break-all">{c.name}</span>
            <span className="font-mono text-xs text-(--zs-soft) break-all">{c.type}</span>
            <span className="flex flex-wrap gap-1">
              {c.primaryKey && <Tag tone="key">PK</Tag>}
              {c.references && <Tag title={`${c.references.table}.${c.references.column}`}>FK</Tag>}
              {c.nullable && <Tag>nullable</Tag>}
            </span>
            <span className="text-xs text-(--zs-soft)">{c.comment ?? <span className="text-(--zs-soft)">No description.</span>}</span>
          </li>
        ))}
      </ul>
      <Link href={tableHref(t.id)} prefetch={false} className="mt-2 inline-block text-sm font-medium underline decoration-(--zs-pen)/35 hover:decoration-(--zs-pen)">
        Open table
      </Link>
    </div>
  )
}

/** One schema's tables: rows, size against the largest of them, and a row that opens to its columns. */
function SchemaTable({ tables }: { tables: DictTable[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const largest = Math.max(1, ...tables.map((t) => t.bytes))
  return (
    <div className={`overflow-hidden ${CARD}`}>
      <table className="w-full table-fixed text-sm">
        <thead className="bg-(--tint-1)">
          <tr className="border-b border-(--edge) text-left">
            <th scope="col" className={`${th} sm:w-60`}>Table</th>
            <th scope="col" className={`${th} w-24 text-right`}>Rows</th>
            <th scope="col" className={`${th} w-32 sm:w-44`}>Size</th>
            <th scope="col" className={`${th} hidden sm:table-cell`}>Description</th>
          </tr>
        </thead>
        <tbody>
          {tables.map((t) => {
            const expanded = open === t.id
            const panel = `columns-${t.id.replace('.', '-')}`
            return (
              <Fragment key={t.id}>
                <tr className={`border-b border-(--zs-line) last:border-0 hover:bg-(--tint-2) ${expanded ? 'bg-(--tint-2)' : ''}`}>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={panel}
                      onClick={() => setOpen(expanded ? null : t.id)}
                      className="flex w-full min-w-0 items-center gap-1.5 rounded px-2 py-1 text-left"
                    >
                      <span aria-hidden className={`text-[10px] text-(--zs-soft) transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
                      <span className="min-w-0 font-mono text-[13px] font-medium break-all">{t.name}</span>
                    </button>
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{num(t.rows)}</td>
                  <td className="px-4 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-right tabular-nums text-(--zs-soft)">{formatBytes(t.bytes)}</span>
                      <span aria-hidden className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-(--tint-3)">
                        <span className="block h-full rounded-full bg-(--zs-pen)/60" style={{ width: `${(t.bytes / largest) * 100}%` }} />
                      </span>
                    </div>
                  </td>
                  <td className="hidden truncate px-4 py-1.5 text-(--zs-soft) sm:table-cell" title={purpose(t.comment)}>{purpose(t.comment)}</td>
                </tr>
                {expanded && (
                  <tr id={panel} className="border-b border-(--zs-line) last:border-0">
                    <td colSpan={4} className="p-0">
                      <p className="px-4 pt-3 text-sm text-(--zs-soft) sm:hidden">{purpose(t.comment)}</p>
                      <ColumnGrid t={t} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Per schema: its size, the diagram of its foreign keys, then every table. */
export function TableIndex({ dict }: { dict: Dictionary }) {
  const href = (id: string) => (documented(id) && dict.tables.some((t) => t.id === id) ? tableHref(id) : null)
  return (
    <div className="flex flex-col gap-10">
      {SCHEMAS.map((s) => {
        const tables = dict.tables.filter((t) => t.schema === s.name)
        if (tables.length === 0) return null
        const bytes = tables.reduce((n, t) => n + t.bytes, 0)
        return (
          <section key={s.name} aria-labelledby={`schema-${s.name}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={`schema-${s.name}`} className="font-mono text-lg font-semibold">{s.name}</h2>
              <span className={chip}>{tables.length} tables</span>
              <span className={chip}>{formatBytes(bytes)}</span>
            </div>
            <p className="mt-1 text-sm text-(--zs-soft)">{s.about}</p>
            <div className="mt-3"><Erd tables={dict.tables} schema={s.name} href={href} /></div>
            <div className="mt-3"><SchemaTable tables={tables} /></div>
          </section>
        )
      })}
    </div>
  )
}

function Column({ c }: { c: DictColumn }) {
  return (
    <li className="grid gap-x-6 gap-y-1 px-4 py-3 sm:grid-cols-[15rem_1fr]">
      <div className="min-w-0">
        <div className="font-mono text-sm font-medium break-all">{c.name}</div>
        <div className="font-mono text-xs text-(--zs-soft) break-all">{c.type}</div>
      </div>
      <div className="min-w-0">
        <p className="text-sm">{c.comment ?? <span className="text-(--zs-soft)">No description.</span>}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {c.primaryKey && <Tag tone="key">PK</Tag>}
          <Tag>{c.nullable ? 'nullable' : 'not null'}</Tag>
          {c.generated && <Tag>generated</Tag>}
          {c.identity && <Tag>identity</Tag>}
          {c.default && (
            <span className="text-xs text-(--zs-soft)">
              default <code className="font-mono break-all text-(--zs-soft)">{c.default}</code>
            </span>
          )}
          {c.references && (
            <span className="text-xs text-(--zs-soft)">
              references{' '}
              <TableName id={c.references.table}>{`${c.references.table}.${c.references.column}`}</TableName>
              , on delete {c.references.onDelete}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

function Links({ title, links }: { title: string; links: DictLink[] }) {
  return (
    <div className={`${CARD} px-4 py-3`}>
      <h3 className="text-sm font-medium">{title}</h3>
      {links.length === 0 ? (
        <p className="mt-1 text-sm text-(--zs-soft)">None</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1 text-sm">
          {links.map((l) => (
            <li key={`${l.table}:${l.columns.join(',')}`} className="min-w-0">
              <TableName id={l.table}>{l.table}</TableName>
              <span className="text-(--zs-soft)"> via <code className="font-mono">{l.columns.join(', ')}</code>, on delete {l.onDelete}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** One table: purpose, size, every column with its meaning, the tables around it and its indexes. */
export function TableDetail({ t }: { t: DictTable }) {
  const facts = [
    `${num(t.rows)} rows`,
    formatBytes(t.bytes),
    `${t.columns.length} columns`,
    `${t.indexes.length} indexes`,
    t.rls ? 'RLS on' : 'RLS off',
  ]
  return (
    <div>
      <Link href="/admin/database" prefetch={false} className="text-sm text-(--zs-soft) hover:underline">Database</Link>
      <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight break-all">{t.id}</h1>
      <p className="mt-2 max-w-3xl text-sm text-(--zs-soft)">{purpose(t.comment)}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {facts.map((f) => <li key={f} className={chip}>{f}</li>)}
      </ul>

      <h2 className="mt-8 mb-3 text-base font-bold">Columns</h2>
      <ul className={`divide-y divide-(--zs-line) ${CARD}`}>
        {t.columns.map((c) => <Column key={c.name} c={c} />)}
      </ul>

      <h2 className="mt-8 mb-3 text-base font-bold">Foreign keys</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        <Links title="References" links={t.references} />
        <Links title="Referenced by" links={t.referencedBy} />
      </div>

      <h2 className="mt-8 mb-3 text-base font-bold">Indexes</h2>
      <ul className={`divide-y divide-(--zs-line) ${CARD}`}>
        {t.indexes.map((i) => (
          <li key={i.name} className="px-4 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-mono text-sm break-all">{i.name}</span>
              <span className="text-xs text-(--zs-soft) tabular-nums">
                {/pgroonga/i.test(i.definition) ? 'stored outside Postgres' : formatBytes(i.bytes)}
              </span>
            </div>
            <code className="mt-0.5 block font-mono text-xs break-all text-(--zs-soft)">{i.definition}</code>
          </li>
        ))}
      </ul>
    </div>
  )
}
