import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatGrid } from '@/components/admin/StatGrid'
import { AuditLog } from '@/components/admin/AuditLog'
import { parseMetrics } from '@/lib/admin/metrics'
import { METRICS_PAYLOAD } from './helpers/admin'

describe('StatGrid', () => {
  it('shows the exact entry count the database returned', () => {
    render(<StatGrid metrics={parseMetrics(METRICS_PAYLOAD)} />)
    const card = screen.getByText('Mục từ').parentElement
    expect(card).toHaveTextContent((36361).toLocaleString('vi-VN'))
  })

  it('labels the size outside every table as PGroonga', () => {
    render(<StatGrid metrics={parseMetrics(METRICS_PAYLOAD)} />)
    const card = screen.getByText('PGroonga').parentElement
    expect(card).toHaveTextContent('163 MB')
    expect(screen.getByText(/Phần chênh 163 MB là dữ liệu PGroonga/)).toBeInTheDocument()
  })

  it('lists every table with its row count', () => {
    render(<StatGrid metrics={parseMetrics(METRICS_PAYLOAD)} />)
    const row = screen.getByText('lex.senses').closest('tr')
    expect(row).toHaveTextContent((183526).toLocaleString('vi-VN'))
  })

  it('says so when PGroonga has leftover objects to vacuum', () => {
    render(<StatGrid metrics={parseMetrics({ ...METRICS_PAYLOAD, pgroonga_surplus: 2 })} />)
    expect(screen.getByText(/2 bộ dữ liệu thừa/)).toBeInTheDocument()
  })
})

describe('AuditLog', () => {
  it('names the action and shows its detail', () => {
    render(<AuditLog entries={[{
      id: 1, at: '2026-09-23T02:00:00Z', actor: 'u1', action: 'merge_account',
      target: 'u-into', detail: { from: 'u-from', into: 'u-into', moved: 410 },
    }]} />)
    expect(screen.getByText('Gộp tài khoản')).toBeInTheDocument()
    expect(screen.getByText(/"from":"u-from"/)).toBeInTheDocument()
  })

  it('says there is nothing yet rather than drawing an empty table', () => {
    render(<AuditLog entries={[]} />)
    expect(screen.getByText('Chưa có thao tác quản trị nào.')).toBeInTheDocument()
  })
})
