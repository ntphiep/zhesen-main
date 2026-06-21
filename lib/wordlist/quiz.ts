import type { LangCode } from '@/lib/content/types'

export interface QuizWord {
  id: string
  headword: string
  ipa: string | null
  lang: LangCode
  meaningVi: string | null
}

export interface QuizQuestion {
  id: string
  headword: string
  ipa: string | null
  lang: LangCode
  options: string[]
  answer: string
}

type Rand = () => number

function shuffle<T>(arr: T[], rand: Rand): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Multiple-choice recall quiz over saved words: each question shows a headword and
 * asks for its meaning, with the correct Vietnamese gloss plus up to 3 distractors
 * drawn from other words. Words without a Vietnamese meaning are skipped. `rand` is
 * injectable for deterministic tests.
 */
export function buildQuiz(words: QuizWord[], count: number, rand: Rand = Math.random): QuizQuestion[] {
  const usable = words.filter((x): x is QuizWord & { meaningVi: string } => Boolean(x.meaningVi && x.meaningVi.trim()))
  const targets = shuffle(usable, rand).slice(0, count)
  return targets.map((t) => {
    const distractors = shuffle(
      usable.filter((x) => x.id !== t.id && x.meaningVi !== t.meaningVi),
      rand,
    )
      .map((x) => x.meaningVi)
      .filter((m, i, arr) => arr.indexOf(m) === i) // distinct distractor texts
      .slice(0, 3)
    return {
      id: t.id,
      headword: t.headword,
      ipa: t.ipa,
      lang: t.lang,
      options: shuffle([t.meaningVi, ...distractors], rand),
      answer: t.meaningVi,
    }
  })
}
