import {
  DescribeInstancesCommand, RebootInstancesCommand, StartInstancesCommand, StopInstancesCommand, type EC2Client,
} from '@aws-sdk/client-ec2'
import { CostExplorerClient, GetCostAndUsageCommand, GetCostForecastCommand } from '@aws-sdk/client-cost-explorer'
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider'
import { z } from '@/lib/zod'
import type { AwsHealthConfig } from '@/lib/admin/aws'
import { INSTANCE_ID } from '@/lib/admin/ssm'
import { LOG_SERVICES } from '@/lib/admin/monitor'

/** The instance's Name tag (infra/terraform/modules/instance/ec2.tf), typed to confirm. */
export const INSTANCE_NAME = 'zhesen-supabase'

export interface InstanceState {
  state: string
  type: string | null
  launchedAt: string | null
  privateDns: string | null
}

export async function instanceState(ec2: EC2Client): Promise<InstanceState> {
  const out = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [INSTANCE_ID] }))
  const i = out.Reservations?.[0]?.Instances?.[0]
  return {
    state: i?.State?.Name ?? 'unknown',
    type: i?.InstanceType ?? null,
    launchedAt: i?.LaunchTime ? new Date(i.LaunchTime).toISOString() : null,
    privateDns: i?.PrivateDnsName ?? null,
  }
}

export type PowerAction = 'start' | 'stop' | 'reboot'

export async function power(ec2: EC2Client, action: PowerAction): Promise<void> {
  const input = { InstanceIds: [INSTANCE_ID] }
  if (action === 'start') await ec2.send(new StartInstancesCommand(input))
  else if (action === 'stop') await ec2.send(new StopInstancesCommand(input))
  else await ec2.send(new RebootInstancesCommand(input))
}

export type Service = (typeof LOG_SERVICES)[number]

/** Restart one container and print its new start time, so the result proves it happened. */
export function restartScript(service: Service): string {
  if (!LOG_SERVICES.includes(service)) throw new Error(`unknown service ${service}`)
  return `docker restart supabase-${service} >/dev/null && docker inspect --format '{{.State.StartedAt}}' supabase-${service}`
}

/** The nightly job itself (cloud-init cron line), logged where the cron run logs. SSM runs
 *  scripts with /bin/sh, which on Ubuntu is dash and has no pipefail. */
export const BACKUP_SCRIPT = "bash -o pipefail -c '/opt/zhesen/supabase/bin/backup.sh 2>&1 | tee -a /var/log/zhesen-backup.log | tail -5'"

export interface Costs {
  /** First day of the month and the day after today, as Cost Explorer reads them. */
  from: string
  to: string
  usage: number
  credits: number
  net: number
  byService: { service: string; usage: number }[]
  /** Usage for the whole month: to date plus AWS's forecast for the rest. Null on the
   *  last day, when there is no rest to forecast. */
  monthUsage: number | null
  unit: string
}

const day = (d: Date) => d.toISOString().slice(0, 10)
/** Cost Explorer sends amounts as decimal strings, such as "-0.0003193501". */
const AMOUNT = z.string().regex(/^-?\d+(\.\d+)?(e-?\d+)?$/i).transform(Number)
const USAGE_ONLY = { Dimensions: { Key: 'RECORD_TYPE' as const, Values: ['Usage'] } }

/** Cost Explorer answers from us-east-1 only and charges USD 0.01 per request, so the
 *  page caches this (app/admin/infra/page.tsx). */
export async function getCosts(cfg: AwsHealthConfig, now: number = Date.now()): Promise<Costs> {
  const credentials = awsCredentialsProvider({ roleArn: cfg.roleArn, clientConfig: { region: 'us-east-1' } })
  const ce = new CostExplorerClient({ region: 'us-east-1', credentials })
  const today = new Date(now)
  const from = day(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)))
  const to = day(new Date(now + 86_400_000))
  const monthEnd = day(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)))
  const period = { Start: from, End: to }

  const [byType, byService, forecast] = await Promise.all([
    ce.send(new GetCostAndUsageCommand({
      TimePeriod: period, Granularity: 'MONTHLY', Metrics: ['UnblendedCost'],
      GroupBy: [{ Type: 'DIMENSION', Key: 'RECORD_TYPE' }],
    })),
    ce.send(new GetCostAndUsageCommand({
      TimePeriod: period, Granularity: 'MONTHLY', Metrics: ['UnblendedCost'], Filter: USAGE_ONLY,
      GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
    })),
    to < monthEnd
      ? ce.send(new GetCostForecastCommand({
        TimePeriod: { Start: to, End: monthEnd }, Metric: 'UNBLENDED_COST', Granularity: 'MONTHLY', Filter: USAGE_ONLY,
      })).catch(() => null)
      : Promise.resolve(null),
  ])

  const amount = (g: { Metrics?: Record<string, { Amount?: string; Unit?: string }> }) => AMOUNT.parse(g.Metrics?.UnblendedCost?.Amount ?? '0')
  const typeGroups = byType.ResultsByTime?.[0]?.Groups ?? []
  const ofType = (t: string) => typeGroups.filter((g) => g.Keys?.[0] === t).reduce((n, g) => n + amount(g), 0)
  const usage = ofType('Usage')
  const credits = ofType('Credit')
  const net = typeGroups.reduce((n, g) => n + amount(g), 0)
  const services = (byService.ResultsByTime?.[0]?.Groups ?? [])
    .map((g) => ({ service: g.Keys?.[0] ?? '?', usage: amount(g) }))
    .filter((s) => s.usage >= 0.005)
    .sort((a, b) => b.usage - a.usage)
  const rest = forecast?.Total?.Amount ? AMOUNT.parse(forecast.Total.Amount) : null

  return {
    from, to, usage, credits, net: Math.max(0, net), byService: services,
    monthUsage: rest === null ? (to >= monthEnd ? usage : null) : usage + rest,
    unit: typeGroups[0]?.Metrics?.UnblendedCost?.Unit ?? 'USD',
  }
}
