import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { azureTranslatorConfig } from '@/lib/translate/config'

const ENV = ['AZURE_TRANSLATOR_KEY', 'AZURE_TRANSLATOR_REGION', 'AZURE_TRANSLATOR_ENDPOINT'] as const
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

describe('azureTranslatorConfig', () => {
  it('returns null without a key', () => {
    expect(azureTranslatorConfig()).toBeNull()
  })

  it('fills in the default endpoint and region when only the key is set', () => {
    process.env.AZURE_TRANSLATOR_KEY = 'secret'
    expect(azureTranslatorConfig()).toEqual({
      key: 'secret',
      endpoint: 'https://api.cognitive.microsofttranslator.com',
      region: 'eastasia',
    })
  })

  it('reads an explicit endpoint and region, trimming a trailing slash', () => {
    process.env.AZURE_TRANSLATOR_KEY = 'secret'
    process.env.AZURE_TRANSLATOR_REGION = 'westus'
    process.env.AZURE_TRANSLATOR_ENDPOINT = 'https://custom.example.com/'
    expect(azureTranslatorConfig()).toEqual({
      key: 'secret',
      endpoint: 'https://custom.example.com',
      region: 'westus',
    })
  })
})
