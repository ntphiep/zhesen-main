import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { PageHeader, when } from '@/components/admin/Page'
import { FeedbackActions } from '@/components/admin/FeedbackActions'
import { canApply, getOpenFeedback } from '@/lib/admin/feedback'
import { entryPath } from '@/lib/dictionary/entryId'

export const metadata = { title: 'Feedback · Admin' }

const KIND = { meaning: 'Wrong meaning', example: 'Wrong example', other: 'Other' } as const

export default async function AdminFeedbackPage() {
  const supabase = await createClient()
  await requireAdmin(supabase)
  const items = await getOpenFeedback(supabase)
  return (
    <div>
      <PageHeader title="Feedback" lead="Open reports from the word page, newest first." />
      {items.length === 0 ? <p className="mt-6 text-sm text-black/60">No open reports.</p> : (
        <ul className="mt-6 flex flex-col gap-3">
          {items.map((f) => (
            <li key={f.id} className="rounded-xl border border-black/10 px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                {f.headword === null ? (
                  <span className="font-semibold">{f.entryId} <span className="font-normal text-amber-700">(entry no longer exists)</span></span>
                ) : (
                  <Link href={entryPath(f.entryId)} prefetch={false} className="font-semibold hover:underline">
                    {f.headword}
                  </Link>
                )}
                <span className="text-black/55">{f.lang ? `${f.lang} · ` : ''}{KIND[f.kind]} · {when(f.createdAt)}</span>
                <Link
                  href={`/admin/content?entry=${encodeURIComponent(f.entryId)}`}
                  prefetch={false}
                  className="text-black/60 hover:underline"
                >
                  Edit entry
                </Link>
              </div>
              <p className="mt-1 text-sm text-black/70">
                {f.senseId === null ? 'Whole entry' : f.senseOrder === null ? `Sense ${f.senseId} no longer exists` : (
                  <>Sense {f.senseOrder}: {f.glossVi ?? '(no Vietnamese gloss)'}{f.glossEn ? ` · ${f.glossEn}` : ''}</>
                )}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{f.message}</p>
              {f.suggestion && <p className="mt-1 text-sm"><span className="text-black/55">Suggested: </span>{f.suggestion}</p>}
              <div className="mt-3">
                <FeedbackActions id={f.id} canApply={canApply(f)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
