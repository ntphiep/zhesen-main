import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CapacitySection, DictionarySection, PeopleSection, systemChecks } from '@/components/admin/Overview'
import { AuditLog } from '@/components/admin/AuditLog'
import { parseMetrics } from '@/lib/admin/metrics'
import { METRICS_PAYLOAD } from './helpers/admin'

const M = parseMetrics(METRICS_PAYLOAD)
const AUTH = { ok: true, ms: 142, detail: 'GoTrue v2.197.0' }
const NOW = Date.parse('2026-09-25T06:00:00Z')

describe('DictionarySection', () => {
  it('shows the exact entry count and the count per language', () => {
    render(<DictionarySection m={M} />)
    expect(screen.getByText((36361).toLocaleString('vi-VN'))).toBeInTheDocument()
    expect(screen.getByText('Tiếng Trung').nextSibling).toHaveTextContent((4045).toLocaleString('vi-VN'))
  })
})

describe('CapacitySection', () => {
  it('labels the size outside every table as PGroonga', () => {
    render(<CapacitySection m={M} diskPercent={null} />)
    expect(screen.getByText(/phần\s+163 MB này nằm ngoài danh sách bảng/)).toBeInTheDocument()
  })

  it('lists the biggest tables with their row counts, linked to the dictionary', () => {
    render(<CapacitySection m={M} diskPercent={41.2} />)
    const link = screen.getByRole('link', { name: 'lex.senses' })
    expect(link).toHaveAttribute('href', '/admin/data?table=lex.senses')
    expect(link.parentElement).toHaveTextContent((183526).toLocaleString('vi-VN'))
    expect(screen.getByText(/41,2%/)).toBeInTheDocument()
  })

  it('says so when PGroonga has leftover objects to vacuum', () => {
    render(<CapacitySection m={parseMetrics({ ...METRICS_PAYLOAD, pgroonga_surplus: 2 })} diskPercent={null} />)
    expect(screen.getByText(/2 bộ dữ liệu thừa/)).toBeInTheDocument()
  })
})

describe('PeopleSection', () => {
  it('splits accounts and shows the last 7 days', () => {
    render(<PeopleSection m={M} />)
    expect(screen.getByText('5 có email, 2 ẩn danh')).toBeInTheDocument()
    expect(screen.getByText('Mới trong 7 ngày').previousSibling).toHaveTextContent('4')
    expect(screen.getByText('Có luyện tập trong 7 ngày').previousSibling).toHaveTextContent('1')
  })
})

describe('systemChecks', () => {
  const dump = (ageHours: number) => ({ id: 'postgres/x.dump', at: new Date(NOW - ageHours * 3_600_000).toISOString(), ageHours })

  it('is all ok on a healthy night', () => {
    const c = systemChecks(M, AUTH, { state: 'ok', alarms: [], dump: dump(3) }, NOW)
    expect(c.map((x) => x.tone)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok'])
    expect(c[2].text).toBe('Postgres 17.6, 17/100 kết nối, khởi động 2 ngày trước')
  })

  it('flags a missed backup night and a login that does not answer', () => {
    const c = systemChecks(M, { ok: false, ms: 5000, detail: 'TimeoutError' }, { state: 'ok', alarms: [], dump: dump(30) }, NOW)
    expect(c.find((x) => x.label === 'Đăng nhập')).toMatchObject({ tone: 'bad', text: 'Không trả lời (TimeoutError)' })
    expect(c.find((x) => x.label === 'Sao lưu')?.tone).toBe('warn')
  })

  it('names a firing alarm', () => {
    const alarm = { name: 'zhesen-disk-high', state: 'ALARM' as const, metric: 'disk_used_percent', latest: 91, threshold: 80, comparison: 'GreaterThanThreshold', updatedAt: null }
    const c = systemChecks(M, AUTH, { state: 'ok', alarms: [alarm], dump: dump(3) }, NOW)
    expect(c.find((x) => x.label === 'Cảnh báo')).toMatchObject({ tone: 'bad', text: 'Đang báo: zhesen-disk-high' })
  })

  it('shows AWS as unknown, not as healthy, when it cannot be read', () => {
    const c = systemChecks(M, AUTH, { state: 'error', name: 'AccessDenied' }, NOW)
    expect(c.find((x) => x.label === 'Sao lưu')).toMatchObject({ tone: 'idle', text: 'Không đọc được AWS (AccessDenied)' })
  })
})

describe('AuditLog', () => {
  it('names the action and shows its detail', () => {
    render(<AuditLog entries={[{
      id: 1, at: '2026-09-23T02:00:00Z', actor: 'u1', action: 'merge_account',
      target: 'u-into', detail: { from: 'u-from', into: 'u-into', moved: 410 },
    }]} />)
    expect(screen.getByText('Gộp tài khoản')).toBeInTheDocument()
    expect(screen.getByText('from').nextSibling).toHaveTextContent('u-from')
    expect(screen.getByText('moved').nextSibling).toHaveTextContent('410')
  })

  it('says there is nothing yet rather than drawing an empty table', () => {
    render(<AuditLog entries={[]} />)
    expect(screen.getByText('Chưa có thao tác quản trị nào.')).toBeInTheDocument()
  })
})
