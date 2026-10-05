'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { LangCode } from '@/lib/languages'
import { createClient } from '@/lib/supabase/client'
import { listPracticeWords } from '@/lib/wordlist/store'
import { useGradeSync } from '@/lib/hooks/useGradeSync'
import { GradeSyncWarning } from '@/components/practice/GradeSyncWarning'
import { gradeForMode } from '@/lib/practice/grading'
import { buildMatchTiles, type MatchTile } from '@/lib/practice/match'
import { CHECK, Empty, Hw, Loading, SessionBar, Stage } from '@/components/practice/SessionParts'
import p from './Practice.module.css'

const ROUND_SIZE = 6

export function MatchClient() {
  const supabase = useMemo(() => createClient(), [])
  const { record: recordGrade, logDay, failed: syncFailed } = useGradeSync(supabase)
  const [tiles, setTiles] = useState<MatchTile[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [matched, setMatched] = useState<Set<string>>(new Set())
  const [wrong, setWrong] = useState<string[]>([])
  const [seconds, setSeconds] = useState(0)
  const [round, setRound] = useState(0)
  const logged = useRef(false)
  // Every pair matches eventually, so a match says nothing about difficulty. A wrong
  // pairing is the only signal, and grades `hard` instead of `good`, never `again`.
  const stumbled = useRef<Set<string>>(new Set())
  // Each word tile is set in its language's face.
  const [langs, setLangs] = useState<Map<string, LangCode>>(new Map())

  useEffect(() => {
    let active = true
    listPracticeWords(supabase, { needsMeaning: true })
      .then((words) => {
        if (!active) return
        setLangs(new Map(words.map((w) => [w.id, w.lang])))
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

  if (tiles === null) return <Loading />

  if (tiles.length === 0) return <Empty title="Chưa đủ từ để chơi" note="Lưu thêm vài từ có nghĩa tiếng Việt." />

  function clickTile(tile: MatchTile) {
    if (wrong.length > 0 || matched.has(tile.key)) return
    if (selected === null) { setSelected(tile.key); return }
    if (selected === tile.key) { setSelected(null); return }
    // A round can advance while a click is in flight, leaving `selected` naming a
    // tile the current round does not hold.
    const first = tiles?.find((t) => t.key === selected)
    if (!first) { setSelected(null); return }
    if (first.wordId === tile.wordId && first.kind !== tile.kind) {
      setMatched((m) => new Set(m).add(first.key).add(tile.key))
      setSelected(null)
      recordGrade(tile.wordId, 'match', gradeForMode('match', { correct: true, nearly: stumbled.current.has(tile.wordId) }))
      // A click alone is not practice: the day counts once a pair is graded.
      if (!logged.current) { logged.current = true; logDay() }
    } else {
      stumbled.current.add(first.wordId).add(tile.wordId)
      setWrong([first.key, tile.key])
      setSelected(null)
      setTimeout(() => setWrong([]), 600)
    }
  }

  return (
    <Stage wide>
      <SessionBar label={`Ghép cặp · ${seconds}s · ${matched.size / 2}/${tiles.length / 2}`} done={matched.size} total={tiles.length} />

      {done ? (
        <div role="status" aria-live="polite" className={`${p.card} ${p.end}`}>
          <h1>Hoàn thành trong {seconds}s</h1>
          <GradeSyncWarning failed={syncFailed} />
          <div className={p.row}>
            <button type="button" onClick={() => setRound((r) => r + 1)} className={p.btn}>Chơi lại</button>
            <Link href="/practice" className={p.ghost}>Về luyện tập</Link>
          </div>
        </div>
      ) : (
        <div className={p.tiles}>
          {/* The screen reader hears what the outline and the shake show. */}
          <p role="status" aria-live="polite" className="sr-only col-span-full">
            {wrong.length > 0 ? 'Chưa khớp. Thử lại.' : ''}
          </p>
          {tiles.map((t) => {
            const isMatched = matched.has(t.key)
            const state = isMatched ? 'ok' : wrong.includes(t.key) ? 'no' : selected === t.key ? 'sel' : undefined
            const lang = t.kind === 'word' ? langs.get(t.wordId) : undefined
            return (
              <button
                key={t.key}
                type="button"
                disabled={isMatched}
                aria-pressed={t.key === selected}
                onClick={() => clickTile(t)}
                className={p.tile}
                data-state={state}
              >
                {isMatched && CHECK}
                {lang ? <Hw text={t.text} lang={lang} /> : t.text}
              </button>
            )
          })}
        </div>
      )}
    </Stage>
  )
}
