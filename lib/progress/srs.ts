import { fsrs, createEmptyCard, Rating, State, type CardInput, type Grade as FsrsGrade } from 'ts-fsrs'
import type { CardState, Grade, SrsState } from './types'

export const DAY_MS = 86_400_000

/**
 * FSRS scheduler (ts-fsrs@5.4.2, whose default weights already implement FSRS-6 --
 * confirmed at runtime via its own `FSRSVersion` string, "v5.4.2 using FSRS-6.0").
 * `enable_short_term: false` turns off Anki-style minute-scale learning steps: the
 * wordlist reviews once per session, not several times an hour, so every card goes
 * straight to day-scale intervals (matching the granularity the old SM-2
 * implementation used).
 */
const scheduler = fsrs({ enable_short_term: false })

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

function toCardInput(s: SrsState): CardInput {
  return {
    due: s.dueAt,
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsedDays,
    scheduled_days: s.scheduledDays,
    learning_steps: s.learningSteps,
    reps: s.reps,
    lapses: s.lapses,
    state: labelToState(s.cardState),
    last_review: s.lastReviewedAt,
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

/** A brand-new card, due immediately (ts-fsrs's `createEmptyCard`). */
export function initialSrsState(vocabId: string, now: number): SrsState {
  return fromCard(vocabId, createEmptyCard(now))
}

/** Grade a card with FSRS and return its next schedule. */
export function review(state: SrsState, grade: Grade, now: number): SrsState {
  const { card } = scheduler.next(toCardInput(state), now, RATING_BY_GRADE[grade])
  return fromCard(state.vocabId, card)
}
