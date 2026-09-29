import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { awsHealthConfig } from '@/lib/admin/aws'
import { clients } from '@/lib/admin/ssm'
import { readValues } from '@/lib/admin/secrets'
import { readCombos, ROUTERS, type Combo, type RouterName } from '@/lib/admin/router'
import { aiEndpoints, type AiEndpoint } from '@/lib/ai/config'
import { TASKS } from '@/lib/ai/tasks'
import { PageHeader, Section } from '@/components/admin/Page'

export const metadata = { title: 'AI router · Admin' }

interface RouterState {
  name: RouterName
  url?: string
  password?: string
  /** The router's combos, or why they could not be read. */
  combos: Combo[] | string
}

async function readRouters(): Promise<RouterState[] | string> {
  const cfg = awsHealthConfig()
  if (!cfg) return 'AWS access is not configured for this deployment (AWS_ROLE_ARN).'
  let values: Map<string, string>
  try {
    values = await readValues(clients(cfg).ssm, ROUTERS.flatMap((r) => [r.url, r.password]))
  } catch (e) {
    return `Could not read SSM (${e instanceof Error ? e.name : 'Error'}).`
  }
  return Promise.all(ROUTERS.map(async (r): Promise<RouterState> => {
    const url = values.get(r.url)
    const password = values.get(r.password)
    const combos = url && password
      ? await readCombos(url, password, r.name).catch((e: unknown) => (e instanceof Error ? e.message : 'Error'))
      : 'The dashboard link or password is missing.'
    return { name: r.name, url, password, combos }
  }))
}

function RouterSection({ router, endpoint, role }: { router: RouterState; endpoint?: AiEndpoint; role: string }) {
  const combos = router.combos
  const combo = endpoint && typeof combos !== 'string' ? combos.find((c) => c.name === endpoint.model) : undefined
  return (
    <Section title={router.name}>
      <div className="flex flex-col gap-4 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="font-medium">Link</dt>
          <dd className="min-w-0 break-all">
            {router.url ? <a href={router.url} target="_blank" rel="noreferrer" className="underline">{router.url}</a> : 'Not set in SSM.'}
          </dd>
          <dt className="font-medium">Password</dt>
          <dd className="min-w-0 break-all font-mono select-all">{router.password ?? 'Not set in SSM.'}</dd>
        </dl>
        {!endpoint ? <p className="text-(--zs-soft)">The assistant does not use {router.name}: its base URL or API key is not set.</p> : (
          <div className="flex flex-col gap-2">
            <p>
              {role} The assistant asks for <code className="font-mono">{endpoint.model}</code>
              {combo ? ', a combo of these models:' : typeof combos === 'string' ? '.' : ', a single model.'}
            </p>
            {combo && (
              <ol className="list-decimal pl-6 font-mono">
                {combo.models.map((m) => <li key={m}>{m}</li>)}
              </ol>
            )}
          </div>
        )}
        {typeof combos === 'string' && <p className="text-rose-700">Could not read the combos from {router.name}: {combos}</p>}
      </div>
    </Section>
  )
}

export default async function AdminRouterPage() {
  const supabase = await createClient()
  await requireAdmin(supabase)
  const [routers, ai] = await Promise.all([readRouters(), aiEndpoints()])
  const byName = (name: RouterName) => (typeof routers === 'string' ? undefined : routers.find((r) => r.name === name))
  const nine = byName('9router')
  const omni = byName('OmniRoute')

  return (
    <div>
      <PageHeader
        title="AI router"
        lead={`Every assistant task (${Object.keys(TASKS).join(', ')}) ${ai.nineRouter && ai.omniRoute
          ? 'asks 9router first and OmniRoute when 9router fails.'
          : `asks ${ai.nineRouter ? '9router' : ai.omniRoute ? 'OmniRoute' : 'no router'} only.`}`}
      />
      {typeof routers === 'string' && <p className="text-sm text-rose-700">{routers}</p>}
      {!ai.nineRouter && !ai.omniRoute && (
        <p className="text-sm text-(--zs-soft)">The assistant is off: neither router has a base URL and API key set.</p>
      )}
      {nine && <RouterSection router={nine} endpoint={ai.nineRouter} role={ai.omniRoute ? 'First router.' : 'Only router.'} />}
      {omni && <RouterSection router={omni} endpoint={ai.omniRoute} role={ai.nineRouter ? 'Fallback router.' : 'Only router.'} />}
    </div>
  )
}
