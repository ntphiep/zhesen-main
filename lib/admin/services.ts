import { CloudWatchClient, DescribeAlarmsCommand } from '@aws-sdk/client-cloudwatch'
import { GetBucketLifecycleConfigurationCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { ListSubscriptionsByTopicCommand, SNSClient } from '@aws-sdk/client-sns'
import { DescribeParametersCommand, SSMClient } from '@aws-sdk/client-ssm'
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider'
import { z } from '@/lib/zod'
import type { AwsHealthConfig } from '@/lib/admin/aws'
import { ALERTS_TOPIC, REGION } from '@/lib/admin/ssm'

/** What each AWS service in the account does for zhesen, and the Cost Explorer names
 *  its charges arrive under. The order is the order of the table on /admin/infra. */
export const SERVICES = [
  { id: 'ec2', name: 'EC2 + EBS', role: 'Runs the Supabase stack in Docker', costNames: ['Amazon Elastic Compute Cloud - Compute', 'EC2 - Other'] },
  { id: 's3', name: 'S3', role: 'Nightly pg_dump backups', costNames: ['Amazon Simple Storage Service'] },
  { id: 'cloudfront', name: 'CloudFront', role: 'HTTPS edge in front of the instance', costNames: ['Amazon CloudFront'] },
  { id: 'vpc', name: 'VPC', role: 'Network, public IPv4 and the CloudFront VPC origin', costNames: ['Amazon Virtual Private Cloud'] },
  { id: 'cloudwatch', name: 'CloudWatch', role: 'Host metrics and alarms', costNames: ['AmazonCloudWatch'] },
  { id: 'sns', name: 'SNS', role: 'Delivers alarms and admin alerts', costNames: ['Amazon Simple Notification Service'] },
  { id: 'ssm', name: 'Systems Manager', role: 'Config and secrets, shell and Run Command', costNames: ['AWS Systems Manager'] },
  { id: 'budgets', name: 'Budgets', role: 'Monthly cost limit for the region', costNames: ['AWS Budgets'] },
  { id: 'ce', name: 'Cost Explorer', role: 'The cost figures on this page', costNames: ['AWS Cost Explorer'] },
  { id: 'iam', name: 'IAM', role: 'The role Vercel assumes through OIDC', costNames: [] },
] as const

export type ServiceId = (typeof SERVICES)[number]['id']

const bucketObject = z.object({ Key: z.string(), LastModified: z.coerce.date(), Size: z.number() })
const lifecycleRule = z.object({ Status: z.string(), Expiration: z.object({ Days: z.number().optional() }).optional() })
const subscription = z.object({ Protocol: z.string().optional(), SubscriptionArn: z.string().optional() })
const alarm = z.object({ StateValue: z.string().optional() })

export interface ServiceFacts {
  s3: { bucket: string; dumps: number; bytes: number; newest: string | null; retainDays: number | null } | null
  cloudwatch: { alarms: number; firing: number } | null
  sns: { topic: string; subscriptions: { protocol: string; pending: boolean }[] } | null
  ssm: { parameters: number } | null
  iam: { role: string }
}

/** One read per service, each allowed to fail alone: a missing permission blanks its row,
 *  not the page. */
export async function serviceFacts(cfg: AwsHealthConfig): Promise<ServiceFacts> {
  const credentials = awsCredentialsProvider({ roleArn: cfg.roleArn, clientConfig: { region: REGION } })
  const s3 = new S3Client({ region: REGION, credentials })
  const bucket = `zhesen-db-backups-${cfg.accountId}`
  const topic = ALERTS_TOPIC(cfg.accountId)
  const orNull = <T,>(p: Promise<T>) => p.catch(() => null)

  const [objects, lifecycle, alarms, subs, params] = await Promise.all([
    orNull(s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'postgres/' }))),
    orNull(s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }))),
    orNull(new CloudWatchClient({ region: REGION, credentials }).send(new DescribeAlarmsCommand({ AlarmNamePrefix: 'zhesen-' }))),
    orNull(new SNSClient({ region: REGION, credentials }).send(new ListSubscriptionsByTopicCommand({ TopicArn: topic }))),
    orNull(new SSMClient({ region: REGION, credentials }).send(new DescribeParametersCommand({
      ParameterFilters: [{ Key: 'Path', Option: 'Recursive', Values: ['/zhesen/'] }], MaxResults: 50,
    }))),
  ])

  const dumps = objects ? z.array(bucketObject).parse(objects.Contents ?? []).filter((o) => o.Key.endsWith('.dump')) : null
  const rules = lifecycle ? z.array(lifecycleRule).parse(lifecycle.Rules ?? []) : []
  const states = alarms ? z.array(alarm).parse(alarms.MetricAlarms ?? []) : null

  return {
    s3: dumps && {
      bucket,
      dumps: dumps.length,
      bytes: dumps.reduce((n, o) => n + o.Size, 0),
      newest: dumps.map((o) => o.LastModified.toISOString()).sort().at(-1) ?? null,
      retainDays: rules.find((r) => r.Status === 'Enabled' && r.Expiration?.Days)?.Expiration?.Days ?? null,
    },
    cloudwatch: states && { alarms: states.length, firing: states.filter((a) => a.StateValue === 'ALARM').length },
    sns: subs && {
      topic: topic.split(':').at(-1) ?? topic,
      subscriptions: z.array(subscription).parse(subs.Subscriptions ?? []).map((s) => ({
        protocol: s.Protocol ?? '?',
        pending: s.SubscriptionArn === 'PendingConfirmation',
      })),
    },
    ssm: params && { parameters: z.array(z.unknown()).parse(params.Parameters ?? []).length },
    iam: { role: cfg.roleArn.split('/').at(-1) ?? cfg.roleArn },
  }
}

/** Month-to-date usage per row, and the account's charges that no row claims. */
export function costsByService(byService: { service: string; usage: number }[]): { rows: Map<ServiceId, number>; other: { service: string; usage: number }[] } {
  const rows = new Map<ServiceId, number>()
  const other: { service: string; usage: number }[] = []
  for (const s of byService) {
    const row = SERVICES.find((r) => (r.costNames as readonly string[]).includes(s.service))
    if (row) rows.set(row.id, (rows.get(row.id) ?? 0) + s.usage)
    else other.push(s)
  }
  return { rows, other }
}
