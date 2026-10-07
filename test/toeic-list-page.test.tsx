import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
vi.mock('@/lib/dictionary/cached', () => ({ getCachedEntryDetail: vi.fn(), getCachedInflections: vi.fn(async () => []) }))
vi.mock('@/lib/theory/toeicLayer', () => ({ getCachedToeicLayer: vi.fn(async () => null) }))
// A guest: each save leads to /register.
vi.mock('@/lib/supabase/client', async () => {
  const { accountAuthStub } = await import('./helpers/supabase')
  return { createClient: () => accountAuthStub(null) }
})

import Page, { generateMetadata, generateStaticParams, revalidate } from '@/app/theory/[lang]/toeic/list/[group]/page'
import { getCachedEntryDetail } from '@/lib/dictionary/cached'
import { getCachedToeicLayer } from '@/lib/theory/toeicLayer'
import { findToeicGroup, toeicGroupCount } from '@/lib/theory/content'
import type { DictEntryDetail } from '@/lib/dictionary/types'

const params = (lang: string, group: string) => ({ params: Promise.resolve({ lang, group }) })

function detail(word: string): DictEntryDetail {
  return {
    id: `en:${word}`, lang: 'en', headword: word, traditional: null, level: 'B1', ipa: null, pos: 'noun',
    glossVi: `nghĩa của ${word}`, glossEn: null, audioUrl: null,
    senses: [], pronunciations: [], examples: [], relations: [], attributes: {},
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // e-book has no entry; client has a reviewed learner layer.
  vi.mocked(getCachedEntryDetail).mockImplementation(async (id) => (id === 'en:e-book' ? null : detail(id.slice(3))))
  vi.mocked(getCachedToeicLayer).mockImplementation(async (id) => (id === 'en:client' ? {
    model: 'gemini/gemini-3.8-flash', reviewer: 'omni:ddgw/gpt-5.4-mini',
    senses: [{ viTerms: ['khách hàng', 'thân chủ', 'khách', 'người mua'], examples: [] }],
  } : null))
})

describe('TOEIC list', () => {
  it('splits the 1,250 words into 50 pages of 25, numbered from 1 with one URL each', () => {
    expect(toeicGroupCount('en')).toBe(50)
    expect(findToeicGroup('en', '1')?.words[0][0]).toBe('mister')
    expect(findToeicGroup('en', '50')?.words).toHaveLength(25)
    for (const g of ['0', '01', '51', '1.5', 'abc']) expect(findToeicGroup('en', g)).toBeUndefined()
    expect(toeicGroupCount('es')).toBe(0)
  })
})

describe('TOEIC list page', () => {
  // 50 pages of 25 entries each; building them all at once is what timed out #28.
  it('prerenders nothing at build and keeps the dictionary cache window', () => {
    expect(generateStaticParams()).toEqual([])
    expect(revalidate).toBe(604800)
  })

  it('answers 404 for a page outside the list or another language without reading the dictionary', async () => {
    for (const [lang, group] of [['en', '0'], ['en', '01'], ['en', '51'], ['es', '1'], ['xx', '1']]) {
      await expect(Page(params(lang, group))).rejects.toThrow('NEXT_NOT_FOUND')
    }
    expect(getCachedEntryDetail).not.toHaveBeenCalled()
  })

  it('names the span of the page in its title and gives it its own canonical', async () => {
    const m = await generateMetadata(params('en', '2'))
    expect(m.title).toBe('Từ vựng TOEIC 26 đến 50')
    expect(m.alternates?.canonical).toBe('/theory/en/toeic/list/2')
  })

  it('shows each word with the reviewed meaning or the lead gloss, and the list definition', async () => {
    render(await Page(params('en', '1')))
    expect(screen.getByRole('heading', { name: 'Từ TOEIC 1 đến 25' })).toBeInTheDocument()
    // The layer's first three terms, not the dictionary's gloss.
    expect(screen.getByText('khách hàng, thân chủ, khách')).toBeInTheDocument()
    expect(screen.queryByText('nghĩa của client')).not.toBeInTheDocument()
    expect(screen.getByText('nghĩa của vacation')).toBeInTheDocument()
    expect(screen.getByText('a holiday or break from work')).toBeInTheDocument()
    // No entry: no link, no save, but the word stays in its place.
    expect(screen.getByText('e-book')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'e-book' })).not.toBeInTheDocument()
    expect(await screen.findAllByRole('link', { name: 'Thêm vào sổ tay' })).toHaveLength(24)
    expect(screen.getByRole('link', { name: /Lưu cả nhóm vào sổ tay/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Từ TOEIC 26 đến 50/ })).toHaveAttribute('href', '/theory/en/toeic/list/2')
    expect(screen.getByRole('link', { name: 'CC BY-SA 4.0' })).toBeInTheDocument()
  })

  it('ends at the last page with no next link', async () => {
    render(await Page(params('en', '50')))
    expect(screen.getByRole('heading', { name: 'Từ TOEIC 1.226 đến 1.250' })).toBeInTheDocument()
    expect(screen.queryByText('Tiếp theo')).not.toBeInTheDocument()
  })
})
