import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AudioButton, speechLang } from '@/components/AudioButton'

describe('speechLang', () => {
  it('maps lang codes to BCP-47', () => {
    expect(speechLang('en')).toBe('en-US')
    expect(speechLang('es')).toBe('es-ES')
    expect(speechLang('zh')).toBe('zh-CN')
  })
})

describe('AudioButton', () => {
  beforeEach(() => {
    vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel: vi.fn() })
    vi.stubGlobal('SpeechSynthesisUtterance', vi.fn(function (this: Record<string, unknown>, t: string) { this.text = t }))
  })

  it('plays the audio file when audioUrl is present', async () => {
    const play = vi.fn(() => Promise.resolve())
    vi.stubGlobal('Audio', vi.fn(() => ({ play })))
    render(<AudioButton text="dog" lang="en" audioUrl="x.ogg" />)
    await userEvent.click(screen.getByRole('button'))
    expect(play).toHaveBeenCalled()
  })

  it('uses speech synthesis when no audioUrl', async () => {
    render(<AudioButton text="dog" lang="en" audioUrl={null} />)
    await userEvent.click(screen.getByRole('button'))
    expect(speechSynthesis.speak).toHaveBeenCalled()
  })
})
