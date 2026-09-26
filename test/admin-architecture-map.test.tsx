import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ArchitectureMap, versionRows, type MapState } from '@/components/admin/ArchitectureMap'

const STATE: MapState = {
  edgeHost: 'dzt4vtlz9hm79.cloudfront.net',
  deployment: { env: 'production', region: 'icn1', commit: '0be88dc', node: 'v24.1.0' },
  auth: { tone: 'ok', text: '142 ms', version: 'v2.197.0' },
  database: { tone: 'bad', text: 'No answer (PostgrestError)', version: null },
  backups: { tone: 'ok', text: 'Last dump 3 h ago' },
  alarms: { tone: 'ok', text: '6 alarms OK' },
  integrations: [{ label: 'Azure AI Translator', enabled: false }],
  bucket: 'zhesen-db-backups-014498663963',
}

describe('ArchitectureMap', () => {
  it('draws each container with the state measured for it', () => {
    render(<ArchitectureMap s={STATE} />)
    const chip = (name: string) => screen.getByText(name).closest('li') as HTMLElement
    expect(within(chip('auth')).getByRole('img')).toHaveAccessibleName('142 ms')
    expect(within(chip('db')).getByRole('img')).toHaveAccessibleName('No answer (PostgrestError)')
    expect(within(chip('studio')).getByRole('img')).toHaveAccessibleName('Not probed from here')
    expect(chip('db')).toHaveAttribute('title', expect.stringMatching(/^Postgres 17/))
  })

  it('shows the edge host, the commit and each outside service', () => {
    render(<ArchitectureMap s={STATE} />)
    expect(screen.getByText('dzt4vtlz9hm79.cloudfront.net')).toBeInTheDocument()
    expect(screen.getByText('production · 0be88dc')).toBeInTheDocument()
    expect(within(screen.getByText('Azure AI Translator').closest('li') as HTMLElement).getByRole('img')).toHaveAccessibleName('not configured')
  })

  it('nests the instance inside the VPC inside the AWS region', () => {
    render(<ArchitectureMap s={STATE} />)
    const vpc = screen.getByText('VPC · public subnet').parentElement as HTMLElement
    expect(within(vpc).getByText('EC2')).toBeInTheDocument()
    const aws = screen.getByText(/^AWS · ap-northeast-2/).parentElement as HTMLElement
    expect(within(aws).getByText('CloudFront')).toBeInTheDocument()
    expect(within(aws).getByText('VPC · public subnet')).toBeInTheDocument()
  })
})

describe('versionRows', () => {
  it('prefers the version the server reported, else the compose image', () => {
    const rows = versionRows(STATE)
    expect(rows.find((r) => r.component === 'GoTrue')).toMatchObject({ version: 'v2.197.0' })
    expect(rows.find((r) => r.component === 'Postgres')).toMatchObject({ version: '17.6.1.136' })
  })
})
