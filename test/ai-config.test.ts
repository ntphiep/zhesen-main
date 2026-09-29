import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { aiConfig } from '@/lib/ai/config'

const ENV = ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'AI_FALLBACK_BASE_URL', 'AI_FALLBACK_API_KEY'] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k]
  for (const k of ENV) delete process.env[k]
})
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

const nine = () => { process.env.AI_BASE_URL = 'http://nine.test/v1/'; process.env.AI_API_KEY = 'k1' }
const omni = () => { process.env.AI_FALLBACK_BASE_URL = 'http://omni.test/v1'; process.env.AI_FALLBACK_API_KEY = 'k2' }

describe('aiConfig', () => {
  it('is null with neither router set', async () => {
    expect(await aiConfig()).toBeNull()
  })

  it('asks 9router alone when OmniRoute is not set', async () => {
    nine()
    expect(await aiConfig()).toEqual({ baseUrl: 'http://nine.test/v1', apiKey: 'k1', model: 'ag/gemini-3.8-flash' })
  })

  it('carries OmniRoute as the fallback behind 9router', async () => {
    nine(); omni()
    process.env.AI_MODEL = 'zhesen'
    expect(await aiConfig()).toEqual({
      baseUrl: 'http://nine.test/v1', apiKey: 'k1', model: 'zhesen',
      fallback: { baseUrl: 'http://omni.test/v1', apiKey: 'k2', model: 'zhesen' },
    })
  })

  it('asks OmniRoute first when it is the only router set', async () => {
    omni()
    expect(await aiConfig()).toEqual({ baseUrl: 'http://omni.test/v1', apiKey: 'k2', model: 'zhesen' })
  })

  it('treats a router without its key as unset', async () => {
    nine(); omni()
    delete process.env.AI_API_KEY
    expect(await aiConfig()).toEqual({ baseUrl: 'http://omni.test/v1', apiKey: 'k2', model: 'zhesen' })
  })
})
