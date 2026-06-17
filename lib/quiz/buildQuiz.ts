import type { VocabItem } from '@/lib/content/types'

export interface QuizQuestion {
  vocabId: string
  prompt: string
  reading?: string
  options: string[]
  answerIndex: number
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function buildQuiz(
  items: VocabItem[],
  pool: VocabItem[],
  rng: () => number = Math.random,
): QuizQuestion[] {
  return items.map((item) => {
    const correct = item.translation.vi
    const distractors = shuffle(
      pool.filter((p) => p.id !== item.id).map((p) => p.translation.vi).filter((t) => t !== correct),
      rng,
    ).slice(0, 3)
    const options = shuffle([correct, ...distractors], rng)
    return {
      vocabId: item.id,
      prompt: item.term,
      reading: item.reading,
      options,
      answerIndex: options.indexOf(correct),
    }
  })
}
