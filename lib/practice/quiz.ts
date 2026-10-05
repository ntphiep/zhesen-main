import type { LangCode } from '@/lib/languages'
import { shuffle, type Rand } from './shuffle'

export interface QuizWord {
  id: string
  headword: string
  ipa: string | null
  lang: LangCode
  meaningVi: string | null
  pos?: string | null
  entryId?: string | null
}

/** Vietnamese gists of the entries a learner confuses with this one, and of its synonyms. */
export interface LearnerDistractors {
  confusable: string[]
  synonym: string[]
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

/** "Nước", "Nước." and "nước" are one answer: trailing punctuation and case are dropped. */
export const meaningKey = (m: string) => m.trim().replace(/[\s\p{P}]+$/u, '').toLocaleLowerCase('vi')

const terms = (m: string) => m.split(/[,;/]/).map(meaningKey).filter(Boolean)

/** Distractors in order: same language and part of speech, the learner layer's confusables,
 *  synonyms sharing no Vietnamese term with the answer, same language, then the rest. */
export function buildQuiz(
  words: QuizWord[], count: number, rand: Rand = Math.random, learner: Map<string, LearnerDistractors> = new Map(),
): QuizQuestion[] {
  const usable = words.filter((x): x is QuizWord & { meaningVi: string } => Boolean(x.meaningVi && x.meaningVi.trim()))
  if (new Set(usable.map((x) => meaningKey(x.meaningVi))).size < MIN_DISTINCT_MEANINGS) return []
  const targets = shuffle(usable, rand).slice(0, count)
  return targets.map((t) => {
    const others = shuffle(usable.filter((x) => x.id !== t.id), rand)
    const sameLang = others.filter((x) => x.lang === t.lang)
    const extra = (t.entryId && learner.get(t.entryId)) || { confusable: [], synonym: [] }
    const answerTerms = new Set(terms(t.meaningVi))
    const distractors = [
      ...sameLang.filter((x) => t.pos && x.pos === t.pos).map((x) => x.meaningVi),
      ...extra.confusable,
      ...extra.synonym.filter((m) => !terms(m).some((k) => answerTerms.has(k))),
      ...sameLang.map((x) => x.meaningVi),
      ...others.map((x) => x.meaningVi),
    ]
      .map((m) => m.trim())
      .filter((m) => m && meaningKey(m) !== meaningKey(t.meaningVi))
      .filter((m, i, arr) => arr.findIndex((o) => meaningKey(o) === meaningKey(m)) === i) // distinct distractor texts
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
