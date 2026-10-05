'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { listPracticeWords, listTraditionalForms } from '@/lib/wordlist/store'
import { shuffle } from '@/lib/practice/shuffle'
import { useGradeSync } from '@/lib/hooks/useGradeSync'
import { gradeForMode } from '@/lib/practice/grading'
import { checkTypedAnswer, type TypedResult } from '@/lib/practice/typing'
import { TypingCard, type TypingPrompt } from '@/components/practice/TypingCard'
import { Empty, Loading, Result, SessionBar, Stage } from '@/components/practice/SessionParts'

const SIZE = 10

export function TypingSession({ mode }: { mode: 'write' | 'dictation' }) {
  const supabase = useMemo(() => createClient(), [])
  const { record: recordGrade, logDay, failed: syncFailed } = useGradeSync(supabase)
  const [queue, setQueue] = useState<TypingPrompt[] | null>(null)
  const [index, setIndex] = useState(0)
  const [value, setValue] = useState('')
  const [result, setResult] = useState<TypedResult | null>(null)
  const [score, setScore] = useState(0)
  const [round, setRound] = useState(0)
  const logged = useRef(false)

  useEffect(() => {
    let active = true
    listPracticeWords(supabase, { needsMeaning: mode === 'write' })
      .then(async (words) => {
        const round = shuffle(words.filter((w) => w.headword && (mode === 'dictation' || (w.meaningVi && w.meaningVi.trim())))).slice(0, SIZE)
        const zh = round.filter((w) => w.lang === 'zh').map((w) => w.id)
        // Without the traditional forms only the simplified form and pinyin are accepted.
        const traditional = zh.length ? await listTraditionalForms(supabase, zh).catch(() => new Map<string, string>()) : new Map<string, string>()
        if (!active) return
        // A Chinese word's `ipa` holds its pinyin.
        setQueue(round.map((w): TypingPrompt => ({
          id: w.id, headword: w.headword, meaningVi: w.meaningVi, ipa: w.ipa, audioUrl: w.audioUrl, lang: w.lang,
          accepted: w.lang === 'zh' ? [w.ipa, traditional.get(w.id)].filter((v): v is string => Boolean(v)) : [],
        })))
        setIndex(0); setValue(''); setResult(null); setScore(0)
      })
      .catch(() => active && setQueue([]))
    return () => { active = false }
  }, [supabase, mode, round])

  if (queue === null) return <Loading />

  if (queue.length === 0) {
    return <Empty title="Chưa đủ từ để luyện" note={mode === 'write' ? 'Lưu thêm vài từ có nghĩa tiếng Việt.' : 'Lưu thêm vài từ vào sổ tay.'} />
  }

  if (index >= queue.length) {
    return <Result score={score} total={queue.length} failed={syncFailed} onAgain={() => setRound((r) => r + 1)} />
  }

  const current = queue[index]
  const title = mode === 'write' ? 'Viết từ' : 'Nghe và chép'

  function submit() {
    if (result !== null || !value.trim()) return
    const r = checkTypedAnswer(value, current.headword, { lang: current.lang, accepted: current.accepted })
    setResult(r)
    if (r !== 'wrong') setScore((s) => s + 1)
    // A one-character typo or a missed accent counts as a hard recall, not a clean one:
    // the learner produced the word, which is more than the quiz can tell.
    recordGrade(current.id, mode, gradeForMode(mode, { correct: r !== 'wrong', nearly: r === 'close' || r === 'accent' }))
    if (!logged.current) { logged.current = true; logDay() }
  }
  function next() {
    setResult(null); setValue(''); setIndex((i) => i + 1)
  }

  return (
    <Stage>
      <SessionBar label={`${title} · ${index + 1}/${queue.length} · Đúng ${score}`} done={index + (result === null ? 0 : 1)} total={queue.length} />
      <TypingCard
        key={index}
        mode={mode}
        word={current}
        value={value}
        result={result}
        onChange={setValue}
        onSubmit={submit}
        onNext={next}
      />
    </Stage>
  )
}
