import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getSession: vi.fn() } }) }))

import { RouterAccess } from '@/components/admin/RouterAccess'

const LINK = 'https://d1router.cloudfront.net/__gate?t=1790520000.' + 'a'.repeat(64)
const fetchMock = vi.fn()
const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('RouterAccess', () => {
  it('shows the password and a new-tab link once the server answers', async () => {
    fetchMock.mockResolvedValue(answer(200, { link: LINK, password: 'Pw123', expiresIn: 300 }))
    render(<RouterAccess />)
    await userEvent.click(screen.getByRole('button', { name: 'Open dashboard' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/router', expect.objectContaining({ method: 'POST', body: '{}' }))
    expect(await screen.findByText('Pw123')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Open the 9router dashboard' })
    expect(link).toHaveAttribute('href', LINK)
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByText(/works for 5 minutes/)).toBeInTheDocument()
  })

  it('asks for the password again when the sign-in is stale', async () => {
    fetchMock.mockResolvedValue(answer(401, { error: 'This action needs a sign-in within the last 10 minutes.', reauth: true }))
    render(<RouterAccess />)
    await userEvent.click(screen.getByRole('button', { name: 'Open dashboard' }))
    expect(await screen.findByRole('dialog', { name: 'Open the 9router dashboard' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Password/)).toHaveAttribute('type', 'password')
    expect(screen.queryByRole('link', { name: 'Open the 9router dashboard' })).not.toBeInTheDocument()
  })

  it('says why when the server refuses', async () => {
    fetchMock.mockResolvedValue(answer(404, { error: 'Not set in SSM: /zhesen/prod/router_url.' }))
    render(<RouterAccess />)
    await userEvent.click(screen.getByRole('button', { name: 'Open dashboard' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not set in SSM: /zhesen/prod/router_url.')
  })
})
