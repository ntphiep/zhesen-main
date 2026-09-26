import { describe, it, expect } from 'vitest'
import { costsByService } from '@/lib/admin/services'
import { amiLabel } from '@/components/admin/InfraControls'

describe('costsByService', () => {
  it('sums the Cost Explorer names of one row and keeps unclaimed charges apart', () => {
    const { rows, other } = costsByService([
      { service: 'Amazon Elastic Compute Cloud - Compute', usage: 2.41 },
      { service: 'EC2 - Other', usage: 0.64 },
      { service: 'Amazon Simple Storage Service', usage: 0.25 },
      { service: 'Amazon Redshift', usage: 0.01 },
    ])
    expect(rows.get('ec2')).toBeCloseTo(3.05)
    expect(rows.get('s3')).toBe(0.25)
    expect(rows.has('cloudfront')).toBe(false)
    expect(other).toEqual([{ service: 'Amazon Redshift', usage: 0.01 }])
  })
})

describe('amiLabel', () => {
  it('shortens an Ubuntu image name to its release and build date', () => {
    expect(amiLabel('ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-20260904')).toBe('Ubuntu 24.04 · 2026-09-04')
  })

  it('falls back to the last path part for any other image', () => {
    expect(amiLabel('amazon/al2023-ami-2023.5-arm64')).toBe('al2023-ami-2023.5-arm64')
  })
})
