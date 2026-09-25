import {
  DescribeImagesCommand, DescribeInstancesCommand, DescribeInstanceTypesCommand, DescribeVolumesCommand,
  ModifyInstanceAttributeCommand, RebootInstancesCommand, StartInstancesCommand, StopInstancesCommand,
  waitUntilInstanceRunning, waitUntilInstanceStopped, type EC2Client, type _InstanceType,
} from '@aws-sdk/client-ec2'
import { CostExplorerClient, GetCostAndUsageCommand, GetCostForecastCommand } from '@aws-sdk/client-cost-explorer'
import { GetProductsCommand, PricingClient } from '@aws-sdk/client-pricing'
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider'
import { z } from '@/lib/zod'
import type { AwsHealthConfig } from '@/lib/admin/aws'
import { INSTANCE_ID } from '@/lib/admin/ssm'
import { LOG_SERVICES } from '@/lib/admin/monitor'

/** The instance's Name tag (infra/terraform/modules/instance/ec2.tf), typed to confirm. */
export const INSTANCE_NAME = 'zhesen-supabase'

/** AWS sends amounts as decimal strings, such as "-0.0003193501" or "0.0416000000". */
const AMOUNT = z.string().regex(/^-?\d+(\.\d+)?(e-?\d+)?$/i).transform(Number)

const instanceStateSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  state: z.string(),
  type: z.string().nullable(),
  vcpus: z.number().nullable(),
  memoryGb: z.number().nullable(),
  arch: z.string().nullable(),
  az: z.string().nullable(),
  privateIp: z.string().nullable(),
  privateDns: z.string().nullable(),
  amiId: z.string().nullable(),
  amiName: z.string().nullable(),
  volume: z.object({
    id: z.string(), sizeGb: z.number().nullable(), type: z.string().nullable(), iops: z.number().nullable(), throughput: z.number().nullable(),
  }).nullable(),
  launchedAt: z.string().nullable(),
})

export type InstanceState = z.infer<typeof instanceStateSchema>

/** The types the admin may switch to, smallest first. */
export const INSTANCE_TYPES = ['t4g.small', 't4g.medium', 't4g.large', 't4g.xlarge'] as const
export type InstanceType = (typeof INSTANCE_TYPES)[number]

type Spec = { vcpus: number | null; memoryGb: number | null }

const instanceTypeInfo = z.array(z.object({
  InstanceType: z.string(),
  VCpuInfo: z.object({ DefaultVCpus: z.number().optional() }).optional(),
  MemoryInfo: z.object({ SizeInMiB: z.number().optional() }).optional(),
}))

async function typeSpecs(ec2: EC2Client, types: _InstanceType[]): Promise<Map<string, Spec>> {
  const out = await ec2.send(new DescribeInstanceTypesCommand({ InstanceTypes: types }))
  return new Map(instanceTypeInfo.parse(out.InstanceTypes ?? []).map((t) => [t.InstanceType, {
    vcpus: t.VCpuInfo?.DefaultVCpus ?? null,
    memoryGb: t.MemoryInfo?.SizeInMiB ? t.MemoryInfo.SizeInMiB / 1024 : null,
  }]))
}

/** The image, volume and type lookups are decoration: when one fails (a role without the
 *  permission, say) the state still answers, because /rescue reads it too. */
export async function instanceState(ec2: EC2Client): Promise<InstanceState> {
  const out = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [INSTANCE_ID] }))
  const i = out.Reservations?.[0]?.Instances?.[0]
  const volumeId = i?.BlockDeviceMappings?.find((m) => m.DeviceName === i.RootDeviceName)?.Ebs?.VolumeId
  const [image, volume, specs] = await Promise.all([
    i?.ImageId ? ec2.send(new DescribeImagesCommand({ ImageIds: [i.ImageId] })).then((o) => o.Images?.[0], () => undefined) : undefined,
    volumeId ? ec2.send(new DescribeVolumesCommand({ VolumeIds: [volumeId] })).then((o) => o.Volumes?.[0], () => undefined) : undefined,
    i?.InstanceType ? typeSpecs(ec2, [i.InstanceType]).then((m) => m.get(String(i.InstanceType)), () => undefined) : undefined,
  ])
  return instanceStateSchema.parse({
    id: INSTANCE_ID,
    name: i?.Tags?.find((t) => t.Key === 'Name')?.Value ?? null,
    state: i?.State?.Name ?? 'unknown',
    type: i?.InstanceType ?? null,
    vcpus: specs?.vcpus ?? null,
    memoryGb: specs?.memoryGb ?? null,
    arch: i?.Architecture ?? null,
    az: i?.Placement?.AvailabilityZone ?? null,
    privateIp: i?.PrivateIpAddress ?? null,
    privateDns: i?.PrivateDnsName ?? null,
    amiId: i?.ImageId ?? null,
    amiName: image?.Name ?? null,
    volume: volumeId ? {
      id: volumeId, sizeGb: volume?.Size ?? null, type: volume?.VolumeType ?? null, iops: volume?.Iops ?? null, throughput: volume?.Throughput ?? null,
    } : null,
    launchedAt: i?.LaunchTime ? new Date(i.LaunchTime).toISOString() : null,
  })
}

