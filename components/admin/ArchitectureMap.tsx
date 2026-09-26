import type { ReactNode } from 'react'
import { CONTAINERS, PLACEMENT, STACK } from '@/lib/admin/architecture'
import type { Tone } from '@/components/admin/Page'

export interface Live {
  tone: Tone
  text: string
}

export interface MapState {
  edgeHost: string
  deployment: { env: string; region: string | null; commit: string | null; node: string }
  /** The request this page made through CloudFront to GoTrue. */
  auth: Live & { version: string | null }
  /** The admin.metrics() call this page made through PostgREST to Postgres. */
  database: Live & { version: string | null }
  backups: Live
  alarms: Live
  integrations: { label: string; enabled: boolean }[]
  bucket: string | null
}

const DOT: Record<Tone, string> = { ok: 'bg-emerald-700', warn: 'bg-amber-700', bad: 'bg-rose-700', idle: 'bg-black/25' }

function Dot({ tone, label }: { tone: Tone; label: string }) {
  return <span role="img" aria-label={label} className={`inline-block size-2 shrink-0 rounded-full ${DOT[tone]}`} />
}

/** A dashed boundary with its name on the edge: a provider, a region or a network. */
function Boundary({ name, tone, className = '', children }: { name: string; tone: 'ink' | 'aws' | 'vpc'; className?: string; children: ReactNode }) {
  const colour = { ink: 'border-black/30 text-black/60', aws: 'border-amber-700/50 text-amber-800', vpc: 'border-sky-700/45 text-sky-800' }[tone]
  return (
    <div className={`relative rounded-xl border border-dashed px-3 pt-6 pb-3 ${colour} ${className}`}>
      <span className="absolute top-1.5 left-3 text-[11px] font-semibold tracking-wide uppercase">{name}</span>
      <div className="text-black">{children}</div>
    </div>
  )
}

function Box({ name, meta, live, children }: { name: string; meta?: string; live?: Live; children?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-black/10 bg-white px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{name}</span>
        {live && <Dot tone={live.tone} label={live.text} />}
      </div>
      {meta && <div className="mt-0.5 font-mono text-[11px] break-all text-black/50">{meta}</div>}
      {live && <div className="mt-1 text-xs text-black/60">{live.text}</div>}
      {children}
    </div>
  )
}

/** The line between two stages: down on a phone, right once the stages sit in a row. */
function Wire({ label }: { label: string }) {
  return (
    <div aria-hidden className="flex shrink-0 items-center justify-center py-1 lg:w-16 lg:flex-col lg:self-center lg:py-0">
      <span className="text-[10px] text-black/45 lg:order-first lg:mb-1">{label}</span>
      <svg viewBox="0 0 10 24" className="mx-2 h-6 w-2.5 text-black/35 lg:hidden"><path d="M5 0v20M1 16l4 6 4-6" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      <svg viewBox="0 0 48 10" className="hidden h-2.5 w-full text-black/35 lg:block" preserveAspectRatio="none"><path d="M0 5h44M40 1l6 4-6 4" fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>
    </div>
  )
}

function containerLive(service: string, s: MapState): Live {
  if (service === 'db' || service === 'rest') return s.database
  if (service === 'auth' || service === 'api-gw') return s.auth
  return { tone: 'idle', text: 'Not probed from here' }
}

/**
 * Nested boundaries, as the AWS Architecture Center draws them: Vercel, then the AWS region,
 * then the VPC and the one instance inside it. The database has no public address; only
 * CloudFront reaches it, through a VPC origin.
 */
