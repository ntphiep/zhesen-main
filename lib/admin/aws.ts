import { CloudWatchClient, DescribeAlarmsCommand, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch'
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider'
import { z } from '@/lib/zod'

/**
 * Instance and backup health for /admin and /admin/monitor, read with the role in
 * infra/terraform/modules/vercel/main.tf. The Vercel function trades its OIDC token for that role,
 * so no AWS key exists anywhere. `awsHealthConfig()` returning null is a valid state, like
 * `aiConfig()`: a deployment without AWS_ROLE_ARN shows the panel as not configured.
 *
 * Everything else is derived rather than configured. The alarms carry their own metric and
 * dimensions, and the dump bucket is named after the account (infra/terraform/main.tf).
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

type CredentialsProvider = ReturnType<typeof awsCredentialsProvider>
type Credentials = Awaited<ReturnType<CredentialsProvider>>

/** Exchanged again this long before AWS says the credentials expire. */
const REFRESH_MS = 5 * 60_000
const providers = new Map<string, CredentialsProvider>()

/**
 * The role's credentials, shared by every client on this instance until they near expiry.
 * The SDK keeps credentials per client and every read here builds new clients, so each page
 * and each poll paid one STS AssumeRoleWithWebIdentity per client, five on /admin/infra.
 * A failed exchange is not kept.
 */
export function roleCredentials(roleArn: string, region: string = REGION, now: () => number = Date.now): CredentialsProvider {
  const key = `${roleArn} ${region}`
  const known = providers.get(key)
  if (known) return known
  const exchange = awsCredentialsProvider({ roleArn, clientConfig: { region } })
  let held: Promise<Credentials> | null = null
  const provider: CredentialsProvider = async () => {
    const current = held && await held.catch(() => null)
    if (current && (!current.expiration || current.expiration.getTime() - now() > REFRESH_MS)) return current
    held = exchange()
    return held
  }
  providers.set(key, provider)
  return provider
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

const objectSchema = z.object({
  Key: z.string(),
  LastModified: z.coerce.date(),
  Size: z.number(),
})

export interface RawHealth {
  alarms: unknown[]
  /** Latest datapoint per alarm, in the order of `alarms`; null when there was none. */
  latest: (number | null)[]
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
  bytes?: number
}

export interface Health {
  alarms: AlarmStatus[]
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

  const dump = raw.objects.map((o) => objectSchema.parse(o))
    .filter((o) => o.Key.endsWith('.dump'))
    .sort((a, b) => b.LastModified.getTime() - a.LastModified.getTime())[0]

  return {
    alarms,
    dump: dump ? {
      id: dump.Key,
      at: dump.LastModified.toISOString(),
      ageHours: hoursSince(dump.LastModified, now),
      bytes: dump.Size,
    } : null,
  }
}

/** Three reads, each the one the role allows. The alarm metrics come back in one call. */
export async function getHealth(cfg: AwsHealthConfig, now: number = Date.now()): Promise<Health> {
  const credentials = roleCredentials(cfg.roleArn)
  const cloudwatch = new CloudWatchClient({ region: REGION, credentials })
  const s3 = new S3Client({ region: REGION, credentials })

  const [alarmOut, objectOut] = await Promise.all([
    cloudwatch.send(new DescribeAlarmsCommand({ AlarmNamePrefix: `${NAME_PREFIX}-` })),
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
    objects: objectOut.Contents ?? [],
  }, now)
}

/* ---------- History for /admin/monitor ---------- */

export type Range = '24h' | '7d'

export interface Series {
  id: string
  label: string
  unit: '%' | 'credits' | 'bytes'
  points: { t: string; v: number }[]
}

/** infra/terraform output `instance_id`. */
const INSTANCE = [{ Name: 'InstanceId', Value: 'i-0d914b6eceb4d9350' }]

/** Dimensions as `aws cloudwatch list-metrics` returns them; a metric only matches its
 *  exact dimension set. */
const HISTORY = [
  { id: 'cpu', label: 'CPU', unit: '%', ns: 'AWS/EC2', name: 'CPUUtilization', dims: INSTANCE, stat: 'Average' },
  { id: 'credits', label: 'CPU credits', unit: 'credits', ns: 'AWS/EC2', name: 'CPUCreditBalance', dims: INSTANCE, stat: 'Average' },
  { id: 'mem', label: 'Memory used', unit: '%', ns: 'CWAgent', name: 'mem_used_percent', dims: INSTANCE, stat: 'Average' },
  { id: 'disk', label: 'Disk used', unit: '%', ns: 'CWAgent', name: 'disk_used_percent', dims: [{ Name: 'path', Value: '/' }, ...INSTANCE], stat: 'Average' },
  { id: 'netin', label: 'Network in', unit: 'bytes', ns: 'AWS/EC2', name: 'NetworkIn', dims: INSTANCE, stat: 'Sum' },
  { id: 'netout', label: 'Network out', unit: 'bytes', ns: 'AWS/EC2', name: 'NetworkOut', dims: INSTANCE, stat: 'Sum' },
] as const

/** Five-minute points over a day, 30-minute points over a week: 288 and 336 per series. */
export async function getHistory(cfg: AwsHealthConfig, range: Range, now: number = Date.now()): Promise<Series[]> {
  const credentials = roleCredentials(cfg.roleArn)
  const cloudwatch = new CloudWatchClient({ region: REGION, credentials })
  const hours = range === '24h' ? 24 : 168
  const period = range === '24h' ? 300 : 1800
  const out = await cloudwatch.send(new GetMetricDataCommand({
    StartTime: new Date(now - hours * 3_600_000),
    EndTime: new Date(now),
    ScanBy: 'TimestampAscending',
    MetricDataQueries: HISTORY.map((m) => ({
      Id: m.id,
      MetricStat: { Metric: { Namespace: m.ns, MetricName: m.name, Dimensions: [...m.dims] }, Period: period, Stat: m.stat },
    })),
  }))
  return HISTORY.map((m) => {
    const r = out.MetricDataResults?.find((x) => x.Id === m.id)
    // Measured on production: the points came back newest first despite ScanBy.
    const points = (r?.Timestamps ?? [])
      .map((t, i) => ({ t: new Date(t).toISOString(), v: r?.Values?.[i] ?? 0 }))
      .sort((x, y) => x.t.localeCompare(y.t))
    return { id: m.id, label: m.label, unit: m.unit, points }
  })
}

/** Dumps in the backup bucket, newest first, for the restore picker on /admin/database. */
export async function listDumps(cfg: AwsHealthConfig): Promise<{ key: string; at: string; bytes: number }[]> {
  const credentials = roleCredentials(cfg.roleArn)
  const s3 = new S3Client({ region: REGION, credentials })
  const out = await s3.send(new ListObjectsV2Command({ Bucket: `${NAME_PREFIX}-db-backups-${cfg.accountId}`, Prefix: DUMP_PREFIX }))
  return z.array(objectSchema).parse(out.Contents ?? [])
    .filter((o) => o.Key.endsWith('.dump'))
    .map((o) => ({ key: o.Key, at: o.LastModified.toISOString(), bytes: o.Size }))
    .sort((a, b) => b.at.localeCompare(a.at))
}
