import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { getDictionary, type Dictionary } from '@/lib/admin/dictionary'
import { shared } from '@/lib/admin/shared'
import { awsHealthConfig, listDumps } from '@/lib/admin/aws'
import { Loading, PageHeader, ReadFailed, Section } from '@/components/admin/Page'
import { TableDetail, TableIndex } from '@/components/admin/DataDictionary'
import { RestorePanel, SqlConsole } from '@/components/admin/Console'

export const metadata = { title: 'Database · Admin' }

type Dumps = Awaited<ReturnType<typeof listDumps>>

/** admin.dictionary() counted every row of every table: 2.4 s on production on 2026-10-04.
 *  One read serves the index and every table's page for a minute; an infrastructure action
 *  clears it (api/admin/control). */
const sharedDictionary = shared<Dictionary>('dictionary', 60_000)

async function readDumps(): Promise<Dumps | null | 'error'> {
  const cfg = awsHealthConfig()
  if (!cfg) return null
  try {
    return await listDumps(cfg)
  } catch {
    return 'error'
  }
}

const NO_AWS = <p className="text-sm text-(--zs-soft)">AWS access is not configured for this deployment (AWS_ROLE_ARN).</p>

async function TableSection() {
  const supabase = await createClient()
  const read = await sharedDictionary(() => getDictionary(supabase)).catch((e: unknown): { failed: unknown } => ({ failed: e }))
  if ('failed' in read) {
    return (
      <>
        <PageHeader title="Database" />
        <div className="mt-6"><ReadFailed what="the tables" error={read.failed} /></div>
      </>
    )
  }
  return (
    <>
      <PageHeader title="Database" readAt={read.at} />
      <div className="mt-6"><TableIndex dict={read.value} /></div>
    </>
  )
}

async function ConsoleSections() {
  const dumps = await readDumps()
  return (
    <>
      <Section title="SQL">
        {dumps === null ? NO_AWS : <SqlConsole />}
      </Section>
      <Section title="Restore">
        {dumps === null ? NO_AWS
          : dumps === 'error' ? <p className="text-sm text-rose-700">Could not read the dump list from S3.</p>
            : <RestorePanel dumps={dumps.slice(0, 14)} />}
      </Section>
    </>
  )
}

export default async function AdminDatabasePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient()
  await requireAdmin(supabase)
  const sp = await searchParams

  if (typeof sp.table === 'string') {
    const { value: dict } = await sharedDictionary(() => getDictionary(supabase))
    const table = dict.tables.find((t) => t.id === sp.table)
    if (!table) notFound()
    return <TableDetail t={table} />
  }

  return (
    <div>
      <Suspense fallback={<><PageHeader title="Database" /><div className="mt-6"><Loading /></div></>}>
        <TableSection />
      </Suspense>
      <Suspense fallback={<Section title="SQL"><Loading /></Section>}>
        <ConsoleSections />
      </Suspense>
    </div>
  )
}