export function ArchitectureMap({ s }: { s: MapState }) {
  const d = s.deployment
  return (
    <div className="rounded-xl border border-black/10 bg-black/[0.015] p-3 sm:p-4">
      <div className="flex flex-col lg:flex-row lg:items-stretch">
        <div className="lg:w-28 lg:self-center"><Box name="Browser" meta="session cookie" /></div>
        <Wire label="HTTPS" />
        <Boundary name={`Vercel · ${PLACEMENT.vercelRegion}`} tone="ink" className="lg:w-48 lg:self-center">
          <Box name="Next.js" meta={d.commit ? `${d.env} · ${d.commit}` : d.env} live={{ tone: 'ok', text: 'Serving this page' }} />
        </Boundary>
        <Wire label="/auth · /rest" />
        <Boundary name={`AWS · ${PLACEMENT.awsRegion} (${PLACEMENT.awsRegionName})`} tone="aws" className="min-w-0 flex-1">
          <div className="flex flex-col lg:flex-row lg:items-stretch">
            <div className="lg:w-40 lg:self-center"><Box name="CloudFront" meta={s.edgeHost} live={s.auth} /></div>
            <Wire label="VPC origin" />
            <Boundary name="VPC · public subnet" tone="vpc" className="min-w-0 flex-1">
              <div className="rounded-lg border border-black/10 bg-white px-3 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm font-semibold">EC2</span>
                  <span className="font-mono text-[11px] text-black/50">{PLACEMENT.instanceType} · Docker</span>
                </div>
                <ul className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {CONTAINERS.map((c) => {
                    const live = containerLive(c.service, s)
                    return (
                      <li key={c.container} title={c.role} className={`flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 ${c.service === 'db' ? 'bg-sky-700/10' : 'bg-black/[0.04]'}`}>
                        <Dot tone={live.tone} label={live.text} />
                        <span className="truncate font-mono text-xs">{c.container.replace('supabase-', '')}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </Boundary>
            <div className="mt-3 grid grid-cols-2 gap-2 lg:mt-0 lg:ml-3 lg:w-40 lg:grid-cols-1 lg:content-center">
              <Box name="S3" meta="daily pg_dump" live={s.backups} />
              <Box name="CloudWatch · SNS" live={s.alarms} />
            </div>
          </div>
        </Boundary>
      </div>

      <ul className="mt-3 flex flex-wrap gap-2 text-xs">
        {s.integrations.map((i) => (
          <li key={i.label} className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-2.5 py-1">
            <Dot tone={i.enabled ? 'ok' : 'idle'} label={i.enabled ? 'configured' : 'not configured'} />
            {i.label}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-2.5 py-1 text-black/60">
          <Dot tone="idle" label="frozen" />
          Supabase Cloud copy, kept until {PLACEMENT.cloudCopyUntil}
        </li>
      </ul>
    </div>
  )
}

export interface VersionRow {
  component: string
  place: string
  version: string
}

export function versionRows(s: MapState): VersionRow[] {
  const image = (service: string) => CONTAINERS.find((c) => c.service === service)?.image.split(':')[1] ?? ''
  return [
    { component: 'Node.js', place: `Vercel ${PLACEMENT.vercelRegion}`, version: s.deployment.node },
    ...STACK.map((x) => ({ component: x.name, place: 'App', version: x.version })),
    { component: 'Postgres', place: 'EC2', version: s.database.version ?? image('db') },
    { component: 'GoTrue', place: 'EC2', version: s.auth.version ?? image('auth') },
    { component: 'PostgREST', place: 'EC2', version: image('rest') },
    { component: 'Envoy', place: 'EC2', version: image('api-gw') },
    { component: 'postgres-meta', place: 'EC2', version: image('meta') },
    { component: 'Studio', place: 'EC2', version: image('studio') },
  ]
}

const th = 'px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-black/50 uppercase'

export function VersionTable({ rows }: { rows: VersionRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-black/10">
      <table className="w-full text-sm">
        <thead className="border-b border-black/10 bg-black/[0.025]">
          <tr><th className={th}>Component</th><th className={th}>Runs on</th><th className={th}>Version</th></tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {rows.map((r) => (
            <tr key={r.component} className="hover:bg-black/[0.02]">
              <td className="px-3 py-1.5 font-medium">{r.component}</td>
              <td className="px-3 py-1.5 text-black/60">{r.place}</td>
              <td className="px-3 py-1.5 font-mono text-xs break-all">{r.version}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Where each kind of data is kept, for the question "if this machine goes, what is lost". */
export function DataPlaces({ bucket }: { bucket: string | null }) {
  const places = [
    { what: 'Database', where: `EC2 ${PLACEMENT.awsRegion}, supabase-db on a 30 GB gp3 volume`, holds: 'lex, auth, public' },
    { what: 'Daily dump', where: bucket ? `S3 ${bucket}` : 'S3', holds: 'Whole database' },
    { what: 'Old copy', where: `Supabase Cloud ${PLACEMENT.cloudCopyRef}`, holds: 'Read-only, until the cut-over' },
    { what: 'Dictionary cache', where: 'Vercel Data Cache, tag lex', holds: 'Lookups and entry pages, 7 days' },
    { what: 'Sessions', where: 'Browser cookie', holds: 'Anonymous accounts live only here' },
  ]
  return (
    <div className="overflow-x-auto rounded-lg border border-black/10">
      <table className="w-full text-sm">
        <thead className="border-b border-black/10 bg-black/[0.025]">
          <tr><th className={th}>Data</th><th className={th}>Where</th><th className={th}>Holds</th></tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {places.map((p) => (
            <tr key={p.what}>
              <td className="px-3 py-1.5 font-medium whitespace-nowrap">{p.what}</td>
              <td className="px-3 py-1.5 wrap-anywhere text-black/70">{p.where}</td>
              <td className="px-3 py-1.5 text-black/60">{p.holds}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
