import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { translateText, AzureTranslateError } from '@/lib/translate/azure'
import type { AzureTranslatorConfig } from '@/lib/translate/config'

const cfg: AzureTranslatorConfig = {
  endpoint: 'https://translator.test',
  key: 'k',
  region: 'eastasia',
}

function reply(body: unknown, ok = true) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500 }))
}

describe('translateText', () => {
  const realFetch = globalThis.fetch
  beforeEach(() => { vi.restoreAllMocks() })
  afterEach(() => { globalThis.fetch = realFetch })

  it('parses a real Azure response into one translation per target language', async () => {
    globalThis.fetch = reply([{
      translations: [
        { text: 'I want to buy a new desk.', to: 'en' },
        { text: 'Quiero comprar un escritorio nuevo.', to: 'es' },
        { text: '我想买一张新桌子。', to: 'zh-Hans' },
      ],
    }])
    const out = await translateText(cfg, 'Tôi muốn mua một cái bàn mới.', 'vi', ['en', 'es', 'zh'])
    expect(out.translations).toEqual({
      en: 'I want to buy a new desk.',
      es: 'Quiero comprar un escritorio nuevo.',
      zh: '我想买一张新桌子。',
    })
    expect(out.from).toBe('vi')
  })

  it('sends every target language in one request, never one call per language', async () => {
    const f = reply([{ translations: [{ text: 'x', to: 'en' }, { text: 'y', to: 'zh-Hans' }] }])
    globalThis.fetch = f
    await translateText(cfg, 'hola', 'es', ['en', 'zh'])
    expect(f).toHaveBeenCalledTimes(1)
    const [url] = f.mock.calls[0] as unknown as [string]
    expect(url).toContain('to=en')
    // zh maps to Azure's zh-Hans on the way out.
    expect(url).toContain('to=zh-Hans')
    expect(url).toContain('from=es')
  })

  it('maps zh-Hans back to zh on the way in', async () => {
    globalThis.fetch = reply([{ translations: [{ text: '你好', to: 'zh-Hans' }] }])
    const out = await translateText(cfg, 'hello', 'en', ['zh'])
    expect(out.translations).toEqual({ zh: '你好' })
  })

  it('reads the detected language when from is omitted', async () => {
    globalThis.fetch = reply([{
      detectedLanguage: { language: 'vi', score: 0.99 },
      translations: [{ text: 'hello', to: 'en' }],
    }])
    const out = await translateText(cfg, 'xin chào', undefined, ['en'])
    expect(out.from).toBe('vi')
  })

  it('rejects a non-OK response rather than parsing the error body', async () => {
    globalThis.fetch = reply({ error: { message: 'nope' } }, false)
    await expect(translateText(cfg, 'x', 'en', ['vi'])).rejects.toThrow(AzureTranslateError)
  })

  it('rejects a body that is not the documented shape', async () => {
    globalThis.fetch = reply({ surprise: true })
    await expect(translateText(cfg, 'x', 'en', ['vi'])).rejects.toThrow(AzureTranslateError)
  })
})
