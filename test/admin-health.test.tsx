import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { awsHealthConfig, summarizeHealth } from '@/lib/admin/aws'
import { HealthPanel } from '@/components/admin/HealthPanel'

/** `aws cloudwatch describe-alarms --alarm-name-prefix zhesen-` on 2026-09-23, two of six. */
const ALARMS = [
  { AlarmName: 'zhesen-cpu-credits-low', StateValue: 'OK', StateUpdatedTimestamp: '2026-09-23T03:21:03.001000+07:00',
    Namespace: 'AWS/EC2', MetricName: 'CPUCreditBalance', Statistic: 'Average', Period: 300, Threshold: 30.0,
    ComparisonOperator: 'LessThanThreshold', Dimensions: [{ Name: 'InstanceId', Value: 'i-0d914b6eceb4d9350' }] },
  { AlarmName: 'zhesen-disk-high', StateValue: 'OK', StateUpdatedTimestamp: '2026-09-23T01:12:39.453000+07:00',
    Namespace: 'CWAgent', MetricName: 'disk_used_percent', Statistic: 'Average', Period: 300, Threshold: 80.0,
    ComparisonOperator: 'GreaterThanThreshold',
    Dimensions: [{ Name: 'path', Value: '/' }, { Name: 'InstanceId', Value: 'i-0d914b6eceb4d9350' }] },
]

const NOW = Date.parse('2026-09-24T06:00:00Z')

describe('summarizeHealth', () => {
  it('pairs each alarm with its latest datapoint', () => {
    const h = summarizeHealth({ alarms: ALARMS, latest: [96.4, null], snapshots: [], objects: [] }, NOW)
    expect(h.alarms.map((a) => [a.name, a.state, a.latest])).toEqual([
      ['zhesen-cpu-credits-low', 'OK', 96.4],
      ['zhesen-disk-high', 'OK', null],
    ])
    expect(h.alarms[0].updatedAt).toBe('2026-09-22T20:21:03.001Z')
  })

  // What describe-snapshots and list-objects-v2 returned on 2026-09-23, before the first run.
  it('reads empty snapshot and dump listings as none yet', () => {
    const h = summarizeHealth({ alarms: [], latest: [], snapshots: [], objects: [] }, NOW)
    expect(h.snapshot).toBeNull()
    expect(h.dump).toBeNull()
  })

  it('takes the newest snapshot and the newest .dump, with their age in hours', () => {
    const h = summarizeHealth({
      alarms: [],
      latest: [],
      snapshots: [
        { SnapshotId: 'snap-old', StartTime: '2026-09-23T03:00:12Z', State: 'completed' },
        { SnapshotId: 'snap-new', StartTime: '2026-09-24T03:00:09Z', State: 'completed' },
      ],
      objects: [
        { Key: 'postgres/postgres-20260924T033001Z.dump', LastModified: '2026-09-24T03:30:40Z', Size: 61_000_000 },
        { Key: 'postgres/globals-20260924T033001Z.sql', LastModified: '2026-09-24T03:30:41Z', Size: 9_000 },
        { Key: 'postgres/postgres-20260923T033001Z.dump', LastModified: '2026-09-23T03:30:38Z', Size: 60_000_000 },
      ],
    }, NOW)
    expect(h.snapshot).toMatchObject({ id: 'snap-new', ageHours: 3, state: 'completed' })
    expect(h.dump).toMatchObject({ id: 'postgres/postgres-20260924T033001Z.dump', ageHours: 2.5, bytes: 61_000_000 })
  })
})

describe('awsHealthConfig', () => {
  const original = process.env.AWS_ROLE_ARN
  afterEach(() => {
    if (original === undefined) delete process.env.AWS_ROLE_ARN
    else process.env.AWS_ROLE_ARN = original
  })

  it('is null without a role, which the page shows as not configured', () => {
    delete process.env.AWS_ROLE_ARN
    expect(awsHealthConfig()).toBeNull()
  })

  it('reads the account from the role ARN', () => {
    process.env.AWS_ROLE_ARN = 'arn:aws:iam::014498663963:role/zhesen-vercel-health'
    expect(awsHealthConfig()).toEqual({
      roleArn: 'arn:aws:iam::014498663963:role/zhesen-vercel-health', accountId: '014498663963',
    })
  })
})

describe('HealthPanel', () => {
  it('shows each alarm state and says when no backup exists yet', () => {
    render(<HealthPanel health={summarizeHealth({ alarms: ALARMS, latest: [96.4, 41.2], snapshots: [], objects: [] }, NOW)} />)
    expect(screen.getByText('zhesen-disk-high').closest('tr')).toHaveTextContent('Bình thường')
    expect(screen.getByText(/Chưa có snapshot nào/)).toBeInTheDocument()
    expect(screen.getByText(/Chưa có bản dump nào/)).toBeInTheDocument()
  })

  it('prints the snapshot age', () => {
    render(<HealthPanel health={summarizeHealth({
      alarms: [], latest: [],
      snapshots: [{ SnapshotId: 'snap-new', StartTime: '2026-09-24T03:00:09Z', State: 'completed' }],
      objects: [],
    }, NOW)} />)
    expect(screen.getByText('3 giờ trước')).toBeInTheDocument()
    expect(screen.getByText('snap-new')).toBeInTheDocument()
  })
})
