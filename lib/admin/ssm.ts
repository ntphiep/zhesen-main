import { SSMClient, SendCommandCommand, GetCommandInvocationCommand, GetParameterCommand } from '@aws-sdk/client-ssm'
import { EC2Client } from '@aws-sdk/client-ec2'
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns'
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider'
import type { AwsHealthConfig } from '@/lib/admin/aws'

/**
 * Commands on the instance through SSM Run Command, with the role in
 * infra/terraform/modules/vercel/main.tf (`operate`). The instance id is not configured:
 * `infra/terraform` output `instance_id`, the only instance the role may target.
 */
export const INSTANCE_ID = 'i-0d914b6eceb4d9350'
export const REGION = 'ap-northeast-2'
export const ALERTS_TOPIC = (accountId: string) => `arn:aws:sns:${REGION}:${accountId}:zhesen-alerts`
export const RESCUE_PARAMETER = '/zhesen/prod/admin_rescue_secret'

/** GetCommandInvocation returns only the first 24,000 characters of each stream
 *  (StandardOutputContent in @aws-sdk/client-ssm). */
export const OUTPUT_LIMIT = 24_000

export function clients(cfg: AwsHealthConfig) {
  const credentials = awsCredentialsProvider({ roleArn: cfg.roleArn, clientConfig: { region: REGION } })
  return {
    ssm: new SSMClient({ region: REGION, credentials }),
    ec2: new EC2Client({ region: REGION, credentials }),
    sns: new SNSClient({ region: REGION, credentials }),
  }
}

export interface ShellResult {
  status: string
  exitCode: number
  stdout: string
  stderr: string
  /** True when a stream reached OUTPUT_LIMIT, so the tail is missing. */
  truncated: boolean
  ms: number
}

const TERMINAL = new Set(['Success', 'Failed', 'Cancelled', 'TimedOut', 'Cancelling'])

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Runs `script` as root with bash and waits for it. `timeoutSeconds` is enforced by the
 * SSM agent on the instance; the wait here gives up a little later.
 */
export async function runShell(ssm: SSMClient, script: string, timeoutSeconds = 30): Promise<ShellResult> {
  const started = Date.now()
  const sent = await ssm.send(new SendCommandCommand({
    InstanceIds: [INSTANCE_ID],
    DocumentName: 'AWS-RunShellScript',
    TimeoutSeconds: Math.max(30, timeoutSeconds),
    Parameters: { commands: [script], executionTimeout: [String(timeoutSeconds)] },
  }))
  const commandId = sent.Command?.CommandId
  if (!commandId) throw new Error('SendCommand returned no command id')

  const deadline = started + (timeoutSeconds + 15) * 1000
  await sleep(600)
  for (;;) {
    try {
      const out = await ssm.send(new GetCommandInvocationCommand({ CommandId: commandId, InstanceId: INSTANCE_ID }))
      if (out.Status && TERMINAL.has(out.Status)) {
        const stdout = out.StandardOutputContent ?? ''
        const stderr = out.StandardErrorContent ?? ''
        return {
          status: out.Status,
          exitCode: out.ResponseCode ?? -1,
          stdout,
          stderr,
          truncated: stdout.length >= OUTPUT_LIMIT || stderr.length >= OUTPUT_LIMIT,
          ms: Date.now() - started,
        }
      }
    } catch (e) {
      // The invocation is not visible for a moment after SendCommand returns.
      if (!(e instanceof Error && e.name === 'InvocationDoesNotExist')) throw e
    }
    if (Date.now() > deadline) {
      return { status: 'TimedOut', exitCode: -1, stdout: '', stderr: '', truncated: false, ms: Date.now() - started }
    }
    await sleep(700)
  }
}

export async function readRescueSecret(ssm: SSMClient): Promise<string | null> {
  try {
    const out = await ssm.send(new GetParameterCommand({ Name: RESCUE_PARAMETER, WithDecryption: true }))
    return out.Parameter?.Value ?? null
  } catch {
    return null
  }
}

/** One email to the alert address through the SNS topic the alarms already use. Never
 *  throws: a failed alert must not undo an action that has already run. SNS refuses a
 *  subject that is not ASCII, so callers pass an English one; the body may be anything. */
export async function alertOwner(sns: SNSClient, accountId: string, subject: string, body: string): Promise<boolean> {
  try {
    await sns.send(new PublishCommand({ TopicArn: ALERTS_TOPIC(accountId), Subject: subject.replace(/[^ -~]/g, '?').slice(0, 100), Message: body }))
    return true
  } catch {
    return false
  }
}
