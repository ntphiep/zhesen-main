import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AudioButton, resetVoiceCache } from '@/components/ui/AudioButton'

describe('AudioButton', () => {
  beforeEach(() => {
    resetVoiceCache()
    vi.stubGlobal('speechSynthesis', {
      speak: vi.fn(), cancel: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(),
      getVoices: () => [{ lang: 'en-US', name: 'en' }],
      speaking: false, pending: false,
    })
    vi.stubGlobal('SpeechSynthesisUtterance', vi.fn(function (this: Record<string, unknown>, t: string) { this.text = t }))
  })

  it('plays a playable recorded file when audioUrl is present', async () => {
    const play = vi.fn(() => Promise.resolve())
    vi.stubGlobal('Audio', vi.fn(function () { return { play, canPlayType: () => 'probably' } }))
    render(<AudioButton text="dog" lang="en" audioUrl="x.mp3" />)
    await userEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(play).toHaveBeenCalled())
  })

  it('falls back to speech synthesis when there is no audioUrl', async () => {
    render(<AudioButton text="dog" lang="en" audioUrl={null} />)
    await userEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(speechSynthesis.speak).toHaveBeenCalled())
  })

  // getVoices() can still be empty when the 1000 ms fallback fires. Caching that
  // answer showed the muted icon on every word for the life of the tab, even once
  // the voices arrived.
  it('re-probes when the voice list was still empty at the deadline', async () => {
    let voices: { lang: string; name: string }[] = []
    vi.stubGlobal('speechSynthesis', {
      speak: vi.fn(),
      cancel: vi.fn(),
      // Fires while the list is still empty, which is the case being pinned.
      addEventListener: (_: string, cb: () => void) => cb(),
      removeEventListener: vi.fn(),
      getVoices: () => voices,
      speaking: false,
      pending: false,
    })
    resetVoiceCache()

    render(<AudioButton text="dog" lang="en" audioUrl={null} />)
    await userEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByRole('button')).toHaveAttribute('aria-label', expect.stringContaining('chưa cài giọng')))
    expect(speechSynthesis.speak).not.toHaveBeenCalled()

    voices = [{ lang: 'en-US', name: 'en' }]
    await userEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(speechSynthesis.speak).toHaveBeenCalled())
  })

  // A machine with no voices installed answers empty forever. Re-probing on every
  // click costs a listener and a second of waiting for the same muted icon.
  it('stops probing after the second empty answer', async () => {
    const getVoices = vi.fn(() => [] as { lang: string; name: string }[])
    vi.stubGlobal('speechSynthesis', {
      speak: vi.fn(),
      cancel: vi.fn(),
      addEventListener: (_: string, cb: () => void) => cb(),
      removeEventListener: vi.fn(),
      getVoices,
      speaking: false,
      pending: false,
    })
    resetVoiceCache()

    render(<AudioButton text="dog" lang="en" audioUrl={null} />)
    const button = screen.getByRole('button')
    await userEvent.click(button)
    await waitFor(() => expect(button).toHaveAttribute('aria-label', expect.stringContaining('chưa cài giọng')))
    await userEvent.click(button)
    await waitFor(() => expect(getVoices.mock.calls.length).toBeGreaterThan(1))

    const afterTwoProbes = getVoices.mock.calls.length
    await userEvent.click(button)
    await userEvent.click(button)
    expect(getVoices).toHaveBeenCalledTimes(afterTwoProbes)
  })

  it('names a labelled pill after its word, so three in a row are told apart', () => {
    render(<><AudioButton text="dog" lang="en" label="Nghe" tone="pane" /><AudioButton text="perro" lang="es" label="Nghe" tone="pane" /></>)
    expect(screen.getByRole('button', { name: 'Nghe dog' })).toHaveTextContent('Nghe')
    expect(screen.getByRole('button', { name: 'Nghe perro' })).toBeInTheDocument()
  })

  it('skips an undecodable .ogg file and uses speech synthesis', async () => {
    vi.stubGlobal('Audio', vi.fn(function () { return { play: vi.fn(() => Promise.resolve()), canPlayType: () => '' } }))
    render(<AudioButton text="dog" lang="en" audioUrl="https://x/En-dog.ogg" />)
    await userEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(speechSynthesis.speak).toHaveBeenCalled())
  })
})
