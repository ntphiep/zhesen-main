'use client'
import { AudioButton } from '@/components/ui/AudioButton'
import type { QuizQuestion } from '@/lib/practice/quiz'
import { Ipa } from '@/components/ui/Ipa'

/** One multiple-choice question. Once `selected` is set, options are locked and
 * coloured: the correct answer green, a wrong pick red. */
export function QuizCard({
  question, selected, onSelect, onNext,
}: {
  question: QuizQuestion
  selected: string | null
  onSelect: (option: string) => void
  onNext: () => void
}) {
  const answered = selected !== null
  return (
    <div className="rounded-2xl border border-black/10 p-8">
      <div className="flex items-center justify-center gap-2">
        <span className="text-3xl font-semibold">{question.headword}</span>
        <AudioButton text={question.headword} lang={question.lang} />
      </div>
      <Ipa value={question.ipa} lang={question.lang} className="mt-1 block text-center text-black/40" />
      <p className="mt-2 text-center text-sm text-black/50">Chọn nghĩa đúng</p>

      {/* Feedback is otherwise color-only (green/red option borders), which a screen
          reader can't perceive -- announce the outcome as text here. */}
      {answered && (
        <p role="status" aria-live="polite" className="sr-only">
          {selected === question.answer ? 'Chính xác' : `Sai. Đáp án đúng là ${question.answer}`}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-2">
        {question.options.map((opt) => {
          let cls = 'border-black/10 hover:bg-black/5'
          if (answered) {
            if (opt === question.answer) cls = 'border-emerald-300 bg-emerald-50 text-emerald-800'
            else if (opt === selected) cls = 'border-rose-300 bg-rose-50 text-rose-800'
            else cls = 'border-black/10 opacity-60'
          }
          return (
            <button
              key={opt}
              type="button"
              disabled={answered}
              onClick={() => onSelect(opt)}
              className={`rounded-lg border px-4 py-3 text-left transition ${cls}`}
            >
              {opt}
            </button>
          )
        })}
      </div>

      {answered && (
        <button onClick={onNext} className="mt-6 w-full rounded-lg bg-black py-2 text-white">
          Tiếp
        </button>
      )}
    </div>
  )
}