export interface TypeOption {
  type: InstanceType
  vcpus: number | null
  memoryGb: number | null
  usdPerHour: number | null
  usdPerMonth: number | null
}

/** One entry of GetProducts' PriceList, a JSON document per SKU. */
const priceListEntry = z.object({
  product: z.object({ attributes: z.object({ instanceType: z.string() }) }),
  terms: z.object({
    OnDemand: z.record(z.string(), z.object({
      priceDimensions: z.record(z.string(), z.object({ unit: z.string(), pricePerUnit: z.object({ USD: AMOUNT }) })),
    })),
  }),
})

/** The on-demand USD per hour in one PriceList entry, or null when it carries none. */
export function parsePrice(json: string): { type: string; usdPerHour: number } | null {
  const p = priceListEntry.parse(JSON.parse(json))
  const dim = Object.values(p.terms.OnDemand).flatMap((t) => Object.values(t.priceDimensions)).find((d) => d.unit === 'Hrs')
  return dim ? { type: p.product.attributes.instanceType, usdPerHour: dim.pricePerUnit.USD } : null
}

const PRICE_FILTERS = {
  location: 'Asia Pacific (Seoul)', operatingSystem: 'Linux', tenancy: 'Shared', capacitystatus: 'Used',
  preInstalledSw: 'NA', operation: 'RunInstances',
}

/** On-demand USD per hour for each type. The Pricing API answers from us-east-1 only.
 *  Throws when it cannot answer, so a cache around it keeps no empty result. */
export async function typePrices(cfg: AwsHealthConfig): Promise<Record<string, number>> {
  const credentials = awsCredentialsProvider({ roleArn: cfg.roleArn, clientConfig: { region: 'us-east-1' } })
  const pricing = new PricingClient({ region: 'us-east-1', credentials })
  const lists = await Promise.all(INSTANCE_TYPES.map((type) => pricing.send(new GetProductsCommand({
    ServiceCode: 'AmazonEC2',
    Filters: Object.entries({ ...PRICE_FILTERS, instanceType: type }).map(([Field, Value]) => ({ Type: 'TERM_MATCH', Field, Value })),
  }))))
  const prices: Record<string, number> = {}
  for (const out of lists) {
    // The SDK hands each entry over as a String object, not a primitive string.
    for (const entry of z.array(z.union([z.string(), z.instanceof(String)]).transform(String)).parse(out.PriceList ?? [])) {
      const p = parsePrice(entry)
      if (p) prices[p.type] = p.usdPerHour
    }
  }
  return prices
}

/** Hours AWS uses for a month on its pricing pages. */
const HOURS_PER_MONTH = 730

export async function typeOptions(ec2: EC2Client, prices: Record<string, number> | null): Promise<TypeOption[]> {
  const specs = await typeSpecs(ec2, [...INSTANCE_TYPES])
  return INSTANCE_TYPES.map((type) => {
    const hour = prices?.[type] ?? null
    return {
      type,
      vcpus: specs.get(type)?.vcpus ?? null,
      memoryGb: specs.get(type)?.memoryGb ?? null,
      usdPerHour: hour,
      usdPerMonth: hour === null ? null : Math.round(hour * HOURS_PER_MONTH * 100) / 100,
    }
  })
}

/** Stop, change the type, start. The two waits share the function's 300 s. A stop that does
 *  not finish leaves the type untouched; a failure after it still starts the instance, back
 *  on `from` when the new type will not start, and then rethrows. */
export async function resize(ec2: EC2Client, to: InstanceType, from: string | null, now: () => number = Date.now): Promise<number> {
  const started = now()
  const input = { InstanceIds: [INSTANCE_ID] }
  const setType = (value: string) => ec2.send(new ModifyInstanceAttributeCommand({ InstanceId: INSTANCE_ID, InstanceType: { Value: value } }))
  const start = () => ec2.send(new StartInstancesCommand(input))
  await ec2.send(new StopInstancesCommand(input))
  await waitUntilInstanceStopped({ client: ec2, maxWaitTime: 180, minDelay: 5, maxDelay: 10 }, input)
  try {
    await setType(to)
  } catch (e) {
    await start()
    throw e
  }
  try {
    await start()
  } catch (e) {
    if (from) await setType(from)
    await start()
    throw e
  }
  const left = Math.max(30, 270 - Math.round((now() - started) / 1000))
  await waitUntilInstanceRunning({ client: ec2, maxWaitTime: left, minDelay: 5, maxDelay: 10 }, input)
  return now() - started
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
