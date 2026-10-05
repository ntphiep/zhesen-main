'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { listPracticeWords } from '@/lib/wordlist/store'
import { useGradeSync } from '@/lib/hooks/useGradeSync'
import { gradeForMode } from '@/lib/practice/grading'
import { buildQuiz, type QuizQuestion } from '@/lib/practice/quiz'
import { QuizCard } from '@/components/practice/QuizCard'
import { Empty, Loading, Result, SessionBar, Stage } from '@/components/practice/SessionParts'

const QUIZ_SIZE = 10

export function QuizClient() {
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
    listPracticeWords(supabase, { needsMeaning: true })
      .then((words) => {
        if (!active) return
        const qs = buildQuiz(
          words.map((x) => ({ id: x.id, headword: x.headword, ipa: x.ipa, lang: x.lang, meaningVi: x.meaningVi })),
          QUIZ_SIZE,
        )
        setQuestions(qs)
        setIndex(0)
        setSelected(null)
        setScore(0)
      })
      .catch(() => active && setQuestions([]))
    return () => { active = false }
  }, [supabase, round])

  if (questions === null) return <Loading />

  if (questions.length === 0) return <Empty title="Chưa đủ từ để kiểm tra" note="Lưu thêm vài từ có nghĩa tiếng Việt." />

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
    recordGrade(current.id, 'quiz', gradeForMode('quiz', { correct }))
    if (!logged.current) { logged.current = true; logDay() }
  }
  function next() {
    setSelected(null)
    setIndex((i) => i + 1)
  }

  return (
    <Stage>
      <SessionBar label={`Câu ${index + 1}/${questions.length} · Đúng ${score}`} done={index + (selected === null ? 0 : 1)} total={questions.length} />
      <QuizCard key={index} question={current} selected={selected} onSelect={select} onNext={next} />
    </Stage>
  )
}
