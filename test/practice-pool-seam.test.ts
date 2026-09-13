import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listPracticeWords, PRACTICE_POOL } from '@/lib/wordlist/store'
import { buildMatchTiles } from '@/lib/practice/match'
import { buildQuiz } from '@/lib/practice/quiz'

/**
 * The seam the unit tests both missed.
 *
 * `listPracticeWords` was tested on its own and `buildMatchTiles` was tested on
 * a hand-written array, so nothing exercised one feeding the other -- and that
 * is exactly where the regression lived: the fetch stopped returning the whole
 * wordlist and started returning a window of adjacent rows, while the builders
 * went on filtering what they were handed. 535 tests were green over it.
 */
function poolOf(rows: Array<{ id: string; meaning_vi: string | null }>, filtered: boolean) {
  const visible = filtered ? rows.filter((r) => r.meaning_vi !== null && r.meaning_vi !== '') : rows
  const from = () => {
    const chain = {
      select: (_c: string, opts?: { head?: boolean }) => {
        if (opts?.head) {
          const head = { not: () => head, neq: () => head, then: (r: (v: unknown) => void) => r({ count: visible.length, error: null }) }
          return head
        }
        return chain
      },
      not: () => chain,
      neq: () => chain,
      order: () => chain,
      range: (a: number, b: number) => Promise.resolve({
        data: visible.slice(a, b + 1).map((r) => ({
          id: r.id, lang: 'zh', headword: `词${r.id}`, ipa: null, meaning_vi: r.meaning_vi, audio_url: null,
        })),
        error: null,
      }),
    }
    return chain
  }
  return { from } as unknown as SupabaseClient
}

/** A month of Chinese words saved together, none carrying a Vietnamese meaning,
 *  followed by older ones that do. This is the shape that broke it. */
const rows = [
  ...Array.from({ length: 200 }, (_, i) => ({ id: `new${i}`, meaning_vi: null })),
  ...Array.from({ length: 200 }, (_, i) => ({ id: `old${i}`, meaning_vi: `nghĩa ${i}` })),
]

describe('practice pool -> round builders', () => {
  it('hands the matching game a round it can actually build', async () => {
    const words = await listPracticeWords(poolOf(rows, true), { needsMeaning: true, rand: () => 0 })
    const tiles = buildMatchTiles(words.map((w) => ({ id: w.id, headword: w.headword, meaningVi: w.meaningVi })), 6)
    expect(tiles).toHaveLength(12)
  })

  it('hands the quiz a round it can actually build', async () => {
    const words = await listPracticeWords(poolOf(rows, true), { needsMeaning: true, rand: () => 0 })
    expect(buildQuiz(words, 10, () => 0)).toHaveLength(10)
  })

  // The failing case, kept as the thing that must not come back: with the filter
  // left downstream, a window landing in the meaningless run yields nothing and
  // the screen tells someone with 400 words that they have too few.
  it('would come up empty if the filter moved back downstream', async () => {
    const unfiltered = await listPracticeWords(poolOf(rows, false), { rand: () => 0 })
    expect(unfiltered).toHaveLength(PRACTICE_POOL)
    const tiles = buildMatchTiles(
      unfiltered.map((w) => ({ id: w.id, headword: w.headword, meaningVi: w.meaningVi })), 6,
    )
    expect(tiles).toHaveLength(0)
  })
})
