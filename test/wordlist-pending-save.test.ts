import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rememberPendingSave, takePendingSave } from '@/lib/wordlist/pendingSave'

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('pending save', () => {
  it('hands the entry back once within 30 minutes', () => {
    rememberPendingSave('en:take', 1_000)
    expect(takePendingSave('en:take', 1_000 + 30 * 60 * 1000)).toBe(true)
    expect(takePendingSave('en:take', 1_000 + 30 * 60 * 1000)).toBe(false)
  })

  it('drops an unreadable key', () => {
    sessionStorage.setItem('zhesen:pending-save', '{not json')
    expect(takePendingSave('en:take')).toBe(false)
    expect(sessionStorage.getItem('zhesen:pending-save')).toBeNull()
  })

  // Blocked storage costs the save after registering, never the page.
  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => rememberPendingSave('en:take')).not.toThrow()
    expect(takePendingSave('en:take')).toBe(false)
  })
})
