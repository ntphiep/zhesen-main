'use client'
import { AudioButton } from '@/components/ui/AudioButton'
import type { TypedResult } from '@/lib/wordlist/typing'
import type { LangCode } from '@/lib/languages'

export interface TypingPrompt {
  headword: string
  meaningVi: string | null
  ipa: string | null
  audioUrl: string | null
  lang: LangCode
}

/** One typed-answer question. `write` prompts with the meaning; `dictation` prompts
 * with audio. Once `result` is set the input locks and feedback + "Tiếp" appear. */
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
  return (
    <div className="rounded-2xl border border-black/10 p-8">
      {mode === 'write' ? (
        <div className="text-center">
          <p className="text-sm text-black/50">Nghĩa</p>
          <div className="mt-1 text-2xl font-semibold">{word.meaningVi}</div>
          <p className="mt-2 text-sm text-black/40">Gõ từ tiếng Anh tương ứng</p>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <p className="text-sm text-black/50">Nghe và gõ lại từ</p>
          <div className="mt-2 scale-125"><AudioButton text={word.headword} lang={word.lang} audioUrl={word.audioUrl} /></div>
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); if (answered) onNext(); else onSubmit() }}
        className="mt-6 flex flex-col gap-3"
      >
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={answered}
          aria-label="Câu trả lời"
          placeholder="Nhập câu trả lời…"
          className="w-full rounded-lg border border-black/15 px-4 py-3 text-center text-lg focus:border-black/40 focus:outline-none disabled:bg-black/5"
        />
        {!answered && <button type="submit" className="rounded-lg bg-black py-2 text-white">Kiểm tra</button>}
      </form>

      {answered && (
        <div className="mt-4 text-center">
          {result === 'correct' && <p className="font-medium text-emerald-700">Chính xác ✓</p>}
          {result === 'close' && <p className="font-medium text-amber-700">Gần đúng — đáp án: <b>{word.headword}</b></p>}
          {result === 'wrong' && <p className="font-medium text-rose-700">Đáp án: <b>{word.headword}</b></p>}
          {mode === 'dictation' && word.meaningVi && <p className="mt-1 text-sm text-black/50">{word.meaningVi}</p>}
          <button onClick={onNext} className="mt-4 w-full rounded-lg bg-black py-2 text-white">Tiếp</button>
        </div>
      )}
    </div>
  )
}
