import { CloudWatchClient, DescribeAlarmsCommand, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch'
import { EC2Client, DescribeSnapshotsCommand } from '@aws-sdk/client-ec2'
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider'
import { z } from '@/lib/zod'

/**
 * Instance and backup health for /admin/health, read with the role in
 * infra/terraform/vercel-oidc.tf. The Vercel function trades its OIDC token for that role,
 * so no AWS key exists anywhere. `awsHealthConfig()` returning null is a valid state, like
 * `aiConfig()`: a deployment without AWS_ROLE_ARN shows the panel as not configured.
 *
 * Everything else is derived rather than configured. The alarms carry their own metric and
 * dimensions, the snapshots carry the `Backup` tag DLM targets (infra/terraform/backup.tf),
 * and the dump bucket is named after the account (infra/terraform/locals.tf).
 */

/** infra/terraform/variables.tf `region`. */
const REGION = 'ap-northeast-2'
const NAME_PREFIX = 'zhesen'
const DUMP_PREFIX = 'postgres/'

export interface AwsHealthConfig {
  roleArn: string
  accountId: string
}

export function awsHealthConfig(): AwsHealthConfig | null {
  const roleArn = process.env.AWS_ROLE_ARN?.trim()
  const accountId = roleArn?.match(/^arn:aws:iam::(\d{12}):role\//)?.[1]
  return roleArn && accountId ? { roleArn, accountId } : null
}

const alarmSchema = z.object({
  AlarmName: z.string(),
  StateValue: z.enum(['OK', 'ALARM', 'INSUFFICIENT_DATA']),
  StateUpdatedTimestamp: z.coerce.date().optional(),
  Namespace: z.string(),
  MetricName: z.string(),
  Statistic: z.string(),
  Period: z.number(),
  Threshold: z.number(),
  ComparisonOperator: z.string(),
  Dimensions: z.array(z.object({ Name: z.string(), Value: z.string() })).default([]),
})

const snapshotSchema = z.object({
  SnapshotId: z.string(),
  StartTime: z.coerce.date(),
  State: z.string(),
})

const objectSchema = z.object({
  Key: z.string(),
  LastModified: z.coerce.date(),
  Size: z.number(),
})

export interface RawHealth {
  alarms: unknown[]
  /** Latest datapoint per alarm, in the order of `alarms`; null when there was none. */
  latest: (number | null)[]
  snapshots: unknown[]
  objects: unknown[]
}

export interface AlarmStatus {
  name: string
  state: 'OK' | 'ALARM' | 'INSUFFICIENT_DATA'
  metric: string
  latest: number | null
  threshold: number
  comparison: string
  updatedAt: string | null
}

export interface BackupStatus {
  id: string
  at: string
  ageHours: number
  state?: string
  bytes?: number
}

export interface Health {
  alarms: AlarmStatus[]
  snapshot: BackupStatus | null
  dump: BackupStatus | null
}

const hoursSince = (d: Date, now: number) => Math.round(((now - d.getTime()) / 3_600_000) * 10) / 10

/** The newest of each, in words the panel can print. Pure, so a recorded response tests it. */
export function summarizeHealth(raw: RawHealth, now: number = Date.now()): Health {
  const alarms = raw.alarms.map((a, i) => {
    const x = alarmSchema.parse(a)
    return {
      name: x.AlarmName,
      state: x.StateValue,
      metric: x.MetricName,
      latest: raw.latest[i] ?? null,
      threshold: x.Threshold,
      comparison: x.ComparisonOperator,
      updatedAt: x.StateUpdatedTimestamp?.toISOString() ?? null,
    }
  })

  const snapshot = raw.snapshots.map((s) => snapshotSchema.parse(s))
    .sort((a, b) => b.StartTime.getTime() - a.StartTime.getTime())[0]
  const dump = raw.objects.map((o) => objectSchema.parse(o))
    .filter((o) => o.Key.endsWith('.dump'))
    .sort((a, b) => b.LastModified.getTime() - a.LastModified.getTime())[0]

  return {
    alarms,
    snapshot: snapshot ? {
      id: snapshot.SnapshotId,
      at: snapshot.StartTime.toISOString(),
      ageHours: hoursSince(snapshot.StartTime, now),
      state: snapshot.State,
    } : null,
    dump: dump ? {
      id: dump.Key,
      at: dump.LastModified.toISOString(),
      ageHours: hoursSince(dump.LastModified, now),
      bytes: dump.Size,
    } : null,
  }
}

/** Four reads, each the one the role allows. The alarm metrics come back in one call. */
export async function getHealth(cfg: AwsHealthConfig, now: number = Date.now()): Promise<Health> {
  const credentials = awsCredentialsProvider({ roleArn: cfg.roleArn, clientConfig: { region: REGION } })
  const cloudwatch = new CloudWatchClient({ region: REGION, credentials })
  const ec2 = new EC2Client({ region: REGION, credentials })
  const s3 = new S3Client({ region: REGION, credentials })

  const [alarmOut, snapshotOut, objectOut] = await Promise.all([
    cloudwatch.send(new DescribeAlarmsCommand({ AlarmNamePrefix: `${NAME_PREFIX}-` })),
    ec2.send(new DescribeSnapshotsCommand({
      OwnerIds: ['self'],
      Filters: [{ Name: 'tag:Backup', Values: [NAME_PREFIX] }],
    })),
    s3.send(new ListObjectsV2Command({
      Bucket: `${NAME_PREFIX}-db-backups-${cfg.accountId}`,
      Prefix: DUMP_PREFIX,
    })),
  ])
  const alarms = alarmOut.MetricAlarms ?? []

  const latest: (number | null)[] = alarms.map(() => null)
  if (alarms.length > 0) {
    const metricOut = await cloudwatch.send(new GetMetricDataCommand({
      StartTime: new Date(now - 3 * 3_600_000),
      EndTime: new Date(now),
      ScanBy: 'TimestampDescending',
      MetricDataQueries: alarms.map((a, i) => ({
        Id: `m${i}`,
        MetricStat: {
          Metric: { Namespace: a.Namespace, MetricName: a.MetricName, Dimensions: a.Dimensions },
          Period: a.Period,
          Stat: a.Statistic,
        },
      })),
    }))
    for (const r of metricOut.MetricDataResults ?? []) {
      const i = Number(r.Id?.slice(1))
      if (Number.isInteger(i) && r.Values?.length) latest[i] = r.Values[0]
    }
  }

  return summarizeHealth({
    alarms,
    latest,
    snapshots: snapshotOut.Snapshots ?? [],
    objects: objectOut.Contents ?? [],
  }, now)
}
