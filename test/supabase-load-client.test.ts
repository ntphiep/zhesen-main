import { describe, it, expect, vi } from 'vitest'
import { loadSupabaseClient } from '@/lib/supabase/loadClient'

// An async factory is what the component tests use, and what separate racing `import()`
// calls slipped past: all but the first received the real module.
vi.mock('@/lib/supabase/client', async () => {
  await new Promise((r) => setTimeout(r, 20))
  return { createClient: () => 'mock' }
})

describe('loadSupabaseClient', () => {
  it('gives every concurrent caller the same module', async () => {
    const modules = await Promise.all([loadSupabaseClient(), loadSupabaseClient(), loadSupabaseClient()])
    expect(modules.map((m) => m.createClient())).toEqual(['mock', 'mock', 'mock'])
  })
})
