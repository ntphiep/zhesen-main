import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AudioButton, speechLang } from '@/components/ui/AudioButton'

describe('speechLang', () => {
  it('maps lang codes to BCP-47', () => {
    expect(speechLang('en')).toBe('en-US')
    expect(speechLang('es')).toBe('es-ES')
    expect(speechLang('zh')).toBe('zh-CN')
  })
})

describe('AudioButton', () => {
  beforeEach(() => {
    vi.stubGlobal('speechSynthesis', {
      speak: vi.fn(), cancel: vi.fn(), addEventListener: vi.fn(),
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

  it('skips an undecodable .ogg file and uses speech synthesis', async () => {
    vi.stubGlobal('Audio', vi.fn(function () { return { play: vi.fn(() => Promise.resolve()), canPlayType: () => '' } }))
    render(<AudioButton text="dog" lang="en" audioUrl="https://x/En-dog.ogg" />)
    await userEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(speechSynthesis.speak).toHaveBeenCalled())
  })
})
