import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { useAiEnabled, resetAiEnabledCache } from '@/lib/hooks/useAiEnabled'
import { aiEnabled } from '@/lib/ai/browser'

type AuthCallback = (event: string, session: Pick<Session, 'user'> | null) => void

const { auth } = vi.hoisted(() => ({ auth: { callback: null as AuthCallback | null } }))
vi.mock('@/lib/ai/browser', () => ({ aiEnabled: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (cb: AuthCallback) => {
        auth.callback = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
    },
  }),
}))

function Probe() {
  return <span>{useAiEnabled() ? 'on' : 'off'}</span>
}

const user = (id: string, email?: string) => ({ user: { id, email } as Session['user'] })

beforeEach(() => {
  vi.mocked(aiEnabled).mockReset()
  resetAiEnabledCache()
})

describe('useAiEnabled', () => {
  // Sign-in and sign-out navigate on the client, so the per-tab answer would otherwise
  // outlive the account it was asked for.
  it('asks again when the account changes, and not when it stays the same', async () => {
    vi.mocked(aiEnabled).mockResolvedValue(false)
    render(<Probe />)
    await vi.waitFor(() => expect(auth.callback).not.toBeNull())
    act(() => auth.callback?.('INITIAL_SESSION', null))
    expect(await screen.findByText('off')).toBeInTheDocument()
    expect(aiEnabled).toHaveBeenCalledTimes(1)

    vi.mocked(aiEnabled).mockResolvedValue(true)
    act(() => auth.callback?.('SIGNED_IN', user('u1', 'learner@example.com')))
    expect(await screen.findByText('on')).toBeInTheDocument()
    expect(aiEnabled).toHaveBeenCalledTimes(2)

    // A refocused tab re-emits SIGNED_IN for the same account.
    act(() => auth.callback?.('SIGNED_IN', user('u1', 'learner@example.com')))
    expect(aiEnabled).toHaveBeenCalledTimes(2)

    vi.mocked(aiEnabled).mockResolvedValue(false)
    act(() => auth.callback?.('SIGNED_OUT', null))
    expect(await screen.findByText('off')).toBeInTheDocument()
    expect(aiEnabled).toHaveBeenCalledTimes(3)
  })

  it('drops an answer that was asked for the previous account', async () => {
    let answerOld: (v: boolean) => void = () => {}
    vi.mocked(aiEnabled).mockResolvedValue(false)
    vi.mocked(aiEnabled).mockReturnValueOnce(new Promise((r) => { answerOld = r }))
    render(<Probe />)
    await vi.waitFor(() => expect(aiEnabled).toHaveBeenCalledTimes(1))
    // The subscription is per tab and outlives the previous case, so the first call
    // settles who is signed in and only the second is sure to be a change.
    act(() => auth.callback?.('SIGNED_IN', user('u9', 'other@example.com')))
    act(() => auth.callback?.('SIGNED_OUT', null))
    await act(async () => { answerOld(true) })
    expect(screen.getByText('off')).toBeInTheDocument()
  })
})
