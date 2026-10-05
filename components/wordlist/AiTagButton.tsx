'use client'
import { useRef, useState } from 'react'
import { callAi } from '@/lib/ai/browser'
import { useAiEnabled } from '@/lib/hooks/useAiEnabled'
import type { UserWord } from '@/lib/wordlist/types'
import s from './Wordlist.module.css'

/** Words per request. The task caps the list at 40, so a larger selection goes in
 *  several rounds rather than one prompt long enough to blunt the answers. */
const BATCH = 20

/** `tagsInput.existing` is capped at 40; a longer array fails the schema and turns
 *  the whole run into a 400. */
const MAX_EXISTING = 40

/**
 * Tagging by topic, the only thing that makes a four-hundred-word list navigable.
 *
 * Tags already in use go with each request so the assistant reuses "văn phòng"
 * instead of coining "công sở" beside it, and tags coined during the run must join
 * that list, or a ten-round run reintroduces the duplicate.
 *
 * Rows are matched by headword, not position, and requests are grouped by language:
 * English "no" and Spanish "no" would otherwise share one answer.
 *
 * Dừng ends the run after the round in flight, whose answer is kept like every earlier one;
 * words left without a tag are counted once the run ends.
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
  /** Keyed `lang:headword`. */
  onTagged: (byKey: Map<string, string[]>) => void | Promise<void>
}) {
  const enabled = useAiEnabled()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(0)
  const [missed, setMissed] = useState(0)
  const stopRef = useRef(false)

  if (!enabled || words.length === 0) return null

  async function run() {
    setBusy(true)
    setError(null)
    setMissed(0)
    setDone(0)
    stopRef.current = false
    const byKey = new Map<string, string[]>()
    const known = new Set(existingTags)

    const byLang = new Map<UserWord['lang'], UserWord[]>()
    for (const w of words) {
      const group = byLang.get(w.lang)
      if (group) group.push(w)
      else byLang.set(w.lang, [w])
    }

    try {
      rounds: for (const [lang, group] of byLang) {
        for (let i = 0; i < group.length; i += BATCH) {
          if (stopRef.current) break rounds
          const batch = group.slice(i, i + BATCH)
          const outcome = await callAi('tags', {
            words: batch.map((w) => ({ headword: w.headword, meaningVi: w.meaningVi })),
            // Take the tail: a Set keeps insertion order, so tags coined during this
            // run are at the end, and slicing from the front would send the same
            // starting list every round and coin a duplicate anyway.
            existing: [...known].slice(-MAX_EXISTING),
          })
          if (outcome.status === 'error') {
            // Keep whatever earlier rounds produced: losing the last round of two
            // hundred words must not lose the first nine.
            setError(outcome.message)
            break rounds
          }
          for (const row of outcome.data.tags) {
            if (!batch.some((w) => w.headword === row.headword) || row.tags.length === 0) continue
            byKey.set(`${lang}:${row.headword}`, row.tags)
            for (const tag of row.tags) known.add(tag)
          }
          setDone((n) => n + batch.length)
        }
      }
    } catch {
      // `callAi` handles fetch failures; its task-module import can still reject after a redeploy.
      setError('Chưa gắn được thẻ. Thử lại.')
    }
    try {
      if (byKey.size > 0) await onTagged(byKey)
    } catch {
      setError('Chưa lưu được thẻ. Thử lại.')
    } finally {
      setMissed(words.length - byKey.size)
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={run}
        className={s.ghost}
      >
        {busy ? `Đang gắn thẻ ${done}/${words.length}` : 'Gắn thẻ bằng AI'}
      </button>
      {busy && (
        <button type="button" onClick={() => { stopRef.current = true }} className={s.ghost}>
          Dừng
        </button>
      )}
      {error && <span className={s.fail}>{error}</span>}
      {!busy && missed > 0 && <span className={s.note}>{missed} từ chưa có thẻ.</span>}
    </>
  )
}
