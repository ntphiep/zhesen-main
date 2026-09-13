import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from '@/components/ui/Modal'

describe('Modal', () => {
  it('opens as a modal dialog and closes again', async () => {
    const { rerender } = render(<Modal open onClose={() => {}} title="Tiêu đề" titleId="t">nội dung</Modal>)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('open')
    rerender(<Modal open={false} onClose={() => {}} title="Tiêu đề" titleId="t">nội dung</Modal>)
    expect(dialog).not.toHaveAttribute('open')
  })

  it('calls onClose from the × button', async () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} title="Tiêu đề" titleId="t">nội dung</Modal>)
    await userEvent.click(screen.getByRole('button', { name: 'Đóng' }))
    expect(onClose).toHaveBeenCalled()
  })

  // The browser centres a modal <dialog> with the UA stylesheet's `margin: auto`,
  // and Tailwind's preflight resets `margin: 0` on every element. Without an
  // explicit `m-auto` all three dialogs rendered pinned to the top-left corner --
  // measured at x=0, y=0 in a 1396x700 viewport. jsdom applies no UA stylesheet,
  // so the class itself is what this can check.
  it('keeps the class that centres it against Tailwind preflight', () => {
    render(<Modal open onClose={() => {}} title="Tiêu đề" titleId="t">nội dung</Modal>)
    expect(screen.getByRole('dialog').className.split(/\s+/)).toContain('m-auto')
  })
})
