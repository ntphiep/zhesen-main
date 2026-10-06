'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useGradeSync } from '@/lib/hooks/useGradeSync'
import { gradeForMode } from '@/lib/practice/grading'
import { choiceRound, type ChoiceMode } from '@/lib/practice/rounds'
import type { QuizQuestion } from '@/lib/practice/quiz'
import { QuizCard } from '@/components/practice/QuizCard'
import { Empty, Loading, Result, SessionBar, Stage } from '@/components/practice/SessionParts'

const EMPTY: Record<ChoiceMode, { title: string; note: string }> = {
  quiz: { title: 'Chưa đủ từ để kiểm tra', note: 'Lưu thêm vài từ có nghĩa tiếng Việt.' },
  listen: { title: 'Chưa đủ từ để luyện nghe', note: 'Lưu thêm vài từ tiếng Anh hoặc tiếng Tây Ban Nha có nghĩa tiếng Việt.' },
  phrase: { title: 'Chưa có cụm từ để luyện', note: 'Lưu thêm cụm động từ, thành ngữ hoặc kết hợp từ tiếng Anh.' },
}

export function QuizClient({ mode = 'quiz' }: { mode?: ChoiceMode }) {
  const supabase = useMemo(() => createClient(), [])
  const { record: recordGrade, logDay, failed: syncFailed } = useGradeSync(supabase)
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [round, setRound] = useState(0) // bump to rebuild the quiz on "Làm lại"
  const logged = useRef(false)

  useEffect(() => {
    let active = true
    choiceRound(supabase, mode)
      .then((qs) => {
        if (!active) return
        setQuestions(qs)
        setIndex(0)
        setSelected(null)
        setScore(0)
      })
      .catch(() => active && setQuestions([]))
    return () => { active = false }
  }, [supabase, mode, round])

  if (questions === null) return <Loading />

  if (questions.length === 0) return <Empty title={EMPTY[mode].title} note={EMPTY[mode].note} />

  const finished = index >= questions.length
  if (finished) {
    return (
      <Result
        score={score}
        total={questions.length}
        note={score === questions.length ? 'Đúng hết.' : undefined}
        failed={syncFailed}
        onAgain={() => setRound((r) => r + 1)}
      />
    )
  }

  const current = questions[index]

  function select(option: string) {
    if (selected !== null) return
    setSelected(option)
    const correct = option === current.answer
    if (correct) setScore((s) => s + 1)
    // The answer counts towards the word's schedule, but is not awaited: a slow write
    // must not hold up the next question, and the flashcard review stays the authority.
    recordGrade(current.id, mode, gradeForMode(mode, { correct }))
    if (!logged.current) { logged.current = true; logDay() }
  }
  function next() {
    setSelected(null)
    setIndex((i) => i + 1)
  }

  return (
    <Stage>
      <SessionBar label={`Câu ${index + 1}/${questions.length} · Đúng ${score}`} done={index + (selected === null ? 0 : 1)} total={questions.length} />
      <QuizCard key={index} question={current} listen={mode === 'listen'} selected={selected} onSelect={select} onNext={next} />
    </Stage>
  )
}
