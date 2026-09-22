import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LookupPair } from '@/components/search/LookupPair'
import { lookupLayout } from '@/lib/dictionary/lookupLayout'

// The panels do the searching and have their own file; here only which of them is on
// screen, and in which order, is under test.
vi.mock('@/components/search/LookupPanel', () => ({
  LookupPanel: ({ direction, label }: { direction: string; label: string }) =>
    <div data-testid={`panel-${direction}`}>{label}</div>,
}))

beforeEach(() => {
  localStorage.clear()
  lookupLayout.reset()
})

/** Reading order of the panels as the DOM holds them, which is what the swap changes. */
function order(): string[] {
  return screen.getAllByTestId(/^panel-/).map((el) => el.dataset.testid ?? '')
}

describe('LookupPair', () => {
  it('shows both directions by default, Vietnamese first', () => {
    render(<LookupPair />)
    expect(order()).toEqual(['panel-vi', 'panel-fw'])
  })

  it('puts the foreign box first once the two are swapped', async () => {
    render(<LookupPair />)
    await userEvent.click(screen.getByRole('button', { name: 'Đổi chỗ hai ô' }))
    expect(order()).toEqual(['panel-fw', 'panel-vi'])
  })

  it('draws one direction only when the display control asks for one', async () => {
    render(<LookupPair />)
    await userEvent.click(screen.getByRole('button', { name: 'Ngoại ngữ' }))
    expect(order()).toEqual(['panel-fw'])
    expect(screen.queryByTestId('panel-vi')).toBeNull()
  })

  it('has nothing to swap while one direction is hidden', async () => {
    render(<LookupPair />)
    await userEvent.click(screen.getByRole('button', { name: 'Tiếng Việt' }))
    expect(screen.getByRole('button', { name: 'Đổi chỗ hai ô' })).toBeDisabled()
  })

  it('remembers both choices for the next visit', async () => {
    const { unmount } = render(<LookupPair />)
    await userEvent.click(screen.getByRole('button', { name: 'Đổi chỗ hai ô' }))
    unmount()

    render(<LookupPair />)
    expect(order()).toEqual(['panel-fw', 'panel-vi'])
  })
})
