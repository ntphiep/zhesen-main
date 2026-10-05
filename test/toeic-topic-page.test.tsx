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

import Page, { generateMetadata, generateStaticParams, revalidate } from '@/app/theory/[lang]/toeic/topic/[topic]/page'
import { getCachedEntryDetail } from '@/lib/dictionary/cached'
import { theoryContent } from '@/lib/theory/content'
import type { DictEntryDetail } from '@/lib/dictionary/types'

const params = (lang: string, topic: string) => ({ params: Promise.resolve({ lang, topic }) })
const office = theoryContent('en')?.toeic.wordTopics.find((t) => t.id === 'office')
if (!office) throw new Error('The office topic is missing')

function detail(word: string): DictEntryDetail {
  return {
    id: `en:${word}`, lang: 'en', headword: word, traditional: null, level: 'B1', ipa: null, pos: 'noun',
    glossVi: 'nghĩa từ điển', glossEn: null, audioUrl: null,
    senses: [], pronunciations: [], examples: [], relations: [], attributes: {},
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // memo has no entry.
  vi.mocked(getCachedEntryDetail).mockImplementation(async (id) => (id === 'en:memo' ? null : detail(id.slice(3))))
})

describe('TOEIC topic page', () => {
  // A topic reads a dozen entries; building them all at once is what timed out #28.
  it('prerenders nothing at build and keeps the dictionary cache window', () => {
    expect(generateStaticParams()).toEqual([])
    expect(revalidate).toBe(604800)
  })

  it('answers 404 for an unknown topic or language without reading the dictionary', async () => {
    for (const [lang, topic] of [['en', 'Office'], ['en', 'zzz'], ['es', 'office'], ['xx', 'office']]) {
      await expect(Page(params(lang, topic))).rejects.toThrow('NEXT_NOT_FOUND')
    }
    expect(getCachedEntryDetail).not.toHaveBeenCalled()
  })

  it('names the topic in its title, counts its words and gives it its own canonical', async () => {
    const m = await generateMetadata(params('en', 'office'))
    expect(m.title).toBe('Từ vựng TOEIC: Văn phòng và họp')
    expect(m.description).toBe(`Học ${office.words.length} từ TOEIC về văn phòng và họp với nghĩa trong đề và phát âm.`)
    expect(m.alternates?.canonical).toBe('/theory/en/toeic/topic/office')
  })

  it('shows every word with its test meaning, and a word with no entry without a link or a save', async () => {
    render(await Page(params('en', 'office')))
    for (const w of office.words) expect(screen.getByText(w.vi)).toBeInTheDocument()
    expect(screen.queryByText('nghĩa từ điển')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'agenda' })).toHaveAttribute('href', '/dictionary/en/agenda')
    expect(screen.queryByRole('link', { name: 'memo' })).not.toBeInTheDocument()
    expect(screen.getByText('memo')).toBeInTheDocument()
    const saves = await screen.findAllByRole('link', { name: 'Thêm vào sổ tay' })
    expect(saves).toHaveLength(office.words.length - 1)
    // Back to the topic, where the save finishes with the test meaning, not the word page's first sense.
    for (const a of saves) expect(a).toHaveAttribute('href', `/register?next=${encodeURIComponent('/theory/en/toeic/topic/office')}`)
    expect(screen.getByRole('link', { name: /Lưu cả chủ đề vào sổ tay/ })).toBeInTheDocument()
  })
})
