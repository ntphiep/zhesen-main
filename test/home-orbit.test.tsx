import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { HomeView } from '@/lib/hooks/useHomeData'
import { initialSrsState } from '@/lib/progress/srs'
import type { ReviewCard } from '@/lib/wordlist/review'
import type { StatRow } from '@/lib/wordlist/stats'

// jsdom has no canvas for the globe.
vi.mock('@/lib/hooks/useGlobe', () => ({ useGlobe: () => ({ globe: null, world: null }) }))

import { OrbitLayout, notebookMarks, pinLook, stageKey } from '@/components/home/OrbitLayout'

const NOW = Date.parse('2026-09-29T03:00:00.000Z')
const row = (i: number): StatRow => ({
  lang: (['en', 'zh', 'es'] as const)[i % 3], status: 'new', srsIntervalDays: 0,
  srsDueAt: new Date(NOW - 60_000).toISOString(), srsLastReviewedAt: null, srsReps: 0,
})
const card = (i: number): ReviewCard => ({
  id: `w${i}`, lang: (['en', 'zh', 'es'] as const)[i % 3], headword: `w${i}`, reading: null, ipa: null,
  meaningVi: null, meaningEn: null, example: null, exampleTranslation: null, audioUrl: null, entryId: null,
  state: initialSrsState(`w${i}`, NOW - 60_000),
})
// 407 never-seen words, all due; the session hands over 20 of them.
const rows = Array.from({ length: 407 }, (_, i) => row(i))
const pending = Array.from({ length: 20 }, (_, i) => card(i))

describe('the globe of the notebook', () => {
  it('draws a dot for every saved word, due or not, and labels only the first due words', () => {
    const { dots, pins } = notebookMarks({ rows, pending })
    expect(dots).toHaveLength(407)
    expect(pins.map((p) => p.card.id)).toEqual(pending.slice(0, 18).map((c) => c.id))
  })

  it('says how many of the due words carry a label when not all of them fit', () => {
    expect(stageKey(18, 20)).toBe('Mỗi chấm là một từ trong sổ tay. 18 trong 20 từ đến hạn hôm nay có nhãn.')
    expect(stageKey(5, 5)).toBe('Mỗi chấm là một từ trong sổ tay. Từ đến hạn hôm nay có nhãn.')
  })

  it('lets only a label at full strength take focus', () => {
    expect(pinLook(0.2, false)).toEqual({ off: true, opacity: 0, inert: true })
    // Drawn at opacity 0.14 and 0.05: shown, but too faint to carry a focus ring.
    expect(pinLook(0.306, false)).toMatchObject({ off: false, inert: true })
    expect(pinLook(0.27, false)).toMatchObject({ off: false, inert: true })
    expect(pinLook(0.5, false)).toMatchObject({ off: false, inert: true })
    expect(pinLook(0.65, false)).toEqual({ off: false, opacity: 1, inert: false })
    expect(pinLook(1, false)).toEqual({ off: false, opacity: 1, inert: false })
    expect(pinLook(1, true)).toEqual({ off: true, opacity: 0, inert: true })
  })

  it('keeps a pin out of the tab order until the globe shows it', () => {
    const view = { now: NOW, due: 20, total: 407, learned: 0, reviewedToday: 0, streak: 0, days: new Set<string>(), rows, pending, gradedNow: 0, recent: [], leeches: [], forecast: [],
      progress: { en: { total: 136, learned: 0, learning: 0, unseen: 136 }, zh: { total: 136, learned: 0, learning: 0, unseen: 136 }, es: { total: 135, learned: 0, learning: 0, unseen: 135 } } } satisfies HomeView
    const { container } = render(<OrbitLayout view={view} failed={false} onRetry={() => {}} picker={{ value: 'orbit', stored: 'orbit' }} />)
    const pins = container.querySelectorAll('[data-off]')
    expect(pins).toHaveLength(18)
    for (const pin of pins) expect(pin).toHaveAttribute('inert')
    expect(screen.getByText(/18 trong 20 từ đến hạn/)).toBeInTheDocument()
  })
})
