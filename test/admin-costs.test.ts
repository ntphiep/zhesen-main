import { describe, it, expect, vi } from 'vitest'
import { getCosts } from '@/lib/admin/control'

const h = vi.hoisted(() => ({ sent: [] as string[] }))

vi.mock('@/lib/admin/aws', () => ({ roleCredentials: () => ({}) }))

/** Cost Explorer answering with the groups it returned for 2026-10-01 to 2026-10-09. */
vi.mock('@aws-sdk/client-cost-explorer', () => {
  class Command {
    constructor(readonly input: Record<string, unknown>) {}
  }
  class GetCostAndUsageCommand extends Command {}
  class GetCostForecastCommand extends Command {}
  const group = (type: string, service: string, amount: string) =>
    ({ Keys: [type, service], Metrics: { UnblendedCost: { Amount: amount, Unit: 'USD' } } })
  class CostExplorerClient {
    async send(cmd: Command) {
      h.sent.push(cmd.constructor.name)
      if (cmd instanceof GetCostForecastCommand) return { Total: { Amount: '20.5', Unit: 'USD' } }
      return {
        ResultsByTime: [{
          Groups: [
            group('Credit', 'Amazon Elastic Compute Cloud - Compute', '-6.4948808704'),
            group('Credit', 'AWS Cost Explorer', '-0.32'),
            group('Tax', 'Tax', '0'),
            group('Usage', 'AWS Cost Explorer', '0.32'),
            group('Usage', 'Amazon CloudFront', '0.002811371'),
            group('Usage', 'Amazon Elastic Compute Cloud - Compute', '6.4948808704'),
          ],
        }],
      }
    }
  }
  return { CostExplorerClient, GetCostAndUsageCommand, GetCostForecastCommand }
})

describe('getCosts', () => {
  it('reads usage, credits and services from one request plus the forecast', async () => {
    const c = await getCosts({ roleArn: 'arn:aws:iam::123456789012:role/x', accountId: '123456789012' }, Date.UTC(2026, 9, 8))
    expect(h.sent.sort()).toEqual(['GetCostAndUsageCommand', 'GetCostForecastCommand'])
    expect(c.from).toBe('2026-10-01')
    expect(c.to).toBe('2026-10-09')
    expect(c.usage).toBeCloseTo(6.8176932414)
    expect(c.credits).toBeCloseTo(-6.8148808704)
    expect(c.byService).toEqual([
      { service: 'Amazon Elastic Compute Cloud - Compute', usage: 6.4948808704 },
      { service: 'AWS Cost Explorer', usage: 0.32 },
    ])
    expect(c.monthUsage).toBeCloseTo(6.8176932414 + 20.5)
    expect(c.unit).toBe('USD')
  })
})
