import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { Loading, num as count, PageHeader, PRIMARY, ReadFailed } from '@/components/admin/Page'
import { getAdminEntry, getCoverage, sharedCoverage, type Coverage } from '@/lib/admin/content'
import { searchOneDirection } from '@/lib/dictionary/search'
import { LANGUAGES } from '@/lib/languages'
import { EntryEditor } from '@/components/admin/EntryEditor'

export const metadata = { title: 'Content · Admin' }

const editHref = (id: string) => `/admin/content?entry=${encodeURIComponent(id)}`

/** Streamed after the search and the editor, which do not wait for its full scan. */
async function CoverageSection() {
  const supabase = await createClient()
  const read = await sharedCoverage(() => getCoverage(supabase)).catch((e: unknown): { failed: unknown } => ({ failed: e }))
  if ('failed' in read) return <ReadFailed what="the coverage" error={read.failed} />
  return <CoverageTable coverage={read.value} />
}

function CoverageTable({ coverage }: { coverage: Coverage }) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--edge) text-left text-xs font-medium uppercase tracking-wide text-(--zs-soft)">
              <th className="py-2 pr-4">Language</th>
              <th className="py-2 pr-4 text-right">Entries</th>
              <th className="py-2 pr-4 text-right">Senses</th>
              <th className="py-2 pr-4 text-right">With Vietnamese</th>
              <th className="py-2 pr-4 text-right">Machine-translated</th>
              <th className="py-2 text-right">Flagged</th>
            </tr>
          </thead>
          <tbody>
            {coverage.languages.map((l) => (
              <tr key={l.lang} className="border-b border-(--zs-line)">
                <td className="py-1.5 pr-4 font-mono">{l.lang}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums">{count(l.entries)}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums">{count(l.senses)}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums">{count(l.sensesVi)}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums">{count(l.sensesMt)}</td>
                <td className="py-1.5 text-right tabular-nums">{count(l.flagged)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {coverage.flagged.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {coverage.flagged.map((f) => (
            <li key={f.entryId}>
              <Link href={editHref(f.entryId)} prefetch={false} className="font-medium hover:underline">
                {f.headword}
              </Link>
              <span className="text-(--zs-soft)"> · {f.lang} · {f.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const supabase = await createClient()
  await requireAdmin(supabase)
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q.trim() : ''
  const dir = sp.dir === 'vi' ? 'vi' : 'fw'
  const entryId = typeof sp.entry === 'string' ? sp.entry : ''

  const [found, entry] = await Promise.all([
    q ? searchOneDirection(supabase, q, dir) : null,
    entryId ? getAdminEntry(supabase, entryId) : null,
  ])
  const results = found ? LANGUAGES.flatMap((l) => found.entries[l.code]) : []

  return (
    <div>
      <PageHeader title="Content" />
      <div className="mt-6 flex flex-col gap-10">
      <section>
        <h2 className="mb-3 text-base font-bold">Coverage</h2>
        <Suspense fallback={<Loading />}>
          <CoverageSection />
        </Suspense>
      </section>

      <section>
        <h2 className="mb-3 text-base font-bold">Find an entry</h2>
        <form action="/admin/content" className="flex flex-wrap items-center gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Headword or gloss"
            aria-label="Search"
            className="min-w-56 flex-1 rounded-lg border border-(--edge) bg-(--zs-field) px-3 py-2 text-sm"
          />
          <select
            name="dir"
            defaultValue={dir}
            aria-label="Direction"
            className="rounded-lg border border-(--edge) bg-(--zs-field) px-3 py-2 text-sm"
          >
            <option value="fw">By headword</option>
            <option value="vi">By Vietnamese gloss</option>
          </select>
          <button type="submit" className={PRIMARY}>
            Search
          </button>
        </form>
        {q && results.length === 0 && <p className="mt-3 text-sm text-(--zs-soft)">No match.</p>}
        {results.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {results.map((r) => (
              <li key={r.id}>
                <Link href={editHref(r.id)} prefetch={false} className="font-medium hover:underline">
                  {r.headword}
                </Link>
                <span className="text-(--zs-soft)"> · {r.lang}{r.glossVi ? ` · ${r.glossVi}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {entryId && (
        <section>
          <h2 className="mb-3 text-base font-bold">Edit entry</h2>
          {entry ? <EntryEditor key={entry.id} entry={entry} /> : (
            <p className="text-sm text-(--zs-soft)">No entry {entryId}.</p>
          )}
        </section>
      )}
      </div>
    </div>
  )
}
