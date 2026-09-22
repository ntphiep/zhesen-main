import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { CommonWords, type WordChip } from '@/components/search/CommonWords'
import type { LangCode } from '@/lib/languages'

/** Twenty per language, so the strip has a second page to rotate to. */
function pool(lang: string, n: number): WordChip[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${lang}:w${i}`, headword: `${lang}${i}`, glossVi: null,
  }))
}

const POOLS: Record<LangCode, WordChip[]> = {
  en: pool('en', 20), es: pool('es', 20), zh: pool('zh', 20),
}

afterEach(() => { vi.useRealTimers() })

describe('CommonWords', () => {
  it('shows the first ten of each language', () => {
    render(<CommonWords pools={POOLS} />)
    expect(screen.getByRole('link', { name: 'en0' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'en9' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'en10' })).toBeNull()
  })

  it('moves on to the next ten on its own', () => {
    vi.useFakeTimers()
    render(<CommonWords pools={POOLS} />)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByRole('link', { name: 'en10' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'en0' })).toBeNull()
  })

  it('wraps back to the start rather than running out', () => {
    vi.useFakeTimers()
    render(<CommonWords pools={POOLS} />)
    act(() => { vi.advanceTimersByTime(10000) })
    expect(screen.getByRole('link', { name: 'en0' })).toBeInTheDocument()
  })

  it('holds still while the pointer is inside it', () => {
    vi.useFakeTimers()
    const { container } = render(<CommonWords pools={POOLS} />)
    // React routes onMouseEnter through the bubbling mouseover event, so a dispatched
    // mouseenter never reaches the handler.
    fireEvent.mouseOver(container.firstElementChild as Element)
    act(() => { vi.advanceTimersByTime(20000) })
    expect(screen.getByRole('link', { name: 'en0' })).toBeInTheDocument()
  })

  it('stays put for a reader who asked for reduced motion', () => {
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({ ...original(q), matches: true })) as typeof window.matchMedia
    vi.useFakeTimers()
    render(<CommonWords pools={POOLS} />)
    act(() => { vi.advanceTimersByTime(20000) })
    expect(screen.getByRole('link', { name: 'en0' })).toBeInTheDocument()
    window.matchMedia = original
  })

  it('does not rotate a pool that fits on one row', () => {
    vi.useFakeTimers()
    render(<CommonWords pools={{ en: pool('en', 4), es: pool('es', 4), zh: pool('zh', 4) }} />)
    act(() => { vi.advanceTimersByTime(20000) })
    expect(screen.getByRole('link', { name: 'en0' })).toBeInTheDocument()
  })
})
