import { describe, it, expect } from 'vitest'
import { viNumber, worldFacts } from '@/lib/home/worldFacts'
import stats from '@/lib/home/world/stats.json'

describe('worldFacts', () => {
  it('writes numbers the Vietnamese way', () => {
    expect(viNumber(1234.5)).toBe('1.234,5')
    expect(viNumber(12.5)).toBe('12,5')
    expect(viNumber(91)).toBe('91')
  })

  it('rounds each count toward what stays true', () => {
    const f = worldFacts(stats)
    // 21.4% of the world is 1 in 5; 12.5 times is more than 12.
    expect(f.en.long).toContain('Cứ 5 người trên thế giới thì có 1 người nói được.')
    expect(f.en).toMatchObject({ figure: 6, unit: 'châu lục' })
    expect(f.zh.figure).toBe(12)
    expect(f.zh.long).toContain('gấp hơn 12 lần')
    // 37.9% of the Americas is nearly 4 in 10; 85.1% is more than 8 in 10.
    expect(f.es.long).toContain('gần 4 trên 10')
    expect(f.es.short).toBe('Ở 18 nước ấy, cứ 10 người thì hơn 8 người nói được')
    expect(f.en.short).toBe('91 quốc gia và vùng lãnh thổ dùng làm ngôn ngữ chính thức')
  })
})
