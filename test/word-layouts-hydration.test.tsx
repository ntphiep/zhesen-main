import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { GUARANTEE_BACKLINK_ROWS, WARRANTY_LAYER_ROW, WARRANTY_SENSES } from './helpers/learner'
import { LookupView } from '@/components/lookup/LookupView'
import { parseBacklinks, parseLearnerLayer } from '@/lib/dictionary/learner'
import { wordLayout } from '@/lib/dictionary/wordLayout'
import type { DictEntryDetail } from '@/lib/dictionary/types'

const client = vi.hoisted(() => ({ on: false, renders: { map: 0, glance: 0 } }))

vi.mock('@/components/lookup/MapLayout', async (importOriginal) => {
  const { MapLayout } = await importOriginal<typeof import('@/components/lookup/MapLayout')>()
  return { MapLayout: (props: Parameters<typeof MapLayout>[0]) => { if (client.on) client.renders.map++; return MapLayout(props) } }
})
vi.mock('@/components/lookup/GlanceLayout', async (importOriginal) => {
  const { GlanceLayout } = await importOriginal<typeof import('@/components/lookup/GlanceLayout')>()
  return { GlanceLayout: (props: Parameters<typeof GlanceLayout>[0]) => { if (client.on) client.renders.glance++; return GlanceLayout(props) } }
})
vi.mock('@/lib/supabase/client', async () => {
  const { accountAuthStub } = await import('./helpers/supabase')
  return { createClient: () => accountAuthStub({ id: 'u1', email: 'a@b.com' }) }
})
vi.mock('@/lib/wordlist/store', () => ({
  addWord: vi.fn(async () => ({})),
  draftFromDictEntry: (e: { headword: string }) => ({ headword: e.headword }),
  isWordSaved: vi.fn(async () => false),
}))
vi.mock('@/lib/ai/browser', () => ({ callAi: vi.fn(), aiEnabled: vi.fn(async () => false) }))

const warranty: DictEntryDetail = {
  id: 'en:warranty', lang: 'en', headword: 'warranty', traditional: null, level: null, ipa: null, pos: 'noun',
  glossVi: 'sự bảo đảm', glossEn: 'A guarantee', audioUrl: null,
  senses: WARRANTY_SENSES, pronunciations: [], examples: [], relations: [], attributes: {}, senseLinks: [],
}
const page = <LookupView detail={warranty} characters={[]} siblings={[]} learner={parseLearnerLayer(WARRANTY_LAYER_ROW)} backlinks={parseBacklinks(GUARANTEE_BACKLINK_ROWS)} />

let root: Root | null = null
let box: HTMLDivElement

beforeEach(() => {
  localStorage.clear()
  wordLayout.reset()
  client.on = false
  client.renders = { map: 0, glance: 0 }
  box = document.createElement('div')
  document.body.append(box)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  box.remove()
  delete document.documentElement.dataset.wordLayout
})

describe('hydrating the word page', () => {
  it('hydrates only the stored layout and keeps its server DOM', async () => {
    box.innerHTML = renderToString(page)
    localStorage.setItem('zhesen:word-layout', 'read')
    document.documentElement.dataset.wordLayout = 'read'
    const read = box.querySelector('[data-panel="read"]')
    const errors: unknown[] = []
    const logged = vi.spyOn(console, 'error')
    client.on = true
    await act(async () => {
      root = hydrateRoot(box, page, { onRecoverableError: (e) => errors.push(e) })
    })
    expect(errors).toEqual([])
    expect(logged).not.toHaveBeenCalled()
    logged.mockRestore()
    expect([...box.querySelectorAll('[data-panel]')].map((p) => p.getAttribute('data-panel'))).toEqual(['read'])
    expect(box.querySelector('[data-panel="read"]')).toBe(read)
    expect(box.querySelector('main')).not.toHaveAttribute('data-boot')
    expect(client.renders).toEqual({ map: 0, glance: 0 })
  })
})
