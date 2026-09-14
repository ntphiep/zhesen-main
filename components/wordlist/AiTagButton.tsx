'use client'
import { useState } from 'react'
import { callAi } from '@/lib/ai/browser'
import { useAiEnabled } from '@/lib/hooks/useAiEnabled'
import type { UserWord } from '@/lib/wordlist/types'

/** How many words go in one request. The task caps the list at 40; a larger
 *  selection is sent in several rounds so tagging the whole list is possible
 *  without a prompt long enough to blunt the answers. */
const BATCH = 20

/**
 * Tagging by topic, which is the only thing that makes a four-hundred-word list
 * navigable.
 *
 * The tag filter has been there all along with almost nothing to filter by,
 * because tagging four hundred words by hand is not something anyone does. The
 * tags already in use are sent with the request so the assistant reuses
 * "văn phòng" instead of coining "công sở" beside it, which would leave the
 * filter bar with two chips for one idea.
 *
 * Matching by headword rather than by position: the model is asked to keep the
 * order and usually does, but a dropped line would otherwise shift every tag
 * onto the wrong word, and a wrong tag is worse than a missing one.
 */
export function AiTagButton({
  words,
  existingTags,
  onTagged,
}: {
  /** The selected words, which are the ones to tag. */
  words: UserWord[]
  /** Every tag already used anywhere in the wordlist. */
  existingTags: string[]
  onTagged: (byHeadword: Map<string, string[]>) => void | Promise<void>
}) {
  const enabled = useAiEnabled()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!enabled || words.length === 0) return null

  async function run() {
    setBusy(true)
    setError(null)
    const byHeadword = new Map<string, string[]>()

    for (let i = 0; i < words.length; i += BATCH) {
      const batch = words.slice(i, i + BATCH)
      const outcome = await callAi('tags', {
        words: batch.map((w) => ({ headword: w.headword, meaningVi: w.meaningVi })),
        existing: existingTags,
      })
      if (outcome.status === 'error') {
        // Keep whatever earlier rounds produced: a learner who selected two
        // hundred words and lost the last round should not lose the first nine.
        setError(outcome.message)
        break
      }
      for (const row of outcome.data.tags) {
        if (batch.some((w) => w.headword === row.headword)) byHeadword.set(row.headword, row.tags)
      }
    }

    if (byHeadword.size > 0) await onTagged(byHeadword)
    setBusy(false)
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={run}
        className="rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-40"
      >
        {busy ? 'Đang gắn thẻ…' : 'Gắn thẻ bằng trợ lý'}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </>
  )
}
