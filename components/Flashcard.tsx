'use client'
import type { VocabItem } from '@/lib/content/types'
import type { Grade } from '@/lib/progress/types'

const GRADES: { grade: Grade; label: string }[] = [
  { grade: 'again', label: 'Lại' },
  { grade: 'hard', label: 'Khó' },
  { grade: 'good', label: 'Tốt' },
  { grade: 'easy', label: 'Dễ' },
]

export function Flashcard({
  vocab, revealed, onReveal, onGrade,
}: {
  vocab: VocabItem
  revealed: boolean
  onReveal: () => void
  onGrade: (g: Grade) => void
}) {
  return (
    <div className="rounded-2xl border border-black/10 p-8 text-center">
      <div className="text-4xl font-semibold">{vocab.term}</div>
      {vocab.reading && <div className="mt-1 text-black/50">{vocab.reading}</div>}
      {revealed ? (
        <>
          <div className="mt-6 text-xl">{vocab.translation.vi}</div>
          <div className="mt-8 grid grid-cols-4 gap-2">
            {GRADES.map((g) => (
              <button key={g.grade} onClick={() => onGrade(g.grade)} className="rounded-lg border border-black/10 py-2 hover:bg-black/5">
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
