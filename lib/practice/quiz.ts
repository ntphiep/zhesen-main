import type { LangCode } from '@/lib/languages'
import { shuffle, type Rand } from './shuffle'

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


/**
 * Multiple-choice recall quiz over saved words: each question shows a headword and
 * asks for its meaning, with the correct Vietnamese gloss plus up to 3 distractors
 * drawn from other words. Words without a Vietnamese meaning are skipped. `rand` is
 * injectable for deterministic tests.
 */
/** Two, not four.
 *
 *  A review suggested requiring four distinct meanings so every question offers
 *  four options, but `test/practice-quiz.test.ts` already states the opposite as
 *  a deliberate choice -- fewer words should still give a question, with as many
 *  options as there are. A short wordlist getting a two-option quiz is better
 *  than being told to come back later.
 *
 *  One is the case worth blocking: a single distinct meaning renders a question
 *  whose only option is the answer, which tests nothing. QuizClient's "Chưa đủ
 *  từ" screen is the honest response, and an empty list is how it is asked for. */
const MIN_DISTINCT_MEANINGS = 2

export function buildQuiz(words: QuizWord[], count: number, rand: Rand = Math.random): QuizQuestion[] {
  const usable = words.filter((x): x is QuizWord & { meaningVi: string } => Boolean(x.meaningVi && x.meaningVi.trim()))
  if (new Set(usable.map((x) => x.meaningVi.trim())).size < MIN_DISTINCT_MEANINGS) return []
  const targets = shuffle(usable, rand).slice(0, count)
  return targets.map((t) => {
    const distractors = shuffle(
      usable.filter((x) => x.id !== t.id && x.meaningVi.trim() !== t.meaningVi.trim()),
      rand,
    )
      .map((x) => x.meaningVi.trim())
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
