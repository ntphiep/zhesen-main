'use client'
import { useEffect, useRef } from 'react'
import { AudioButton, SourceLink } from '@/components/ui/AudioButton'
import type { TypedResult } from '@/lib/practice/typing'
import type { LangCode } from '@/lib/languages'
import { Verdict } from '@/components/practice/SessionParts'
import p from './Practice.module.css'

export interface TypingPrompt {
  /** The saved word's id, so an answer can be recorded against its schedule. */
  id: string
  headword: string
  meaningVi: string | null
  ipa: string | null
  audioUrl: string | null
  lang: LangCode
}

/** One typed-answer question. `write` prompts with the meaning; `dictation` prompts
 * with audio. Once `result` is set the input locks, the feedback appears and "Tiếp" takes
 * the focus, so Enter answers and Enter again moves on. */
export function TypingCard({
  mode, word, value, result, onChange, onSubmit, onNext,
}: {
  mode: 'write' | 'dictation'
  word: TypingPrompt
  value: string
  result: TypedResult | null
  onChange: (v: string) => void
  onSubmit: () => void
  onNext: () => void
}) {
  const answered = result !== null
  const nextRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (answered) nextRef.current?.focus({ preventScroll: true })
  }, [answered])

  return (
    <div className={p.card}>
      {mode === 'write' ? (
        <>
          <p className={p.meta}>Nghĩa</p>
          <div className={`${p.mid} mt-2`}>{word.meaningVi}</div>
          <p className={p.ask}>Gõ từ mang nghĩa này</p>
        </>
      ) : (
        <>
          <p className={p.meta}>Nghe rồi gõ từ</p>
          <div className={p.play}>
            <AudioButton
              text={word.headword}
              lang={word.lang}
              audioUrl={word.audioUrl}
              label={answered ? undefined : 'Phát âm từ cần gõ'}
            />
          </div>
          {/* The Commons file name spells the word, so the link waits for the answer. */}
          {answered && <div className={p.src}><SourceLink url={word.audioUrl} /></div>}
        </>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); if (answered) onNext(); else onSubmit() }}
        className={p.form}
      >
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={answered}
          aria-label="Câu trả lời"
          placeholder="Gõ từ…"
          autoComplete="off"
          spellCheck={false}
          lang={word.lang}
          data-state={result ?? undefined}
          className={p.input}
        />
        {!answered && <button type="submit" className={p.btn}>Kiểm tra</button>}
      </form>

      {answered && (
        <div role="status" aria-live="polite">
          {result === 'correct' && <Verdict result="correct">Đúng</Verdict>}
          {result === 'close' && <Verdict result="close">Gần đúng. Đáp án: <b data-hw="" lang={word.lang}>{word.headword}</b></Verdict>}
          {result === 'wrong' && <Verdict result="wrong">Sai. Đáp án: <b data-hw="" lang={word.lang}>{word.headword}</b></Verdict>}
          {mode === 'dictation' && word.meaningVi && <p className={p.heard}>{word.meaningVi}</p>}
          <button ref={nextRef} type="button" onClick={onNext} className={`${p.btn} ${p.wide}`}>Tiếp</button>
        </div>
      )}
    </div>
  )
}
