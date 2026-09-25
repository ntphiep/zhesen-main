import { describe, it, expect, vi } from 'vitest'
import type { EC2Client } from '@aws-sdk/client-ec2'
import { instanceState, parsePrice, resize, typeOptions } from '@/lib/admin/control'
import { INSTANCE_ID } from '@/lib/admin/ssm'

/** An EC2 client that answers from `answers` by command name and records each call. */
function fakeEc2(answers: Record<string, (input: Record<string, unknown>) => unknown>) {
  const calls: { name: string; input: Record<string, unknown> }[] = []
  const send = vi.fn(async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
    const name = cmd.constructor.name.replace(/Command$/, '')
    calls.push({ name, input: cmd.input })
    const answer = answers[name]
    if (!answer) throw Object.assign(new Error(`unexpected ${name}`), { name: 'Unexpected' })
    return answer(cmd.input)
  })
  return { ec2: { send } as unknown as EC2Client, calls }
}

const described = (state: string, type = 't4g.medium') => ({
  Reservations: [{ Instances: [{ InstanceId: INSTANCE_ID, State: { Name: state }, InstanceType: type }] }],
})

describe('resize', () => {
  it('stops, waits for stopped, changes the type, starts and waits for running, in that order', async () => {
    let state = 'running'
    const { ec2, calls } = fakeEc2({
      StopInstances: () => { state = 'stopped'; return {} },
      DescribeInstances: () => described(state),
      ModifyInstanceAttribute: () => ({}),
      StartInstances: () => { state = 'running'; return {} },
    })
    const ms = await resize(ec2, 't4g.large', 't4g.medium')
    expect(calls.map((c) => c.name)).toEqual([
      'StopInstances', 'DescribeInstances', 'ModifyInstanceAttribute', 'StartInstances', 'DescribeInstances',
    ])
    expect(calls[2].input).toEqual({ InstanceId: INSTANCE_ID, InstanceType: { Value: 't4g.large' } })
    expect(ms).toBeGreaterThanOrEqual(0)
  })

  it('leaves the type alone when the stop fails', async () => {
    const { ec2, calls } = fakeEc2({
      StopInstances: () => { throw Object.assign(new Error('no'), { name: 'IncorrectInstanceState' }) },
    })
    await expect(resize(ec2, 't4g.large', 't4g.medium')).rejects.toThrow()
    expect(calls.map((c) => c.name)).toEqual(['StopInstances'])
  })

  it('starts the instance again when the type change is refused', async () => {
    let state = 'running'
    const { ec2, calls } = fakeEc2({
      StopInstances: () => { state = 'stopped'; return {} },
      DescribeInstances: () => described(state),
      ModifyInstanceAttribute: () => { throw Object.assign(new Error('no'), { name: 'UnauthorizedOperation' }) },
      StartInstances: () => { state = 'running'; return {} },
    })
    await expect(resize(ec2, 't4g.large', 't4g.medium')).rejects.toThrow('no')
    expect(calls.map((c) => c.name)).toEqual(['StopInstances', 'DescribeInstances', 'ModifyInstanceAttribute', 'StartInstances'])
  })

  it('goes back to the old type and starts when the new type will not start', async () => {
    let starts = 0
    const { ec2, calls } = fakeEc2({
      StopInstances: () => ({}),
      DescribeInstances: () => described('stopped'),
      ModifyInstanceAttribute: () => ({}),
      StartInstances: () => {
        starts += 1
        if (starts === 1) throw Object.assign(new Error('full'), { name: 'InsufficientInstanceCapacity' })
        return {}
      },
    })
    await expect(resize(ec2, 't4g.xlarge', 't4g.medium')).rejects.toThrow('full')
    expect(calls.map((c) => c.name)).toEqual(['StopInstances', 'DescribeInstances', 'ModifyInstanceAttribute', 'StartInstances', 'ModifyInstanceAttribute', 'StartInstances'])
    expect(calls[4].input).toEqual({ InstanceId: INSTANCE_ID, InstanceType: { Value: 't4g.medium' } })
  })
})

