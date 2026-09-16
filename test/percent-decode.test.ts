import { describe, it, expect } from 'vitest'
import { percentDecode } from '@/lib/http/percentDecode'

describe('percentDecode', () => {
  it('decodes a percent-encoded segment', () => {
    expect(percentDecode('%E7%8B%97')).toBe('狗')
    expect(percentDecode('caf%C3%A9')).toBe('café')
  })

  it('leaves an ordinary segment alone', () => {
    expect(percentDecode('dog')).toBe('dog')
  })

  // decodeURIComponent throws URIError on these, which turned a wrong address
  // into a 500 instead of a 404.
  it('passes through a segment that is not valid percent-encoding', () => {
    expect(percentDecode('%')).toBe('%')
    expect(percentDecode('100%25%')).toBe('100%25%')
    expect(percentDecode('%E0%A4%A')).toBe('%E0%A4%A')
  })
})
