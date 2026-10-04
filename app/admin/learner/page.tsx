import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { num, PageHeader, Status, when } from '@/components/admin/Page'
import { auditHref, LAYERS_PER_PAGE, listLearnerLayers } from '@/lib/admin/learner'

export const metadata = { title: 'Learner layer · Admin' }

const TH = 'py-2 pr-4 font-medium'
const TD = 'py-1.5 pr-4'
const NUM = `${TD} text-right tabular-nums`

const pageHref = (page: number) => (page === 1 ? '/admin/learner' : `/admin/learner?page=${page}`)

function Pager({ page, shown, total, label }: { page: number; shown: number; total: number; label: string }) {
  const first = (page - 1) * LAYERS_PER_PAGE + 1
  const last = Math.ceil(total / LAYERS_PER_PAGE)
  return (
    <nav aria-label={label} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
      <span className="text-(--zs-soft) tabular-nums">{num(first)}–{num(first + shown - 1)} of {num(total)}</span>
      {page > 1 && <Link href={pageHref(page - 1)} prefetch={false} className="font-medium hover:underline">Previous</Link>}
      {page < last && <Link href={pageHref(page + 1)} prefetch={false} className="font-medium hover:underline">Next</Link>}
    </nav>
  )
}

export default async function AdminLearnerPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const supabase = await createClient()
  await requireAdmin(supabase)
  const asked = Number((await searchParams).page)
  const page = Number.isInteger(asked) && asked > 1 ? asked : 1
  const { layers, total } = await listLearnerLayers(supabase, page)
  return (
    <div>
      <PageHeader
        title="Learner layer"
        lead="The senses, examples and collocations a model wrote over the Wiktionary entries, with what the reviewing model said about each."
      />
      {layers.length === 0 ? (
        <p className="mt-6 text-sm text-(--zs-soft)">
          {page > 1 ? <>No layers on this page. <Link href={pageHref(1)} prefetch={false} className="hover:underline">First page</Link></> : 'No layers loaded.'}
        </p>
      ) : (
        <>
          <div className="mt-6"><Pager page={page} shown={layers.length} total={total} label="Pages" /></div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--edge) text-left text-xs uppercase tracking-wide text-(--zs-soft)">
                  <th className={TH}>Entry</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Model</th>
                  <th className={TH}>Prompt</th>
                  <th className={`${TH} text-right`}>Senses</th>
                  <th className={`${TH} text-right`}>Links</th>
                  <th className={`${TH} text-right`}>Labels</th>
                  <th className={`${TH} text-right`}>Issues</th>
                  <th className={`${TH} text-right`}>Rejected</th>
                  <th className="py-2 font-medium">Loaded</th>
                </tr>
              </thead>
              <tbody>
                {layers.map((l) => (
                  <tr key={l.entryId} className="border-b border-(--zs-line)">
                    <td className={TD}>
                      <Link href={auditHref(l.entryId)} prefetch={false} className="font-medium hover:underline">{l.headword}</Link>
                      <span className="ml-1.5 font-mono text-xs text-(--zs-soft)">{l.lang}</span>
                    </td>
                    <td className={TD}><Status tone={l.status === 'published' ? 'ok' : 'idle'}>{l.status}</Status></td>
                    <td className={`${TD} font-mono text-xs`}>{l.model}{l.reviewer && <span className="block text-(--zs-soft)">reviewed by {l.reviewer}</span>}</td>
                    <td className={`${TD} font-mono text-xs`}>{l.promptVersion}</td>
                    <td className={NUM}>{l.senses}</td>
                    <td className={NUM}>{l.links}</td>
                    <td className={NUM}>{l.labels}</td>
                    <td className={NUM}>{l.issues}</td>
                    <td className={NUM}>{l.rejected}</td>
                    <td className="py-1.5 text-xs tabular-nums text-(--zs-soft)">{when(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4"><Pager page={page} shown={layers.length} total={total} label="Pages, below the table" /></div>
        </>
      )}
    </div>
  )
}
