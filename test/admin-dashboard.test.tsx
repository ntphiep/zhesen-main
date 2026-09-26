import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Kpis, SystemStrip, VacuumNote, systemChecks } from '@/components/admin/Overview'
import { AuditLog } from '@/components/admin/AuditLog'
import { parseMetrics } from '@/lib/admin/metrics'
import { METRICS_PAYLOAD } from './helpers/admin'

const M = parseMetrics(METRICS_PAYLOAD)
const AUTH = { ok: true, ms: 142, detail: 'GoTrue v2.197.0' }
const NOW = Date.parse('2026-09-25T06:00:00Z')

const figure = (label: string) => screen.getByText(label).parentElement as HTMLElement

describe('Kpis', () => {
  it('shows the exact entry count and the count per language', () => {
    render(<Kpis m={M} diskPercent={null} costMtd={null} />)
    expect(figure('Entries')).toHaveTextContent('36,361')
    expect(figure('Entries')).toHaveTextContent('zh 4,045')
  })

  it('splits accounts and shows the last 7 days', () => {
    render(<Kpis m={M} diskPercent={null} costMtd={null} />)
    expect(figure('Users')).toHaveTextContent('5 email · 2 anonymous')
    expect(figure('Active, 7 d')).toHaveTextContent('1')
    expect(figure('Active, 7 d')).toHaveTextContent('4 new')
    expect(figure('Saved words')).toHaveTextContent('445')
  })

  it('puts PGroonga, disk use and the month cost beside the database size', () => {
    render(<Kpis m={M} diskPercent={41.2} costMtd={2.4191} />)
    expect(figure('Database')).toHaveTextContent('PGroonga 163 MB · disk 41.2%')
    expect(figure('AWS, month to date')).toHaveTextContent('$2.42')
  })

  it('shows a dash for the cost when Cost Explorer cannot be read', () => {
    render(<Kpis m={M} diskPercent={null} costMtd={null} />)
    expect(figure('AWS, month to date')).toHaveTextContent('–')
  })
})

describe('VacuumNote', () => {
  it('says so when PGroonga has leftover objects to vacuum, and nothing otherwise', () => {
    const { container } = render(<VacuumNote m={M} />)
    expect(container).toBeEmptyDOMElement()
    render(<VacuumNote m={parseMetrics({ ...METRICS_PAYLOAD, pgroonga_surplus: 2 })} />)
    expect(screen.getByText(/2 surplus index datasets/)).toBeInTheDocument()
  })
})

describe('systemChecks', () => {
  const dump = (ageHours: number) => ({ id: 'postgres/x.dump', at: new Date(NOW - ageHours * 3_600_000).toISOString(), ageHours })

  it('is all ok on a healthy night', () => {
    const c = systemChecks(M, AUTH, { state: 'ok', alarms: [], dump: dump(3) }, NOW)
    expect(c.map((x) => x.tone)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok'])
    expect(c[2].text).toBe('Postgres 17.6 · 17/100 connections · up 2 d')
  })

  it('flags a missed backup night and a login that does not answer', () => {
    const c = systemChecks(M, { ok: false, ms: 5000, detail: 'TimeoutError' }, { state: 'ok', alarms: [], dump: dump(30) }, NOW)
    expect(c.find((x) => x.label === 'Auth')).toMatchObject({ tone: 'bad', text: 'No answer (TimeoutError)' })
    expect(c.find((x) => x.label === 'Backups')?.tone).toBe('warn')
  })

  it('names a firing alarm', () => {
    const alarm = { name: 'zhesen-disk-high', state: 'ALARM' as const, metric: 'disk_used_percent', latest: 91, threshold: 80, comparison: 'GreaterThanThreshold', updatedAt: null }
    const c = systemChecks(M, AUTH, { state: 'ok', alarms: [alarm], dump: dump(3) }, NOW)
    expect(c.find((x) => x.label === 'Alarms')).toMatchObject({ tone: 'bad', text: 'Firing: zhesen-disk-high' })
  })

  it('shows AWS as unknown, not as healthy, when it cannot be read', () => {
    const c = systemChecks(M, AUTH, { state: 'error', name: 'AccessDenied' }, NOW)
    expect(c.find((x) => x.label === 'Backups')).toMatchObject({ tone: 'idle', text: 'AWS unreadable (AccessDenied)' })
  })

  it('draws one tile per check', () => {
    render(<SystemStrip checks={systemChecks(M, AUTH, { state: 'off' }, NOW)} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getAllByText('AWS read not configured')).toHaveLength(2)
  })
})

describe('AuditLog', () => {
  it('names the action and shows its detail', () => {
    render(<AuditLog entries={[{
      id: 1, at: '2026-09-23T02:00:00Z', actor: 'u1', action: 'merge_account',
      target: 'u-into', detail: { from: 'u-from', into: 'u-into', moved: 410 },
    }]} />)
    expect(screen.getByText('Merge accounts')).toBeInTheDocument()
    expect(screen.getByText('from').nextSibling).toHaveTextContent('u-from')
    expect(screen.getByText('moved').nextSibling).toHaveTextContent('410')
  })

  it('says there is nothing yet rather than drawing an empty table', () => {
    render(<AuditLog entries={[]} />)
    expect(screen.getByText('No admin actions yet.')).toBeInTheDocument()
  })
})
