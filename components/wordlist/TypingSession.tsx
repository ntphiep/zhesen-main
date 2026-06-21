'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { listWords } from '@/lib/wordlist/store'
import { checkTypedAnswer, type TypedResult } from '@/lib/wordlist/typing'
import { TypingCard, type TypingPrompt } from '@/components/wordlist/TypingCard'

const SIZE = 10

function shuffle<T>(input: T[]): T[] {
  const a = [...input]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function TypingSession({ mode }: { mode: 'write' | 'dictation' }) {
  const supabase = useMemo(() => createClient(), [])
  const [queue, setQueue] = useState<TypingPrompt[] | null>(null)
  const [index, setIndex] = useState(0)
  const [value, setValue] = useState('')
  const [result, setResult] = useState<TypedResult | null>(null)
  const [score, setScore] = useState(0)
  const [round, setRound] = useState(0)

  useEffect(() => {
    let active = true
    listWords(supabase)
      .then((words) => {
        if (!active) return
        const usable = words
          .filter((w) => w.headword && (mode === 'dictation' || (w.meaningVi && w.meaningVi.trim())))
          .map((w): TypingPrompt => ({ headword: w.headword, meaningVi: w.meaningVi, ipa: w.ipa, audioUrl: w.audioUrl, lang: w.lang }))
        setQueue(shuffle(usable).slice(0, SIZE))
        setIndex(0); setValue(''); setResult(null); setScore(0)
      })
      .catch(() => active && setQueue([]))
    return () => { active = false }
  }, [supabase, mode, round])

  if (queue === null) return <main className="p-12 text-center text-black/50">Đang tải…</main>

  if (queue.length === 0) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-xl font-semibold">Chưa đủ từ để luyện</div>
        <p className="mt-2 text-black/50">Thêm vài từ vào sổ tay trước nhé.</p>
        <Link href="/wordlist" className="mt-6 inline-block rounded-lg bg-black px-5 py-2 text-white">Về sổ tay</Link>
      </main>
    )
  }

  if (index >= queue.length) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-2xl font-semibold">Kết quả: {score}/{queue.length}</div>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => setRound((r) => r + 1)} className="rounded-lg bg-black px-5 py-2 text-white">Làm lại</button>
          <Link href="/wordlist" className="rounded-lg border border-black/15 px-5 py-2 hover:bg-black/5">Về sổ tay</Link>
        </div>
      </main>
    )
  }

  const current = queue[index]
  const title = mode === 'write' ? 'Viết từ' : 'Nghe & chép'

  function submit() {
    if (result !== null) return
    const r = checkTypedAnswer(value, current.headword)
    setResult(r)
    if (r !== 'wrong') setScore((s) => s + 1)
  }
  function next() {
    setResult(null); setValue(''); setIndex((i) => i + 1)
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <div className="mb-4 flex items-center justify-between text-sm text-black/50">
        <Link href="/wordlist" className="hover:underline">← Thoát</Link>
        <span>{title} · {index + 1}/{queue.length} · Đúng {score}</span>
      </div>
      <TypingCard
        mode={mode}
        word={current}
        value={value}
        result={result}
        onChange={setValue}
        onSubmit={submit}
        onNext={next}
      />
    </main>
  )
}
