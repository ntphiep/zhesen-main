import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { PageHeader, Section, Status, when } from '@/components/admin/Page'
import { LearnerStatusButton } from '@/components/admin/LearnerStatusButton'
import { getLearnerAudit, type AuditSense } from '@/lib/admin/learner'
import { entryPath } from '@/lib/dictionary/entryId'
import { percentDecode } from '@/lib/http/percentDecode'

export const metadata = { title: 'Learner layer · Admin' }

type Params = Promise<{ lang: string; id: string }>

const TH = 'py-2 pr-4 font-medium'
const TD = 'py-2 pr-4 align-top'

function Role({ sense }: { sense: AuditSense }) {
  const l = sense.label
  if (!l) return <span className="text-rose-700">unlabelled</span>
  if (l.coreSenseOrder !== null) return <span>core {l.coreSenseOrder}{l.coreTerms && <span className="block text-black/50">{l.coreTerms}</span>}</span>
  return <span>{l.isInflection ? `form of ${l.lemma ?? '?'}` : 'minor'}</span>
}

/** Every raw sense of one entry against what the layer made of it, and what the reviewer said. */
export default async function AdminLearnerAuditPage({ params }: { params: Params }) {
  const supabase = await createClient()
  await requireAdmin(supabase)
  const { lang, id } = await params
  const entryId = `${lang}:${percentDecode(id)}`
  const audit = await getLearnerAudit(supabase, entryId)

  if (!audit) {
    return (
      <div>
        <PageHeader title="Learner layer" />
        <p className="mt-6 text-sm text-black/60">No layer for {entryId}.</p>
        <Link href="/admin/learner" prefetch={false} className="mt-2 inline-block text-sm hover:underline">All layers</Link>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title={audit.headword} lead={`${audit.entryId} · ${audit.model} · prompt ${audit.promptVersion} · loaded ${when(audit.createdAt)}`} />
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <Status tone={audit.status === 'published' ? 'ok' : 'idle'}>{audit.status}</Status>
        <LearnerStatusButton entryId={audit.entryId} status={audit.status} />
        <Link href={entryPath(audit.entryId)} prefetch={false} className="text-black/60 hover:underline">Open entry page</Link>
        <Link href="/admin/learner" prefetch={false} className="text-black/60 hover:underline">All layers</Link>
      </div>

      <Section title="Senses" aside={`${audit.senses.length} raw senses`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-black/45">
                <th className={TH}>Sense</th>
                <th className={TH}>Wiktionary</th>
                <th className={TH}>Vietnamese now</th>
                <th className={TH}>Role</th>
                <th className={TH}>Labels</th>
                <th className={TH}>Fix</th>
              </tr>
            </thead>
            <tbody>
              {audit.senses.map((s) => {
                const l = s.label
                return (
                  <tr key={s.id} className="border-b border-black/5">
                    <td className={`${TD} whitespace-nowrap font-mono text-xs`}>{s.id}{s.pos && <span className="block text-black/45">{s.pos}</span>}</td>
                    <td className={`${TD} min-w-64 text-black/70`}>{s.glossEn}</td>
                    <td className={`${TD} min-w-48`}>{s.glossVi ?? <span className="text-black/40">empty</span>}</td>
                    <td className={`${TD} whitespace-nowrap`}><Role sense={s} /></td>
                    <td className={`${TD} text-xs text-black/60`}>
                      {l && [l.viTerms.join(', '), l.domain, l.register].filter(Boolean).join(' · ')}
                    </td>
                    <td className={`${TD} min-w-64 text-xs`}>
                      {l?.fixVi && (
                        <>
                          {l.previousGlossVi !== null && <span className="block text-black/45 line-through">{l.previousGlossVi}</span>}
                          <span className="block">{l.fixVi}</span>
                          <span className="block text-black/45">{l.fixedAt ? `applied ${when(l.fixedAt)}` : 'not applied: a person wrote the gloss, or it already matched'}</span>
                          {l.fixReason && <span className="block text-black/55">{l.fixReason}</span>}
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Reviewer issues" aside={`${audit.issues.length}`}>
        {audit.issues.length === 0 ? <p className="text-sm text-black/60">The reviewer raised none.</p> : (
          <ul className="flex flex-col gap-3 text-sm">
            {audit.issues.map((i, n) => (
              <li key={n} className="rounded-lg border border-black/10 px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-2 text-xs">
                  {i.severity && <Status tone={i.severity === 'high' ? 'bad' : i.severity === 'medium' ? 'warn' : 'idle'}>{i.severity}</Status>}
                  {i.path && <span className="font-mono text-black/55">{i.path}</span>}
                </div>
                {i.problem && <p className="mt-1">{i.problem}</p>}
                {i.fix && <p className="mt-1 break-words text-black/60">Fix: {i.fix}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Rejected by the writer" aside={`${audit.rejected.length}`}>
        {audit.rejected.length === 0 ? <p className="text-sm text-black/60">The writer applied every issue.</p> : (
          <ul className="flex flex-col gap-2 text-sm">
            {audit.rejected.map((r, n) => (
              <li key={n}>
                {r.path && <span className="font-mono text-xs text-black/55">{r.path}</span>}
                {r.reason && <p>{r.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
