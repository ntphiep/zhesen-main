'use client'
import { useEffect, useRef, type ReactNode } from 'react'
import { AudioButton, SourceLink } from '@/components/ui/AudioButton'
import { Verdict } from '@/components/practice/SessionParts'
import { useKeyGate } from '@/lib/hooks/useKeyGate'
import { holdBack } from '@/components/practice/keys'
import type { TypingMode } from '@/lib/practice/rounds'
import type { TypedResult, TypingPrompt } from '@/lib/practice/typing'
import p from './Practice.module.css'

export type { TypingPrompt }

/** The question side of each typing mode. */
function Prompt({ mode, word, answered }: { mode: TypingMode; word: TypingPrompt; answered: boolean }): ReactNode {
  switch (mode) {
    case 'write':
      return (
        <>
          <p className={p.meta}>Nghĩa</p>
          <div className={`${p.mid} mt-2`}>{word.meaningVi}</div>
          <p className={p.ask}>Gõ từ mang nghĩa này</p>
        </>
      )
    case 'dictation':
      return (
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
      )
    case 'ipa':
      return (
        <>
          <p className={p.meta}>Phiên âm</p>
          <div className={`ipa ${p.mid} mt-2`}>{word.ipa}</div>
          <p className={p.ask}>Gõ từ đọc như thế này</p>
        </>
      )
    case 'cloze': {
      const gap = word.gap
      if (!gap) return null
      return (
        <>
          <p className={p.meta}>Điền vào câu</p>
          <p className={p.sentence} lang={word.lang}>
            {gap.before}
            {answered ? <b data-hw="">{gap.answer}</b> : <span className={p.blank}><span className="sr-only">chỗ trống</span></span>}
            {gap.after}
          </p>
          {answered && gap.translationVi && <p className={p.heard}>{gap.translationVi}</p>}
          <p className={p.ask}>Từ còn thiếu nghĩa là <b>{word.meaningVi}</b></p>
        </>
      )
    }
    case 'forms':
      return (
        <>
          <p className={p.meta}>Dạng từ</p>
          <div className={`${p.mid} mt-2`} lang={word.lang}>{word.headword}</div>
          <p className={p.ask}>Gõ dạng {word.cue}</p>
        </>
      )
  }
}

/** One typed-answer question. The prompt depends on the mode: the meaning, the sound, the
 * IPA, a sentence with a gap or a form to give. Once `result` is set the input locks, the
 * feedback appears and "Tiếp" takes the focus, so Enter answers and Enter again moves on. */
export function TypingCard({
  mode, word, value, result, onChange, onSubmit, onNext,
}: {
  mode: TypingMode
  word: TypingPrompt
  value: string
  result: TypedResult | null
  onChange: (v: string) => void
  onSubmit: () => void
  onNext: () => void
}) {
  const answered = result !== null
  const nextRef = useRef<HTMLButtonElement>(null)
  // A new card or its answer is a new step: a held Enter cannot submit or skip it.
  const settled = useKeyGate(answered)
  const expected = word.answer ?? word.headword

  useEffect(() => {
    if (answered) nextRef.current?.focus({ preventScroll: true })
  }, [answered])

  return (
    <div
      className={p.card}
      onKeyDownCapture={(e) => holdBack(e, settled)}
    >
      <Prompt mode={mode} word={word} answered={answered} />

      <form
        // An empty answer is never graded: it would record a lapse for a word never tried.
        onSubmit={(e) => { e.preventDefault(); if (answered) onNext(); else if (value.trim()) onSubmit() }}
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
        {!answered && <button type="submit" disabled={!value.trim()} className={p.btn}>Kiểm tra</button>}
      </form>

      {answered && (
        <div role="status" aria-live="polite">
          {result === 'correct' && <Verdict result="correct">Đúng</Verdict>}
          {result === 'accent' && <Verdict result="accent">Gần đúng, chú ý dấu. Đáp án: <b data-hw="" lang={word.lang}>{word.lang === 'zh' && word.ipa ? `${expected} ${word.ipa}` : expected}</b></Verdict>}
          {result === 'close' && <Verdict result="close">Gần đúng. Đáp án: <b data-hw="" lang={word.lang}>{expected}</b></Verdict>}
          {result === 'wrong' && <Verdict result="wrong">Sai. Đáp án: <b data-hw="" lang={word.lang}>{expected}</b></Verdict>}
          {(mode === 'dictation' || mode === 'ipa' || mode === 'forms') && word.meaningVi && <p className={p.heard}>{word.meaningVi}</p>}
          {mode === 'ipa' && (
            <div className={p.play}>
              <AudioButton text={word.headword} lang={word.lang} audioUrl={word.audioUrl} />
            </div>
          )}
          <button ref={nextRef} type="button" onClick={onNext} className={`${p.btn} ${p.wide}`}>Tiếp</button>
        </div>
      )}
    </div>
  )
}