describe('instanceState', () => {
  const instance = {
    InstanceId: INSTANCE_ID, State: { Name: 'running' }, InstanceType: 't4g.medium', Architecture: 'arm64',
    Placement: { AvailabilityZone: 'ap-northeast-2a' }, PrivateIpAddress: '10.0.1.20', PrivateDnsName: 'ip-10-0-1-20.ap-northeast-2.compute.internal',
    ImageId: 'ami-0abc', RootDeviceName: '/dev/sda1', LaunchTime: new Date('2026-09-23T01:00:00Z'),
    BlockDeviceMappings: [{ DeviceName: '/dev/sda1', Ebs: { VolumeId: 'vol-0123' } }],
    Tags: [{ Key: 'Name', Value: 'zhesen-supabase' }],
  }

  it('joins the instance with its image, root volume and type', async () => {
    const { ec2 } = fakeEc2({
      DescribeInstances: () => ({ Reservations: [{ Instances: [instance] }] }),
      DescribeImages: () => ({ Images: [{ Name: 'ubuntu-noble-24.04-arm64' }] }),
      DescribeVolumes: () => ({ Volumes: [{ Size: 30, VolumeType: 'gp3', Iops: 3000, Throughput: 125 }] }),
      DescribeInstanceTypes: () => ({ InstanceTypes: [{ InstanceType: 't4g.medium', VCpuInfo: { DefaultVCpus: 2 }, MemoryInfo: { SizeInMiB: 4096 } }] }),
    })
    await expect(instanceState(ec2)).resolves.toEqual({
      id: INSTANCE_ID, name: 'zhesen-supabase', state: 'running', type: 't4g.medium', vcpus: 2, memoryGb: 4, arch: 'arm64',
      az: 'ap-northeast-2a', privateIp: '10.0.1.20', privateDns: 'ip-10-0-1-20.ap-northeast-2.compute.internal',
      amiId: 'ami-0abc', amiName: 'ubuntu-noble-24.04-arm64',
      volume: { id: 'vol-0123', sizeGb: 30, type: 'gp3', iops: 3000, throughput: 125 },
      launchedAt: '2026-09-23T01:00:00.000Z',
    })
  })

  // /rescue reads the state too, and a role without the newer permissions must not break it.
  it('still answers the state when the image, volume and type lookups are refused', async () => {
    const { ec2 } = fakeEc2({ DescribeInstances: () => ({ Reservations: [{ Instances: [instance] }] }) })
    await expect(instanceState(ec2)).resolves.toMatchObject({
      state: 'running', type: 't4g.medium', vcpus: null, amiName: null,
      volume: { id: 'vol-0123', sizeGb: null, type: null, iops: null, throughput: null },
    })
  })
})

/** One PriceList entry as GetProducts returns it for t4g.medium in Seoul, trimmed. */
const PRICE = JSON.stringify({
  product: { productFamily: 'Compute Instance', attributes: { instanceType: 't4g.medium', location: 'Asia Pacific (Seoul)', vcpu: '2' } },
  serviceCode: 'AmazonEC2',
  terms: {
    OnDemand: {
      'ABC.JRTCKXETXF': {
        priceDimensions: {
          'ABC.JRTCKXETXF.6YS6EN2CT7': { unit: 'Hrs', pricePerUnit: { USD: '0.0416000000' }, description: '$0.0416 per On Demand Linux t4g.medium Instance Hour' },
        },
        sku: 'ABC',
      },
    },
  },
})

describe('parsePrice', () => {
  it('reads the on-demand hourly USD of one PriceList entry', () => {
    expect(parsePrice(PRICE)).toEqual({ type: 't4g.medium', usdPerHour: 0.0416 })
  })

  it('returns null for an entry without an hourly dimension and throws on a foreign shape', () => {
    const noHours = JSON.parse(PRICE) as { terms: { OnDemand: Record<string, { priceDimensions: Record<string, { unit: string }> }> } }
    noHours.terms.OnDemand['ABC.JRTCKXETXF'].priceDimensions['ABC.JRTCKXETXF.6YS6EN2CT7'].unit = 'Quantity'
    expect(parsePrice(JSON.stringify(noHours))).toBeNull()
    expect(() => parsePrice('{"product":{}}')).toThrow()
  })
})

describe('typeOptions', () => {
  const specs = fakeEc2({
    DescribeInstanceTypes: () => ({
      InstanceTypes: [
        { InstanceType: 't4g.small', VCpuInfo: { DefaultVCpus: 2 }, MemoryInfo: { SizeInMiB: 2048 } },
        { InstanceType: 't4g.medium', VCpuInfo: { DefaultVCpus: 2 }, MemoryInfo: { SizeInMiB: 4096 } },
        { InstanceType: 't4g.large', VCpuInfo: { DefaultVCpus: 2 }, MemoryInfo: { SizeInMiB: 8192 } },
        { InstanceType: 't4g.xlarge', VCpuInfo: { DefaultVCpus: 4 }, MemoryInfo: { SizeInMiB: 16384 } },
      ],
    }),
  })

  it('lists the four types with specs and prices for 730 hours', async () => {
    const options = await typeOptions(specs.ec2, { 't4g.medium': 0.0416 })
    expect(options.map((o) => o.type)).toEqual(['t4g.small', 't4g.medium', 't4g.large', 't4g.xlarge'])
    expect(options[1]).toEqual({ type: 't4g.medium', vcpus: 2, memoryGb: 4, usdPerHour: 0.0416, usdPerMonth: 30.37 })
    expect(options[3]).toMatchObject({ vcpus: 4, memoryGb: 16, usdPerHour: null, usdPerMonth: null })
  })

  it('keeps the list without prices when pricing failed', async () => {
    const options = await typeOptions(specs.ec2, null)
    expect(options.every((o) => o.usdPerMonth === null && o.vcpus !== null)).toBe(true)
  })
})
