import { describe, it, expect, vi, afterEach } from 'vitest'
import { pushSupport } from '@/lib/push/browser'

const safari = (os: string) =>
  `Mozilla/5.0 (iPhone; CPU iPhone OS ${os} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1`

afterEach(() => { vi.unstubAllGlobals() })

describe('pushSupport in a Safari tab, without the push APIs', () => {
  it.each([
    ['16_4', 'install'],
    ['17_2', 'install'],
    ['16_3_1', 'none'],
    ['15_8', 'none'],
  ] as const)('on iOS %s says %s', (os, support) => {
    vi.stubGlobal('navigator', { standalone: false, userAgent: safari(os) })
    expect(pushSupport()).toBe(support)
  })

  it('asks iPadOS with a desktop user agent to install', () => {
    vi.stubGlobal('navigator', {
      standalone: false,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    })
    expect(pushSupport()).toBe('install')
  })

  it('says none in a browser that is not Safari on iOS', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })
    expect(pushSupport()).toBe('none')
  })
})
