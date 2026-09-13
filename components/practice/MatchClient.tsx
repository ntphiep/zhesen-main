'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { listWords } from '@/lib/wordlist/store'
import { logActivityDay } from '@/lib/wordlist/activity'
import { useGradeSync } from '@/lib/hooks/useGradeSync'
import { GradeSyncWarning } from '@/components/practice/GradeSyncWarning'
import { gradeForMode } from '@/lib/practice/grading'
import { buildMatchTiles, type MatchTile } from '@/lib/practice/match'

const ROUND_SIZE = 6

export function MatchClient() {
  const supabase = useMemo(() => createClient(), [])
  const { record: recordGrade, failed: syncFailed } = useGradeSync(supabase)
  const [tiles, setTiles] = useState<MatchTile[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [matched, setMatched] = useState<Set<string>>(new Set())
  const [wrong, setWrong] = useState<string[]>([])
  const [seconds, setSeconds] = useState(0)
  const [round, setRound] = useState(0)
  const logged = useRef(false)
  // Words that were part of a wrong pairing this round. The game always ends with
  // every pair matched, so a plain match says nothing about difficulty; hesitating
  // over a word is the only signal it has, and it grades the pair `hard` instead of
  // `good`. There is no outcome here that could mean forgetting.
  const stumbled = useRef<Set<string>>(new Set())

  useEffect(() => {
    let active = true
    listWords(supabase)
      .then((words) => {
        if (!active) return
        setTiles(buildMatchTiles(words.map((w) => ({ id: w.id, headword: w.headword, meaningVi: w.meaningVi })), ROUND_SIZE))
        setSelected(null); setMatched(new Set()); setWrong([]); setSeconds(0)
        stumbled.current = new Set()
      })
      .catch(() => active && setTiles([]))
    return () => { active = false }
  }, [supabase, round])

  const done = tiles !== null && tiles.length > 0 && matched.size === tiles.length

  useEffect(() => {
    if (tiles === null || done) return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [tiles, done])

  if (tiles === null) return <main className="p-12 text-center text-black/50">Đang tải…</main>

  if (tiles.length === 0) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-xl font-semibold">Chưa đủ từ để chơi</div>
        <p className="mt-2 text-black/50">Thêm vài từ có nghĩa tiếng Việt vào sổ tay trước.</p>
        <Link href="/practice" className="mt-6 inline-block rounded-lg bg-black px-5 py-2 text-white">Về luyện tập</Link>
      </main>
    )
  }

  function clickTile(tile: MatchTile) {
    if (wrong.length > 0 || matched.has(tile.key)) return
    if (!logged.current) { logged.current = true; void logActivityDay(supabase) }
    if (selected === null) { setSelected(tile.key); return }
    if (selected === tile.key) { setSelected(null); return }
    const first = tiles!.find((t) => t.key === selected)!
    if (first.wordId === tile.wordId && first.kind !== tile.kind) {
      setMatched((m) => new Set(m).add(first.key).add(tile.key))
      setSelected(null)
      recordGrade(tile.wordId, gradeForMode('match', { correct: true, nearly: stumbled.current.has(tile.wordId) }))
    } else {
      stumbled.current.add(first.wordId).add(tile.wordId)
      setWrong([first.key, tile.key])
      setSelected(null)
      setTimeout(() => setWrong([]), 600)
    }
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <div className="mb-4 flex items-center justify-between text-sm text-black/50">
        <Link href="/practice" className="hover:underline">← Thoát</Link>
        <span>Ghép cặp · {seconds}s · {matched.size / 2}/{tiles.length / 2}</span>
      </div>

      {done ? (
        <div role="status" aria-live="polite" className="rounded-2xl border border-black/10 p-8 text-center">
          <div className="text-2xl font-semibold">Hoàn thành trong {seconds}s 🎉</div>
          <GradeSyncWarning failed={syncFailed} />
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={() => setRound((r) => r + 1)} className="rounded-lg bg-black px-5 py-2 text-white">Chơi lại</button>
            <Link href="/practice" className="rounded-lg border border-black/15 px-5 py-2 hover:bg-black/5">Về luyện tập</Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {/* Matched/wrong feedback is otherwise color-only -- announce it for screen readers. */}
          <p role="status" aria-live="polite" className="sr-only col-span-full">
            {wrong.length > 0 ? 'Không khớp, thử lại.' : ''}
          </p>
          {tiles.map((t) => {
            const isMatched = matched.has(t.key)
            const isSelected = selected === t.key
            const isWrong = wrong.includes(t.key)
            let cls = 'border-black/15 hover:bg-black/5'
            if (isMatched) cls = 'border-emerald-200 bg-emerald-50 text-emerald-700/60'
            else if (isWrong) cls = 'border-rose-300 bg-rose-50 text-rose-700'
            else if (isSelected) cls = 'border-black ring-2 ring-black/20'
            return (
              <button
                key={t.key}
                type="button"
                disabled={isMatched}
                onClick={() => clickTile(t)}
                className={`min-h-16 rounded-xl border px-3 py-3 text-sm transition ${cls} ${t.kind === 'word' ? 'font-medium' : ''}`}
              >
                {t.text}
              </button>
            )
          })}
        </div>
      )}
    </main>
  )
}
