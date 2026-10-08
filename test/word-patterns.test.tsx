import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { GUARANTEE_BACKLINK_ROWS, WARRANTY_LAYER_ROW, WARRANTY_SENSES } from './helpers/learner'
import { BilingualLayout } from '@/components/lookup/BilingualLayout'
import { ClassicLayout } from '@/components/lookup/ClassicLayout'
import { GlanceLayout } from '@/components/lookup/GlanceLayout'
import { MapLayout } from '@/components/lookup/MapLayout'
import { OverviewLayout } from '@/components/lookup/OverviewLayout'
import { ReadLayout } from '@/components/lookup/ReadLayout'
import { parseBacklinks, parseLearnerLayer } from '@/lib/dictionary/learner'
import { entryDetailRow, toPatterns } from '@/lib/dictionary/rows'
import { buildWordView } from '@/lib/dictionary/wordView'
import type { DictEntryDetail, SentencePattern } from '@/lib/dictionary/types'
import type { WordView } from '@/lib/dictionary/wordView'

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

const layer = parseLearnerLayer(WARRANTY_LAYER_ROW)

const ACCUSE: SentencePattern = {
  pattern: 'accuse sb of sth', vi: 'buộc tội ai về việc gì',
  example: 'They accused him of lying.', exampleVi: 'Họ buộc tội anh ta nói dối.',
}

function viewWith(patterns: SentencePattern[]) {
  const detail: DictEntryDetail = {
    id: 'en:warranty', lang: 'en', headword: 'warranty', traditional: null, level: null, ipa: null, pos: 'noun',
    glossVi: 'sự bảo đảm', glossEn: 'A guarantee', audioUrl: null,
    senses: WARRANTY_SENSES, pronunciations: [], examples: [], relations: [], attributes: {}, senseLinks: [], patterns,
  }
  return buildWordView({
    detail, characters: [], siblings: [],
    learner: layer, backlinks: parseBacklinks(GUARANTEE_BACKLINK_ROWS),
  })
}

const LAYOUTS: [string, (view: WordView) => React.ReactElement][] = [
  ['overview', (view) => <OverviewLayout view={view} />],
  ['bilingual', (view) => <BilingualLayout view={view} />],
  ['classic', (view) => <ClassicLayout view={view} />],
  ['map', (view) => <MapLayout view={view} layer={layer} />],
  ['read', (view) => <ReadLayout view={view} layer={layer} />],
  ['glance', (view) => <GlanceLayout view={view} layer={layer} />],
]

describe('reading lex.entry_patterns', () => {
  it('drops a pattern without Vietnamese and a translation without its example', () => {
    expect(toPatterns({
      patterns: [
        { p: ' accuse sb of sth ', vi: ' buộc tội ai về việc gì ', ex: 'They accused him of lying.', exVi: 'Họ buộc tội anh ta nói dối.' },
        { p: 'accuse sb', vi: '' },
        { p: 'be accused of sth', vi: 'bị buộc tội về việc gì', exVi: 'Câu dịch lạc.' },
      ],
    })).toEqual([
      ACCUSE,
      { pattern: 'be accused of sth', vi: 'bị buộc tội về việc gì', example: null, exampleVi: null },
    ])
    expect(toPatterns(null)).toEqual([])
  })

  it('drops a malformed row instead of the page', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(entryDetailRow.shape.entry_patterns.parse({ patterns: [{ p: 'accuse sb' }] })).toBeNull()
    expect(error).toHaveBeenCalledWith('entry_patterns rejected', expect.anything())
    error.mockRestore()
  })
})

describe('the sentence pattern block', () => {
  it.each(LAYOUTS)('%s shows the pattern, its Vietnamese and the example', (_, draw) => {
    const { container } = render(draw(viewWith([ACCUSE])))
    const block = screen.getByRole('heading', { name: 'Cấu trúc câu (sentence pattern)' }).closest('section, [id="patterns"]') as HTMLElement
    expect(within(block).getByText('buộc tội ai về việc gì')).toBeInTheDocument()
    expect(within(block).getByText('They accused him of lying.')).toBeInTheDocument()
    expect(within(block).getByText('Họ buộc tội anh ta nói dối.')).toBeInTheDocument()
    expect([...container.querySelectorAll('i')].map((i) => i.textContent)).toEqual(expect.arrayContaining(['sb', 'sth']))
  })

  it.each(LAYOUTS)('%s draws nothing for a word without patterns', (_, draw) => {
    render(draw(viewWith([])))
    expect(screen.queryByText(/Cấu trúc câu/)).not.toBeInTheDocument()
  })

  it('folds a long list after six patterns', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...ACCUSE, pattern: `pattern ${i + 1} sth`, vi: `nghĩa ${i + 1}` }))
    render(<ClassicLayout view={viewWith(many)} />)
    expect(screen.queryByText('nghĩa 7')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Xem thêm 2 cấu trúc/ }))
    expect(screen.getByText('nghĩa 8')).toBeInTheDocument()
  })
})
