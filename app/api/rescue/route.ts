import { cookies } from 'next/headers'
import { z } from '@/lib/zod'
import { awsHealthConfig } from '@/lib/admin/aws'
import { alertOwner, clients, readRescueSecret } from '@/lib/admin/ssm'
import { instanceState, power } from '@/lib/admin/control'
import { RESCUE_COOKIE, RESCUE_TTL_MS, secretMatches, signRescue, verifyRescue } from '@/lib/admin/rescue'
import { clientKey, createRateLimiter } from '@/lib/http/rateLimit'
import { badRequest, readJson } from '@/lib/admin/respond'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE })

const body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('unlock'), secret: z.string().min(1).max(200) }),
  z.object({ op: z.literal('state') }),
  z.object({ op: z.literal('start') }),
  z.object({ op: z.literal('lock') }),
])

/** Five tries per address per 15 minutes; the secret is 32 random bytes. */
const attempts = createRateLimiter({ limit: 5, windowMs: 15 * 60_000 })

/** An unidentified caller shares one bucket on purpose: a secret check fails closed. */
const clientIp = (r: Request) => clientKey(r) ?? 'unknown'

/** Never touches Supabase: this is the way back when the database is off. */
export async function POST(request: Request): Promise<Response> {
  const parsed = body.safeParse(await readJson(request))
  if (!parsed.success) return badRequest()
  const b = parsed.data
  const cfg = awsHealthConfig()
  if (!cfg) return json({ error: 'Chưa cấu hình quyền AWS cho bản triển khai này.' }, 503)
  const jar = await cookies()

  if (b.op === 'lock') {
    jar.delete(RESCUE_COOKIE)
    return json({ locked: true })
  }

  try {
    const { ssm, ec2, sns } = clients(cfg)
    const secret = await readRescueSecret(ssm)
    if (!secret) return json({ error: 'Không đọc được khoá cứu hộ từ SSM.' }, 502)

    if (b.op === 'unlock') {
      if (!attempts(clientIp(request)).allowed) return json({ error: 'Sai quá nhiều lần. Thử lại sau 15 phút.' }, 429)
      if (!secretMatches(b.secret, secret)) return json({ error: 'Khoá cứu hộ không đúng.' }, 403)
      jar.set(RESCUE_COOKIE, signRescue(secret), {
        httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: RESCUE_TTL_MS / 1000,
      })
      await alertOwner(sns, cfg.accountId, 'zhesen rescue: unlocked', `The rescue entry was unlocked from ${clientIp(request)} at ${new Date().toISOString()}.`)
      return json(await instanceState(ec2))
    }

    if (!verifyRescue(jar.get(RESCUE_COOKIE)?.value, secret)) return json({ error: 'Phiên cứu hộ đã hết. Nhập lại khoá.', locked: true }, 401)
    if (b.op === 'start') {
      await power(ec2, 'start')
      await alertOwner(sns, cfg.accountId, 'zhesen rescue: instance start', `EC2 start requested through /rescue from ${clientIp(request)} at ${new Date().toISOString()}.`)
    }
    return json(await instanceState(ec2))
  } catch (e) {
    const name = e instanceof Error ? e.name : 'Error'
    return json({ error: `AWS từ chối hoặc không trả lời (${name}).` }, 502)
  }
}
