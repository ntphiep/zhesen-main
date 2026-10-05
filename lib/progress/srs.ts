import { fsrs, createEmptyCard, Rating, State, type CardInput, type Grade as FsrsGrade } from 'ts-fsrs'
import type { CardState, Grade, SrsState } from './types'
import { STUDY_DAY_SHIFT_MS } from '@/lib/wordlist/activity'

/**
 * FSRS scheduler (ts-fsrs@5.4.2, whose default weights implement FSRS-6 -- its own
 * `FSRSVersion` reads "v5.4.2 using FSRS-6.0"). Minute steps keep a new or failed word in the
 * session until it is answered after a gap; without them `again` then `good` two minutes
 * later scheduled 3 days at 66% predicted recall. Fuzz spreads cards graded together.
 */
const scheduler = fsrs({ enable_short_term: true, learning_steps: ['1m', '10m'], relearning_steps: ['10m'], enable_fuzz: true })

const RATING_BY_GRADE: Record<Grade, FsrsGrade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
}

// Order matches ts-fsrs's `State` enum (New=0, Learning=1, Review=2, Relearning=3).
const CARD_STATES: readonly CardState[] = ['new', 'learning', 'review', 'relearning']

function stateToLabel(s: State): CardState {
  return CARD_STATES[s]
}

function labelToState(l: CardState): State {
  return CARD_STATES.indexOf(l) as State
}

/** Encode a card state label as ts-fsrs's numeric `State` for storage. Exported so
 *  lib/wordlist/review.ts can round-trip the DB column without importing ts-fsrs. */
export function cardStateToDbValue(l: CardState): number {
  return labelToState(l)
}

/** Decode a stored numeric state back to a label. See {@link cardStateToDbValue}. */
export function cardStateFromDbValue(n: number): CardState {
  return stateToLabel(n as State)
}

// ts-fsrs counts elapsed days by UTC date; every time it sees is moved into the study-day
// frame first (`STUDY_DAY_SHIFT_MS`) and moved back after.
function toCardInput(s: SrsState): CardInput {
  return {
    due: s.dueAt + STUDY_DAY_SHIFT_MS,
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsedDays,
    scheduled_days: s.scheduledDays,
    learning_steps: s.learningSteps,
    reps: s.reps,
    lapses: s.lapses,
    state: labelToState(s.cardState),
    last_review: s.lastReviewedAt === null ? null : s.lastReviewedAt + STUDY_DAY_SHIFT_MS,
  }
}

interface FsrsCardLike {
  due: Date
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: State
  last_review?: Date
}

function fromCard(vocabId: string, card: FsrsCardLike): SrsState {
  return {
    vocabId,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    cardState: stateToLabel(card.state),
    dueAt: card.due.getTime(),
    lastReviewedAt: card.last_review ? card.last_review.getTime() : null,
  }
}

/** Whether a card is on a minute step, so the session must show it again before it ends. */
export function onStep(s: SrsState): boolean {
  return s.cardState === 'learning' || s.cardState === 'relearning'
}

/** A brand-new card, due immediately (ts-fsrs's `createEmptyCard`). */
export function initialSrsState(vocabId: string, now: number): SrsState {
  return fromCard(vocabId, createEmptyCard(now))
}

/**
 * Grade a card with FSRS and return its next schedule. `now` and the stored last-review
 * timestamp both come from a browser clock and may disagree; ts-fsrs rejects a backwards
 * delta with `Invalid delta_t "-5"`, so it gets the later of the two. The result must then
 * be shifted back by the skew, or the due date freezes where `listDueCards` never sees it.
 */
export function review(state: SrsState, grade: Grade, now: number): SrsState {
  const at = Math.max(now, state.lastReviewedAt ?? now)
  const { card } = scheduler.next(toCardInput(state), at + STUDY_DAY_SHIFT_MS, RATING_BY_GRADE[grade])
  const shifted = fromCard(state.vocabId, card)
  const next = { ...shifted, dueAt: shifted.dueAt - STUDY_DAY_SHIFT_MS, lastReviewedAt: at }
  const skew = at - now
  if (skew === 0) return next
  return { ...next, dueAt: next.dueAt - skew, lastReviewedAt: now }
}
