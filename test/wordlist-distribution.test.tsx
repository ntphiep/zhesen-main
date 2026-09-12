import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WordlistDistribution } from '@/components/wordlist/WordlistDistribution'
import type { WordlistStats } from '@/lib/wordlist/stats'

function mkStats(over: Partial<WordlistStats> = {}): WordlistStats {
  return {
    total: 4, due: 0, learned: 0, reviewedToday: 0, streak: 0,
    byStatus: { new: 1, learning: 1, known: 2 },
    byLang: { en: 2, es: 1, zh: 1 },
    ...over,
  }
}

describe('WordlistDistribution', () => {
  it('renders counts by status and by language', () => {
    render(<WordlistDistribution stats={mkStats()} />)
    expect(screen.getByText('Theo trạng thái')).toBeInTheDocument()
    expect(screen.getByText('Theo ngôn ngữ')).toBeInTheDocument()
    expect(screen.getByText('Mới')).toBeInTheDocument()
    expect(screen.getByText('Tiếng Trung')).toBeInTheDocument()
  })

  it('renders nothing for an empty wordlist', () => {
    const { container } = render(<WordlistDistribution stats={mkStats({ total: 0 })} />)
    expect(container).toBeEmptyDOMElement()
  })
})
