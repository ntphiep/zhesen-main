import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NotFound from '@/app/not-found'
import ErrorBoundary from '@/app/error'

describe('not-found page', () => {
  it('offers a way back into the site instead of ending the visit', () => {
    render(<NotFound />)
    expect(screen.getByRole('heading', { name: 'Không có trang này' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tra từ khác' })).toHaveAttribute('href', '/dictionary')
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/')
  })
})

describe('error boundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // `retry` re-fetches; `reset` only re-renders the same failed data. Nearly
  // every error this boundary catches is a failed read, so the button has to be
  // the one that goes back to the server.
  it('re-fetches rather than re-rendering the same failure', async () => {
    const retry = vi.fn()
    render(<ErrorBoundary error={new Error('boom')} retry={retry} />)
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  // The message can carry a row id or a PostgREST hint. The digest is the only
  // part a visitor should be able to quote back.
  it('shows the digest and never the raw message', () => {
    const error = Object.assign(new Error('permission denied for table user_words'), { digest: 'abc123' })
    render(<ErrorBoundary error={error} retry={() => {}} />)
    expect(screen.getByText('Mã lỗi: abc123')).toBeInTheDocument()
    expect(screen.queryByText(/permission denied/)).toBeNull()
  })

  it('leaves the digest line out when there is none', () => {
    render(<ErrorBoundary error={new Error('boom')} retry={() => {}} />)
    expect(screen.queryByText(/Mã lỗi/)).toBeNull()
  })
})
