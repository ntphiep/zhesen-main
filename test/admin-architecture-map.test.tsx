import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArchitectureMap, versionRows, type MapState } from '@/components/admin/ArchitectureMap'

const STATE: MapState = {
  edgeHost: 'dzt4vtlz9hm79.cloudfront.net',
  deployment: { env: 'production', region: 'icn1', commit: '0be88dc', node: 'v24.1.0' },
  auth: { tone: 'ok', text: 'Trả lời sau 142 ms', version: 'v2.197.0' },
  database: { tone: 'bad', text: 'Không trả lời (PostgrestError)', version: null },
  backups: { tone: 'ok', text: 'Bản gần nhất 3 giờ trước' },
  alarms: { tone: 'ok', text: '6 cảnh báo, không cái nào đang báo' },
  integrations: [{ label: 'Azure AI Translator', enabled: false }],
  bucket: 'zhesen-db-backups-014498663963',
}

describe('ArchitectureMap', () => {
  it('draws each container with the state measured for it', () => {
    render(<ArchitectureMap s={STATE} />)
    expect(screen.getByText('supabase-auth').parentElement).toHaveTextContent('Đang chạy')
    expect(screen.getByText('supabase-db').parentElement).toHaveTextContent('Lỗi')
    expect(screen.getByText('supabase-studio').parentElement).toHaveTextContent('Không đo được từ đây')
  })

  it('shows the edge host, the commit and each outside service', () => {
    render(<ArchitectureMap s={STATE} />)
    expect(screen.getByText('dzt4vtlz9hm79.cloudfront.net')).toBeInTheDocument()
    expect(screen.getByText(/commit 0be88dc/)).toBeInTheDocument()
    expect(screen.getByText('Azure AI Translator').parentElement).toHaveTextContent('Chưa cấu hình')
  })
})

describe('versionRows', () => {
  it('prefers the version the server reported, and says where each came from', () => {
    const rows = versionRows(STATE)
    expect(rows.find((r) => r.component === 'GoTrue')).toMatchObject({ version: 'v2.197.0', source: 'Đọc trực tiếp' })
    expect(rows.find((r) => r.component === 'Postgres')).toMatchObject({ version: '17.6.1.136', source: 'docker-compose.yml' })
  })
})
