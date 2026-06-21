import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { StrokeOrder } from '@/components/lookup/StrokeOrder'

// hanzi-writer is an external lib that needs real SVG + a CDN; mock it so the test
// covers our wrapper (mount + replay wiring), not the library internals.
const animateCharacter = vi.fn()
const create = vi.fn(() => ({ animateCharacter }))
vi.mock('hanzi-writer', () => ({ default: { create } }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('StrokeOrder', () => {
  it('renders the character canvas and a replay control', () => {
    render(<StrokeOrder char="狗" />)
    expect(screen.getByLabelText('Thứ tự nét chữ 狗')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /viết lại/i })).toBeInTheDocument()
  })

  it('re-animates when the replay control is clicked', async () => {
    render(<StrokeOrder char="狗" />)
    // let the dynamic import + create() resolve
    await vi.waitFor(() => expect(create).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /viết lại/i }))
    expect(animateCharacter).toHaveBeenCalled()
  })
})
