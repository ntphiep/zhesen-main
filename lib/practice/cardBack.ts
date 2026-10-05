import type { ReviewCard } from '@/lib/wordlist/review'
import { meaningKey } from './quiz'

const terms = (m: string) => m.split(/[,;]/).map(meaningKey).filter(Boolean)

/** The back below the meaning: the gist when it names a term the saved meaning lacks, the
 *  saved example else the learner one, and the learner's own notes. */
export function cardBack(card: ReviewCard): {
  gist: string | null
  example: { text: string; translation: string | null; byModel: boolean } | null
  notes: string | null
} {
  const known = new Set(terms(card.meaningVi ?? ''))
  const gist = card.learner?.gist ?? []
  const l = card.learner?.example
  return {
    gist: gist.some((g) => terms(g).some((k) => !known.has(k))) ? gist.join(', ') : null,
    example: card.example ? { text: card.example, translation: card.exampleTranslation, byModel: false }
      : l ? { text: l.text, translation: l.vi, byModel: l.byModel } : null,
    notes: card.notes?.trim() || null,
  }
}
