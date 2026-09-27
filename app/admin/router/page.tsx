import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { awsHealthConfig } from '@/lib/admin/aws'
import { clients } from '@/lib/admin/ssm'
import { readValues } from '@/lib/admin/secrets'
import { readCombos, ROUTER_PARAMETERS, type Combo } from '@/lib/admin/router'
import { aiConfig } from '@/lib/ai/config'
import { TASKS } from '@/lib/ai/tasks'
import { PageHeader, Section } from '@/components/admin/Page'

export const metadata = { title: '9router · Admin' }

async function readRouter(): Promise<{ url?: string; password?: string; error?: string }> {
  const cfg = awsHealthConfig()
  if (!cfg) return { error: 'AWS access is not configured for this deployment (AWS_ROLE_ARN).' }
  try {
    const values = await readValues(clients(cfg).ssm, Object.values(ROUTER_PARAMETERS))
    return { url: values.get(ROUTER_PARAMETERS.url), password: values.get(ROUTER_PARAMETERS.password) }
  } catch (e) {
    return { error: `Could not read SSM (${e instanceof Error ? e.name : 'Error'}).` }
  }
}

export default async function AdminRouterPage() {
  const supabase = await createClient()
  await requireAdmin(supabase)
  const [router, ai] = await Promise.all([readRouter(), aiConfig()])
  const combos: Combo[] | string = router.url && router.password
    ? await readCombos(router.url, router.password).catch((e: unknown) => (e instanceof Error ? e.message : 'Error'))
    : 'The dashboard link or password is missing.'
  const combo = typeof combos === 'string' ? undefined : combos.find((c) => c.name === ai?.model)

  return (
    <div>
      <PageHeader title="9router" lead="The model router behind the assistant: provider logins, API keys, combos and usage." />
      <Section title="Dashboard">
        {router.error ? <p className="text-sm text-rose-700">{router.error}</p> : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="font-medium">Link</dt>
            <dd className="min-w-0 break-all">
              {router.url ? <a href={router.url} target="_blank" rel="noreferrer" className="underline">{router.url}</a> : 'Not set in SSM.'}
            </dd>
            <dt className="font-medium">Password</dt>
            <dd className="min-w-0 break-all font-mono select-all">{router.password ?? 'Not set in SSM.'}</dd>
          </dl>
        )}
      </Section>
      <Section title="Used by zhesen">
        {!ai ? <p className="text-sm text-black/60">The assistant is off: AI_BASE_URL or AI_API_KEY is not set.</p> : (
          <div className="flex flex-col gap-2 text-sm">
            <p>
              Every assistant task ({Object.keys(TASKS).join(', ')}) asks 9router for AI_MODEL{' '}
              <code className="font-mono">{ai.model}</code>
              {combo ? ', a combo of these models:' : typeof combos === 'string' ? '.' : ', a single model.'}
            </p>
            {combo && (
              <ol className="list-decimal pl-6 font-mono">
                {combo.models.map((m) => <li key={m}>{m}</li>)}
              </ol>
            )}
            {typeof combos === 'string' && <p className="text-rose-700">Could not read the combos from 9router: {combos}</p>}
          </div>
        )}
      </Section>
    </div>
  )
}
