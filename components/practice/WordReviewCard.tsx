'use client'
import { AudioButton } from '@/components/ui/AudioButton'
import type { ReviewCard } from '@/lib/wordlist/review'
import type { Grade } from '@/lib/progress/types'

const GRADES: { grade: Grade; label: string; cls: string }[] = [
  { grade: 'again', label: 'Lại', cls: 'text-rose-700 border-rose-200 hover:bg-rose-50' },
  { grade: 'hard', label: 'Khó', cls: 'text-amber-700 border-amber-200 hover:bg-amber-50' },
  { grade: 'good', label: 'Tốt', cls: 'text-emerald-700 border-emerald-200 hover:bg-emerald-50' },
  { grade: 'easy', label: 'Dễ', cls: 'text-sky-700 border-sky-200 hover:bg-sky-50' },
]

export function WordReviewCard({
  card, revealed, onReveal, onGrade,
}: {
  card: ReviewCard
  revealed: boolean
  onReveal: () => void
  onGrade: (g: Grade) => void
}) {
  return (
    <div className="rounded-2xl border border-black/10 p-8 text-center">
      <div className="flex items-center justify-center gap-2">
        <span className="text-4xl font-semibold">{card.headword}</span>
        <AudioButton text={card.headword} lang={card.lang} audioUrl={card.audioUrl} />
      </div>
      {card.reading && <div className="mt-1 text-black/50">{card.reading}</div>}
      {card.ipa && <div className="ipa mt-1 text-black/40">/{card.ipa}/</div>}

      {revealed ? (
        <>
          <div className="mt-6 border-t border-black/10 pt-6">
            {card.meaningVi && <div className="text-xl">{card.meaningVi}</div>}
            {card.meaningEn && <div className="mt-1 text-sm text-black/50">{card.meaningEn}</div>}
            {card.example && (
              <div className="mt-4 text-sm">
                <span className="text-black/70">{card.example}</span>
                {card.exampleTranslation && <span className="block text-black/45">{card.exampleTranslation}</span>}
              </div>
            )}
          </div>
          <div className="mt-8 grid grid-cols-4 gap-2">
            {GRADES.map((g) => (
              <button
                key={g.grade}
                onClick={() => onGrade(g.grade)}
                className={`rounded-lg border py-2 text-sm font-medium ${g.cls}`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <button onClick={onReveal} className="mt-8 rounded-lg bg-black px-6 py-2 text-white">
          Hiện nghĩa
        </button>
      )}
    </div>
  )
}
