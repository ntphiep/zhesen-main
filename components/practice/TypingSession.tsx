'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useGradeSync } from '@/lib/hooks/useGradeSync'
import { gradeForMode } from '@/lib/practice/grading'
import { typingRound, type TypingMode } from '@/lib/practice/rounds'
import { checkTypedAnswer, type TypedResult, type TypingPrompt } from '@/lib/practice/typing'
import { TypingCard } from '@/components/practice/TypingCard'
import { Empty, Loading, Result, SessionBar, Stage } from '@/components/practice/SessionParts'

const TITLE: Record<TypingMode, string> = {
  write: 'Viết từ',
  dictation: 'Nghe và chép',
  ipa: 'Đọc phiên âm',
  cloze: 'Điền vào câu',
  forms: 'Dạng từ',
}

const EMPTY: Record<TypingMode, string> = {
  write: 'Lưu thêm vài từ có nghĩa tiếng Việt.',
  dictation: 'Lưu thêm vài từ vào sổ tay.',
  ipa: 'Lưu thêm vài từ tiếng Anh hoặc tiếng Tây Ban Nha có phiên âm.',
  cloze: 'Lưu thêm vài từ có câu ví dụ.',
  forms: 'Lưu thêm vài động từ, danh từ hoặc tính từ tiếng Anh.',
}

/** Right word, wrong form: "give up" typed where the sentence says "gave up". */
function grade(value: string, q: TypingPrompt): TypedResult {
  const r = checkTypedAnswer(value, q.answer ?? q.headword, { lang: q.lang, accepted: q.accepted })
  if (r === 'wrong' && q.answer && checkTypedAnswer(value, q.headword, { lang: q.lang }) === 'correct') return 'close'
  return r
}

export function TypingSession({ mode }: { mode: TypingMode }) {
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
    typingRound(supabase, mode)
      .then((prompts) => {
        if (!active) return
        setQueue(prompts)
        setIndex(0); setValue(''); setResult(null); setScore(0)
      })
      .catch(() => active && setQueue([]))
    return () => { active = false }
  }, [supabase, mode, round])

  if (queue === null) return <Loading />

  if (queue.length === 0) return <Empty title="Chưa đủ từ để luyện" note={EMPTY[mode]} />

  if (index >= queue.length) {
    return <Result score={score} total={queue.length} failed={syncFailed} onAgain={() => setRound((r) => r + 1)} />
  }

  const current = queue[index]

  function submit() {
    if (result !== null || !value.trim()) return
    const r = grade(value, current)
    setResult(r)
    if (r !== 'wrong') setScore((s) => s + 1)
    // A one-character typo, a missed accent or the right word in the wrong form counts as a
    // hard recall, not a clean one: the learner produced the word, which is more than the
    // quiz can tell.
    recordGrade(current.id, mode, gradeForMode(mode, { correct: r !== 'wrong', nearly: r === 'close' || r === 'accent' }))
    if (!logged.current) { logged.current = true; logDay() }
  }
  function next() {
    setResult(null); setValue(''); setIndex((i) => i + 1)
  }

  return (
    <Stage>
      <SessionBar label={`${TITLE[mode]} · ${index + 1}/${queue.length} · Đúng ${score}`} done={index + (result === null ? 0 : 1)} total={queue.length} />
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
