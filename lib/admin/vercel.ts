import { z } from '@/lib/zod'
import { runtimeEnv } from '@/lib/secrets'

/**
 * The two Vercel REST calls /admin/secrets needs: change a production env var, then build
 * production again so a NEXT_PUBLIC_ value reaches the bundle.
 *   https://vercel.com/docs/rest-api/reference/endpoints/projects/retrieve-the-environment-variables-of-a-project-by-id-or-name
 *   https://vercel.com/docs/rest-api/reference/endpoints/projects/edit-an-environment-variable
 *   https://vercel.com/docs/rest-api/reference/endpoints/deployments/create-a-new-deployment
 */

const API = 'https://api.vercel.com'
/** The team that owns the project, which the API takes as `slug`. */
const TEAM_SLUG = 'zhesen'
/** Required by POST /v13/deployments; `project` overrides it. */
const PROJECT_NAME = 'zhesen-main'

export interface VercelTarget {
  token: string
  projectId: string
  /** The production deployment serving this request, redeployed with its settings. */
  deploymentId: string
}

/** The token and ids, or the words for what is missing. VERCEL_PROJECT_ID and
 *  VERCEL_DEPLOYMENT_ID are system env vars at runtime
 *  (https://vercel.com/docs/environment-variables/system-environment-variables). */
export async function vercelTarget(): Promise<VercelTarget | string> {
  const token = (await runtimeEnv()).VERCEL_TOKEN
  if (!token) return 'Set vercel_token first: this change has to write a Vercel env var and redeploy.'
  const projectId = process.env.VERCEL_PROJECT_ID
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID
  if (process.env.VERCEL_ENV !== 'production' || !projectId || !deploymentId) {
    return 'Run this from the production deployment: it redeploys the one serving the page.'
  }
  return { token, projectId, deploymentId }
}

export class VercelError extends Error {}

const errorSchema = z.object({ error: z.object({ message: z.string() }) })

async function call(t: VercelTarget, method: string, path: string, body?: unknown): Promise<unknown> {
  const url = `${API}${path}${path.includes('?') ? '&' : '?'}slug=${TEAM_SLUG}`
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${t.token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const reason = errorSchema.safeParse(data)
    throw new VercelError(`Vercel answered HTTP ${res.status}${reason.success ? `: ${reason.data.error.message.slice(0, 160)}` : ''}`)
  }
  return data
}

const envListSchema = z.object({
  envs: z.array(z.object({ id: z.string(), key: z.string(), target: z.union([z.array(z.string()), z.string()]).optional() })),
})

/** The ids of every production record of `key`. Doubles as proof that the token reaches the project. */
export async function productionEnvIds(t: VercelTarget, key: string): Promise<string[]> {
  const { envs } = envListSchema.parse(await call(t, 'GET', `/v10/projects/${t.projectId}/env`))
  const ids = envs.filter((e) => e.key === key && [e.target ?? []].flat().includes('production')).map((e) => e.id)
  if (ids.length === 0) throw new VercelError(`Vercel has no production variable ${key}.`)
  return ids
}

/** Each record gets the new value; type and targets stay. */
export async function setEnv(t: VercelTarget, ids: string[], value: string): Promise<void> {
  for (const id of ids) {
    z.object({ key: z.string() }).parse(await call(t, 'PATCH', `/v9/projects/${t.projectId}/env/${id}`, { value }))
  }
}

const deploymentSchema = z.object({ id: z.string(), url: z.string(), readyState: z.string().optional() })

/** A new production build of the deployment serving this request, with today's env vars. */
export async function redeployProduction(t: VercelTarget): Promise<z.infer<typeof deploymentSchema>> {
  return deploymentSchema.parse(await call(t, 'POST', '/v13/deployments?forceNew=1', {
    name: PROJECT_NAME, project: t.projectId, deploymentId: t.deploymentId, target: 'production',
  }))
}
