import { describe, it, expect } from 'vitest'
import { ping } from '@/lib/sanity'

describe('sanity', () => {
  it('pings', () => {
    expect(ping()).toBe('pong')
  })
})
