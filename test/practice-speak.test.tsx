import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SpeakSession } from '@/components/practice/SpeakSession'
import { gradeWordById } from '@/lib/wordlist/review'
import { listPracticeWords } from '@/lib/wordlist/store'
import type { SpeechRecognitionLike } from '@/lib/practice/recognition'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/wordlist/review', () => ({ gradeWordById: vi.fn() }))
vi.mock('@/lib/wordlist/store', () => ({ listPracticeWords: vi.fn() }))
vi.mock('@/lib/wordlist/activity', () => ({ logActivityDay: vi.fn(async () => {}) }))

let last: SpeechRecognitionLike | null = null
// A constructor may return its own object; `new Recogniser()` then hands back this one.
const Recogniser = vi.fn(function () {
  const r: SpeechRecognitionLike = {
    lang: '', interimResults: false, maxAlternatives: 1,
    onresult: () => {}, onerror: () => {}, onend: () => {}, start: () => {}, stop: () => {},
  }
  last = r
  return r
})

function say(transcript: string) {
  act(() => last!.onresult({ results: [[{ transcript }]] }))
}

beforeEach(() => {
  last = null
  Object.assign(window, { SpeechRecognition: Recogniser })
  vi.mocked(gradeWordById).mockReset().mockResolvedValue(null)
  vi.mocked(listPracticeWords).mockReset().mockResolvedValue([
    { id: 'w1', lang: 'en', headword: 'house', ipa: null, meaningVi: 'ngôi nhà', audioUrl: null },
  ])
})
afterEach(() => { Reflect.deleteProperty(window, 'SpeechRecognition') })

// Reading aloud a headword already on screen is not a retrieval, so the prompt is the meaning.
describe('SpeakSession', () => {
  it('prompts with the meaning and keeps the word hidden until it is spoken', async () => {
    const user = userEvent.setup()
    render(<SpeakSession />)
    expect(await screen.findByText('ngôi nhà')).toBeInTheDocument()
    expect(screen.queryByText('house')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Nói' }))
    say('house')
    expect(screen.getByText('house')).toBeInTheDocument()
    expect(gradeWordById).toHaveBeenCalledWith({}, 'w1', 'speak', 'good')
  })

  it('records a near miss before the reveal as hard', async () => {
    const user = userEvent.setup()
    render(<SpeakSession />)
    await user.click(await screen.findByRole('button', { name: 'Nói' }))
    say('houze')
    expect(gradeWordById).toHaveBeenCalledWith({}, 'w1', 'speak', 'hard')
  })

  it('records nothing once the word was shown', async () => {
    const user = userEvent.setup()
    render(<SpeakSession />)
    await user.click(await screen.findByRole('button', { name: 'Hiện từ' }))
    expect(screen.getByText('house')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Nói' }))
    say('house')
    expect(screen.getByText('Đúng')).toBeInTheDocument()
    expect(gradeWordById).not.toHaveBeenCalled()
  })

  it('records nothing on a miss, and shows the word', async () => {
    const user = userEvent.setup()
    render(<SpeakSession />)
    await user.click(await screen.findByRole('button', { name: 'Nói' }))
    say('mouse trap')
    expect(gradeWordById).not.toHaveBeenCalled()
    expect(screen.getByText('house')).toBeInTheDocument()
  })
})
